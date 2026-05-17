
const DEBUG = false; 
const DEBOUNCE_DELAY = 50; 

let knownMoveCount = -1;
let knownPlayerColor = null; 
let debounceTimer = null;
let lastApiData = null; 
let autoPilotTimer = null;
let lastPlayedMoveCount = -1; 
let isMoving = false; 
let currentTopMoves = [];

let engineFrame = null;
let isEngineReady = false;
let currentFen = "";
let currentEval = null;
let currentMate = null;


let settings = { ...DefaultSettings.state };

function log(...args) {
  if (DEBUG) console.log("%c[Chess Logger]", "color: #b58863; font-weight: bold; background: #262421; padding: 2px 4px; border-radius: 3px;", ...args);
}


chrome.storage.onChanged.addListener((changes) => {
  if (changes.chessSettings) {
    const oldSettings = settings; 
    settings = changes.chessSettings.newValue;
    
    if (!settings.isExtensionEnabled) {
      cleanUpUI();
      sendToEngine('stop');
    } else {
      reRenderUI(); 
      
      if (!oldSettings.isExtensionEnabled || oldSettings.depth !== settings.depth || oldSettings.lines !== settings.lines) {
        cleanUpUI();
        lastApiData = null;
        currentTopMoves = [];
        knownMoveCount = -1; 
        sendToEngine('stop');
      }

      if (!oldSettings.autoPilot && settings.autoPilot) {
        if (lastApiData && lastApiData.isPlayerTurn && lastApiData.moves && lastApiData.moves.length > 0) {
          triggerAutoPilot(true); 
        }
      }
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "FORCE_RELOAD") {
    cleanUpUI(); 
    knownMoveCount = -1; 
    lastPlayedMoveCount = -1;     
    clearTimeout(autoPilotTimer); 
    isMoving = false;             
    knownPlayerColor = null;
    lastApiData = null; 
    currentTopMoves = [];
    sendToEngine('stop');
    sendToEngine('ucinewgame');
    handleMovesUpdate();
  }
});

function initEngine() {
  if (engineFrame) return;
  engineFrame = document.createElement('iframe');
  engineFrame.src = chrome.runtime.getURL('engine.html');
  engineFrame.style.display = 'none';
  document.body.appendChild(engineFrame);

  window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'FROM_ENGINE') {
      handleEngineMessage(event.data.data);
    }
  });
}

function sendToEngine(command) {
  if (isEngineReady && engineFrame && engineFrame.contentWindow) {
    engineFrame.contentWindow.postMessage({ type: 'TO_ENGINE', command: command }, '*');
  }
}

function handleEngineMessage(line) {
  if (line === 'IFRAME_READY') { isEngineReady = true; sendToEngine('uci'); return; }
  if (line === 'uciok') { sendToEngine('setoption name Hash value 64'); sendToEngine('isready'); }

  if (line.includes('info') && line.includes('multipv') && line.includes(' pv ')) {
    const mpvMatch = line.match(/multipv (\d+)/);
    const pvMatch = line.match(/ pv ([a-h][1-8][a-h][1-8][qrbn]?)/);
    const cpMatch = line.match(/score cp (-?\d+)/);
    const mateMatch = line.match(/score mate (-?\d+)/);

    if (mpvMatch && pvMatch) {
      const mpvIndex = parseInt(mpvMatch[1], 10) - 1; 
      let evalScore = null;
      let mateScore = null;
      
      if (mateMatch) mateScore = parseInt(mateMatch[1], 10);
      else if (cpMatch) evalScore = parseInt(cpMatch[1], 10) / 100;

      currentTopMoves[mpvIndex] = { uci: pvMatch[1], eval: evalScore, mate: mateScore };
    }
  }
  
  if (line.startsWith('bestmove')) {
    processEngineResult();
  }
}

function analyzePosition(fen) {
  if (!engineFrame) initEngine();
  
  currentFen = fen;
  currentTopMoves = []; 
  
  if (isEngineReady) {
    const depth = settings.depth || DefaultSettings.state.depth; 
    const lines = settings.lines || DefaultSettings.state.lines;
    sendToEngine('stop'); 
    sendToEngine('setoption name MultiPV value ' + lines);
    sendToEngine('position fen ' + fen);
    sendToEngine('go depth ' + depth);
  } else {
    setTimeout(() => analyzePosition(fen), 100);
  }
}

function processEngineResult() {
  if (currentTopMoves.length === 0) return;

  const isBlack = currentFen.includes(' b ');
  const tempGame = new Chess(currentFen);
  const isPlayerTurn = (tempGame.turn() === knownPlayerColor);

  const parsedMoves = currentTopMoves.filter(m => m !== undefined).map(m => {
    let fromSq = m.uci.substring(0, 2);
    let toSq = m.uci.substring(2, 4);
    let promo = m.uci.length === 5 ? m.uci[4] : undefined;
    let san = m.uci;

    try {
      const g = new Chess(currentFen);
      const moveObj = g.move({ from: fromSq, to: toSq, promotion: promo });
      if (moveObj) san = moveObj.san;
    } catch (e) {}

    let finalEval = m.eval;
    let finalMate = m.mate;
    if (isBlack) {
      if (finalEval !== null) finalEval = -finalEval;
      if (finalMate !== null) finalMate = -finalMate;
    }

    return { uci: m.uci, from: fromSq, to: toSq, promo: promo, san: san, eval: finalEval, mate: finalMate };
  });

  lastApiData = { moves: parsedMoves, isPlayerTurn: isPlayerTurn };
  reRenderUI();

  if (settings.autoPilot && isPlayerTurn && parsedMoves.length > 0) {
    triggerAutoPilot(); 
  }
}

function triggerAutoPilot(force = false) {
  if (!settings.autoPilot || !settings.isExtensionEnabled) return;
  
  if (!force && knownMoveCount === lastPlayedMoveCount) return; 
  if (!lastApiData || !lastApiData.moves || lastApiData.moves.length === 0) return;
  
  lastPlayedMoveCount = knownMoveCount;
  clearTimeout(autoPilotTimer);
  
  const speed = settings.autoPilotSpeed || DefaultSettings.state.autoPilotSpeed;
  const speedDelays = DefaultSettings.speedDelays;
  
  const range = speedDelays[speed] || speedDelays[5];
  const thinkingTime = Math.floor(Math.random() * (range.max - range.min)) + range.min;
  
  autoPilotTimer = setTimeout(() => {
    if (settings.autoPilot && settings.isExtensionEnabled && knownMoveCount === lastPlayedMoveCount) {
      const bestMove = lastApiData.moves[0]; 
      ultraHumanMove(bestMove.from, bestMove.to, bestMove.promo);
    }
  }, thinkingTime);
}

function removeArrow() {
  document.querySelectorAll('#logger-arrow-overlay').forEach(el => el.remove());
}

function cleanUpUI() {
  removeArrow();
  document.querySelectorAll('#logger-eval-container').forEach(el => el.remove());
}

function reRenderUI() {
  if (!settings.isExtensionEnabled) { cleanUpUI(); return; }
  
  if (lastApiData && lastApiData.moves && lastApiData.moves.length > 0) {
    const bestMove = lastApiData.moves[0]; 
    
    if (settings.showEvalBar) updateEvalBar(bestMove.eval, bestMove.mate);
    else {
      document.querySelectorAll('#logger-eval-container').forEach(el => el.remove());
    }
    
    const canShowArrows = lastApiData.isPlayerTurn || settings.showOpponentMoves;
    if (settings.showArrow && canShowArrows) {
      drawAllArrows(lastApiData.moves); 
    } else {
      removeArrow();
    }
  }
}

function drawAllArrows(moves) {
  const board = document.querySelector('chess-board') || document.querySelector('.board');
  if (!board) return;

  removeArrow();

  const opacityBase = (settings.arrowOpacity !== undefined ? settings.arrowOpacity : DefaultSettings.state.arrowOpacity) / 100;
  const isFlipped = board.classList.contains('flipped') || board.hasAttribute('flipped');
  const defaultColors = DefaultSettings.state.arrowColors;
  const currentColors = settings.arrowColors || defaultColors;

  const getCoords = (sq) => {
    const fileIndex = sq.charCodeAt(0) - 96;
    const rankIndex = parseInt(sq[1]);       
    let x = (fileIndex - 1) * 12.5 + 6.25;
    let y = (8 - rankIndex) * 12.5 + 6.25;
    if (isFlipped) {
      x = (8 - fileIndex) * 12.5 + 6.25;
      y = (rankIndex - 1) * 12.5 + 6.25;
    }
    return { x, y };
  };

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.id = 'logger-arrow-overlay';
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.style.position = 'absolute'; svg.style.top = '0'; svg.style.left = '0';
  svg.style.width = '100%'; svg.style.height = '100%';
  svg.style.pointerEvents = 'none'; svg.style.zIndex = '999';

  for (let i = moves.length - 1; i >= 0; i--) {
    const move = moves[i];
    const start = getCoords(move.from);
    let end = getCoords(move.to);

    const dx = end.x - start.x; const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const shortenBy = 4;
    if (length > shortenBy) { end.x -= (dx / length) * shortenBy; end.y -= (dy / length) * shortenBy; }

    const strokeWidth = "1.8"; 
    const arrowOp = opacityBase; 
    const strokeColor = currentColors[i] || defaultColors[i]; 

    const defs = document.createElementNS(svgNS, "defs");
    const marker = document.createElementNS(svgNS, "marker");
    marker.setAttribute("id", "arrowhead-" + i);
    marker.setAttribute("markerWidth", "3"); marker.setAttribute("markerHeight", "3");
    marker.setAttribute("refX", "1.5"); marker.setAttribute("refY", "1.5");
    marker.setAttribute("orient", "auto-start-reverse");

    const polygon = document.createElementNS(svgNS, "polygon");
    polygon.setAttribute("points", "0 0, 3 1.5, 0 3");
    polygon.setAttribute("fill", strokeColor); 
    polygon.setAttribute("opacity", arrowOp);
    marker.appendChild(polygon); defs.appendChild(marker); svg.appendChild(defs);

    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", start.x); line.setAttribute("y1", start.y);
    line.setAttribute("x2", end.x); line.setAttribute("y2", end.y);
    line.setAttribute("stroke", strokeColor); 
    line.setAttribute("stroke-width", strokeWidth); 
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("opacity", arrowOp);
    line.setAttribute("marker-end", `url(#arrowhead-${i})`);
    svg.appendChild(line);

    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;

    const circle = document.createElementNS(svgNS, "circle");
    circle.setAttribute("cx", midX);
    circle.setAttribute("cy", midY);
    circle.setAttribute("r", "2.2");
    circle.setAttribute("fill", strokeColor);
    circle.setAttribute("opacity", arrowOp);
    svg.appendChild(circle);

    const rankText = document.createElementNS(svgNS, "text");
    rankText.setAttribute("x", midX);
    rankText.setAttribute("y", midY + 0.8);
    rankText.setAttribute("text-anchor", "middle");
    rankText.setAttribute("font-family", "Arial, sans-serif");
    rankText.setAttribute("font-size", "2.2");
    rankText.setAttribute("font-weight", "900");
    rankText.setAttribute("fill", "#ffffff"); 
    rankText.style.textShadow = "0px 0px 2px rgba(0,0,0,1)";
    rankText.setAttribute("opacity", Math.min(1, arrowOp + 0.5));
    rankText.textContent = String(i + 1);
    svg.appendChild(rankText);

    if (settings.showText) {
      const textEl = document.createElementNS(svgNS, "text");
      textEl.setAttribute("x", end.x);
      textEl.setAttribute("y", end.y - 1.5 + (i * 2.2)); 
      textEl.setAttribute("text-anchor", "middle");
      textEl.setAttribute("font-family", "Arial, sans-serif");
      textEl.setAttribute("font-size", "2.2");
      textEl.setAttribute("font-weight", "900");
      textEl.setAttribute("fill", settings.textColor || DefaultSettings.state.textColor); 
      textEl.style.textShadow = "0px 0px 1.5px rgba(0,0,0,1), 0px 0px 1px rgba(0,0,0,1)";
      textEl.setAttribute("opacity", Math.min(1, arrowOp + 0.3)); 
      textEl.textContent = move.san;
      svg.appendChild(textEl);
    }
  }
  board.appendChild(svg);
}

function getPlayerColor() {
  const board = document.querySelector('chess-board') || document.querySelector('.board');
  if (!board) return 'w'; 
  const isFlipped = board.classList.contains('flipped') || board.hasAttribute('flipped');
  return isFlipped ? 'b' : 'w';
}

function handleMovesUpdate() {
  const moveListContainer = document.querySelector('wc-simple-move-list') || document.querySelector('#live-game-tab-scroll-container');
  if (!moveListContainer) return;
  const sanMoves = extractCleanMoves(moveListContainer);
  const game = getGameFromMoves(sanMoves);
  if (game) analyzePosition(game.fen());
}

function extractCleanMoves(container) {
  const nodes = container.querySelectorAll('.node.main-line-ply');
  const pureMoves = [];
  nodes.forEach(node => {
    const parsed = parseNodeText(node);
    if (parsed) pureMoves.push(parsed);
  });
  return pureMoves;
}

function parseNodeText(nodeElement) {
  let sanText = "";
  function extract(node) {
    if (node.nodeType === 3) sanText += node.nodeValue;
    else if (node.nodeType === 1) {
      if (node.hasAttribute('data-figurine')) sanText += node.getAttribute('data-figurine');
      node.childNodes.forEach(extract);
    }
  }
  extract(nodeElement);
  sanText = sanText.replace(/\s+/g, '');
  if (sanText.includes('=')) {
    const parts = sanText.split('=');
    let baseMove = parts[0].replace(/[^a-h1-8x]/g, ''); 
    let promChar = parts[1].replace(/[^a-zA-ZА-Яа-яЁё]/g, '').charAt(0).toUpperCase();
    let promPiece = 'Q'; 
    if (['R', 'Л', 'T', 'W'].includes(promChar)) promPiece = 'R'; 
    else if (['B', 'С', 'A', 'F', 'L', 'G'].includes(promChar)) promPiece = 'B'; 
    else if (['N', 'К', 'C', 'S', 'P'].includes(promChar)) promPiece = 'N'; 
    sanText = baseMove + '=' + promPiece;
    if (parts[1].includes('+')) sanText += '+';
    if (parts[1].includes('#')) sanText += '#';
  } else {
    sanText = sanText.replace(/[^a-h1-8KQRBNxO0\+\#\-]/g, '');
  }
  return sanText.replace(/0/g, 'O'); 
}

function getGameFromMoves(moves) {
  try {
    const game = new Chess();
    for (let i = 0; i < moves.length; i++) if (game.move(moves[i]) === null) return null;
    return game;
  } catch (error) { return null; }
}

function updateEvalBar(evaluation, mate) {
  const moveListContainer = document.querySelector('wc-simple-move-list') || document.querySelector('#live-game-tab-scroll-container');
  if (!moveListContainer) return;

  let evalContainer = document.getElementById('logger-eval-container');
  if (!evalContainer) {
    evalContainer = document.createElement('div');
    evalContainer.id = 'logger-eval-container';
    evalContainer.style.position = 'sticky'; evalContainer.style.top = '0px'; evalContainer.style.zIndex = '100'; 
    evalContainer.style.width = 'calc(100% - 16px)'; evalContainer.style.height = '24px';
    evalContainer.style.backgroundColor = '#302e2b'; evalContainer.style.margin = '8px';
    evalContainer.style.borderRadius = '4px'; evalContainer.style.overflow = 'hidden';
    evalContainer.style.display = 'flex'; evalContainer.style.flexShrink = '0';
    evalContainer.style.boxShadow = 'inset 0 0 4px rgba(0,0,0,0.8), 0 4px 8px rgba(0,0,0,0.3)';
    
    const whiteFill = document.createElement('div');
    whiteFill.id = 'logger-eval-fill';
    whiteFill.style.height = '100%'; whiteFill.style.backgroundColor = '#fff'; 
    whiteFill.style.transition = 'width 0.2s ease-in-out'; whiteFill.style.width = '50%'; 

    const evalText = document.createElement('div');
    evalText.id = 'logger-eval-text';
    evalText.style.position = 'absolute'; evalText.style.width = '100%'; evalText.style.height = '100%';
    evalText.style.display = 'flex'; evalText.style.alignItems = 'center'; evalText.style.justifyContent = 'center';
    evalText.style.fontSize = '12px'; evalText.style.fontWeight = 'bold';
    evalText.style.fontFamily = 'monospace'; evalText.style.color = '#fff';
    evalText.style.textShadow = '0px 0px 2px #000, 0px 0px 5px #000'; evalText.style.zIndex = '2';
    
    evalContainer.appendChild(whiteFill); evalContainer.appendChild(evalText);
    moveListContainer.parentNode.insertBefore(evalContainer, moveListContainer);
  }

  const fillEl = document.getElementById('logger-eval-fill');
  const textEl = document.getElementById('logger-eval-text');
  let whitePercentage = 50; let displayText = "0.0";

  if (mate !== null) {
    if (mate > 0) { whitePercentage = 100; displayText = `M${mate}`; } 
    else if (mate < 0) { whitePercentage = 0; displayText = `M${Math.abs(mate)}`; } 
    else { displayText = "M0"; whitePercentage = knownPlayerColor === 'w' ? 0 : 100; }
  } else if (evaluation !== null) {
    displayText = evaluation > 0 ? `+${evaluation}` : `${evaluation}`;
    whitePercentage = 50 + (evaluation * 8);
    if (whitePercentage > 95) whitePercentage = 95;
    if (whitePercentage < 5) whitePercentage = 5;
  }

  fillEl.style.width = `${whitePercentage}%`; textEl.textContent = displayText;
}

setInterval(() => {
  if (!settings.isExtensionEnabled) return; 
  
  const moveListContainer = document.querySelector('wc-simple-move-list') || document.querySelector('#live-game-tab-scroll-container');
  const board = document.querySelector('chess-board') || document.querySelector('.board');
  
  if (moveListContainer && board) {
    const nodes = moveListContainer.querySelectorAll('.node.main-line-ply');
    const currentColor = getPlayerColor();
    
    if (nodes.length !== knownMoveCount || currentColor !== knownPlayerColor) {
      knownMoveCount = nodes.length;
      knownPlayerColor = currentColor;
      
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => handleMovesUpdate(), DEBOUNCE_DELAY);
      
    } else if (lastApiData) {
      const isEvalMissing = settings.showEvalBar && !document.getElementById('logger-eval-container');
      const canShowArrows = lastApiData.isPlayerTurn || settings.showOpponentMoves;
      const isArrowMissing = settings.showArrow && canShowArrows && lastApiData.moves && lastApiData.moves.length > 0 && !document.getElementById('logger-arrow-overlay');
      if (isEvalMissing || isArrowMissing) reRenderUI();
    }
  } else {
    if (knownMoveCount !== -1) {
      cleanUpUI(); 
      knownMoveCount = -1; 
      lastPlayedMoveCount = -1;     
      clearTimeout(autoPilotTimer); 
      isMoving = false;             
      knownPlayerColor = null;
      lastApiData = null;
      sendToEngine('stop'); 
    }
  }
}, 100);


async function ultraHumanMove(from, to, promotionChar) { 
  if (isMoving) return; 
  isMoving = true;

  const board = document.querySelector('chess-board') || document.querySelector('.board');
  if (!board) { isMoving = false; return; }

  const rect = board.getBoundingClientRect();
  const squareSize = rect.width / 8;
  const isFlipped = board.classList.contains('flipped') || board.hasAttribute('flipped');

  const getCoords = (sq) => {
    const file = sq.charCodeAt(0) - 96; 
    const rank = parseInt(sq[1]);
    const xNum = isFlipped ? (9 - file) : file;
    const yNum = isFlipped ? rank : (9 - rank);
    const jitter = squareSize * 0.12; 
    return {
      x: rect.left + (xNum - 0.5) * squareSize + (Math.random() * jitter * 2 - jitter),
      y: rect.top + (yNum - 0.5) * squareSize + (Math.random() * jitter * 2 - jitter)
    };
  };

  const start = getCoords(from);
  const end = getCoords(to);
  
  const controlPoint = {
    x: (start.x + end.x) / 2 + (Math.random() * 100 - 50),
    y: (start.y + end.y) / 2 + (Math.random() * 100 - 50)
  };

  const speed = settings.autoPilotSpeed || DefaultSettings.state.autoPilotSpeed;

  board.dispatchEvent(createPointerEvent('pointerdown', start.x, start.y));
  await sleep(Math.random() * (150 / speed) + 20);

  const steps = Math.max(3, 20 - (speed * 1.5)) + Math.floor(Math.random() * 4); 
  const sleepTime = Math.max(1, 12 - speed);

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const tAdjusted = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const nx = (1 - tAdjusted) * (1 - tAdjusted) * start.x + 2 * (1 - tAdjusted) * tAdjusted * controlPoint.x + tAdjusted * tAdjusted * end.x;
    const ny = (1 - tAdjusted) * (1 - tAdjusted) * start.y + 2 * (1 - tAdjusted) * tAdjusted * controlPoint.y + tAdjusted * tAdjusted * end.y;
    board.dispatchEvent(createPointerEvent('pointermove', nx, ny));
    await sleep(Math.random() * sleepTime + sleepTime / 2);
  }

  const dropDelay = Math.max(10, 80 - (speed * 7)); 
  await sleep(Math.random() * dropDelay + 20);
  board.dispatchEvent(createPointerEvent('pointerup', end.x, end.y));

  if (promotionChar) {
    for (let i = 0; i < 15; i++) {
      await sleep(50);
      const promoWindow = document.querySelector('.promotion-window.promotion-window--visible');
      if (promoWindow) {
        const colorPrefix = knownPlayerColor || 'w'; 
        const pieceClass = colorPrefix + promotionChar.toLowerCase(); 
        const pieceEl = promoWindow.querySelector(`.promotion-piece.${pieceClass}`);
        if (pieceEl) {
          const pRect = pieceEl.getBoundingClientRect();
          const px = pRect.left + pRect.width / 2;
          const py = pRect.top + pRect.height / 2;
          await sleep(Math.random() * (600 / speed) + 50);
          pieceEl.dispatchEvent(createPointerEvent('pointerdown', px, py));
          await sleep(Math.random() * 30 + 20);
          pieceEl.dispatchEvent(createPointerEvent('pointerup', px, py));
        }
        break; 
      }
    }
  }
  isMoving = false; 
}

function createPointerEvent(type, x, y) {
  return new PointerEvent(type, {
    bubbles: true, view: window, clientX: x, clientY: y,
    pointerId: 1, isPrimary: true, pressure: type === 'pointerup' ? 0 : 0.5
  });
}

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }