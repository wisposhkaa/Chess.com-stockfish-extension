document.addEventListener('DOMContentLoaded', () => {
  const mainToggle = document.getElementById('mainToggle');
  const showArrow = document.getElementById('showArrow');
  const showOpponentMoves = document.getElementById('showOpponentMoves');
  const showText = document.getElementById('showText');
  const showEvalBar = document.getElementById('showEvalBar');
  const textColor = document.getElementById('textColor');
  const opacitySlider = document.getElementById('opacitySlider');
  const opacityVal = document.getElementById('opacityVal');
  const depthSlider = document.getElementById('depthSlider');
  const depthVal = document.getElementById('depthVal');
  const linesSlider = document.getElementById('linesSlider');
  const linesVal = document.getElementById('linesVal');
  const autoPilotToggle = document.getElementById('autoPilotToggle');
  const speedSlider = document.getElementById('speedSlider');
  const speedVal = document.getElementById('speedVal');
  const reloadBtn = document.getElementById('reloadBtn');


  if (depthSlider) {
    depthSlider.min = DefaultSettings.sliders.depth.min;
    depthSlider.max = DefaultSettings.sliders.depth.max;
  }
  if (linesSlider) {
    linesSlider.min = DefaultSettings.sliders.lines.min;
    linesSlider.max = DefaultSettings.sliders.lines.max;
  }
  if (speedSlider) {
    speedSlider.min = DefaultSettings.sliders.speed.min;
    speedSlider.max = DefaultSettings.sliders.speed.max;
  }
  if (opacitySlider) {
    opacitySlider.min = DefaultSettings.sliders.opacity.min;
    opacitySlider.max = DefaultSettings.sliders.opacity.max;
  }


  chrome.storage.local.get(['chessSettings'], (result) => {
    const s = result.chessSettings || DefaultSettings.state;
    
    if (mainToggle) {
      if (!s.isExtensionEnabled) {
        mainToggle.classList.add('off');
        mainToggle.textContent = 'Disabled';
      } else {
        mainToggle.textContent = 'Enabled';
      }
    }

    if (showArrow) showArrow.checked = s.showArrow !== false;
    if (showOpponentMoves) showOpponentMoves.checked = s.showOpponentMoves === true;
    if (showText) showText.checked = s.showText !== false;
    if (showEvalBar) showEvalBar.checked = s.showEvalBar !== false;
    if (textColor) textColor.value = s.textColor || DefaultSettings.state.textColor;
    if (autoPilotToggle) autoPilotToggle.checked = s.autoPilot === true;

    if (speedSlider) { speedSlider.value = s.autoPilotSpeed || DefaultSettings.state.autoPilotSpeed; if(speedVal) speedVal.textContent = speedSlider.value; }
    if (opacitySlider) { opacitySlider.value = s.arrowOpacity || DefaultSettings.state.arrowOpacity; if(opacityVal) opacityVal.textContent = opacitySlider.value + '%'; }
    if (depthSlider) { depthSlider.value = s.depth || DefaultSettings.state.depth; if(depthVal) depthVal.textContent = depthSlider.value; }
    if (linesSlider) { linesSlider.value = s.lines || DefaultSettings.state.lines; if(linesVal) linesVal.textContent = linesSlider.value; }

    const colors = s.arrowColors || DefaultSettings.state.arrowColors;
    for (let i = 1; i <= 10; i++) {
      const cInput = document.getElementById('color' + i);
      if (cInput) cInput.value = colors[i - 1] || DefaultSettings.state.arrowColors[i - 1];
    }
  });

  function saveSettings() {
    const newColors = [];
    for (let i = 1; i <= 10; i++) {
      const cInput = document.getElementById('color' + i);
      newColors.push(cInput ? cInput.value : DefaultSettings.state.arrowColors[i - 1]);
    }

    chrome.storage.local.set({ chessSettings: {
      isExtensionEnabled: mainToggle ? !mainToggle.classList.contains('off') : true,
      showArrow: showArrow ? showArrow.checked : true,
      showOpponentMoves: showOpponentMoves ? showOpponentMoves.checked : false,
      showText: showText ? showText.checked : true,
      showEvalBar: showEvalBar ? showEvalBar.checked : true,
      textColor: textColor ? textColor.value : DefaultSettings.state.textColor,
      arrowOpacity: opacitySlider ? parseInt(opacitySlider.value, 10) : DefaultSettings.state.arrowOpacity,
      depth: depthSlider ? parseInt(depthSlider.value, 10) : DefaultSettings.state.depth,
      lines: linesSlider ? parseInt(linesSlider.value, 10) : DefaultSettings.state.lines,
      autoPilot: autoPilotToggle ? autoPilotToggle.checked : false,
      autoPilotSpeed: speedSlider ? parseInt(speedSlider.value, 10) : DefaultSettings.state.autoPilotSpeed,
      arrowColors: newColors
    }});
  }

  if (depthSlider) {
    depthSlider.addEventListener('input', () => { if (depthVal) depthVal.textContent = depthSlider.value; });
    depthSlider.addEventListener('change', saveSettings);
  }
  if (linesSlider) {
    linesSlider.addEventListener('input', () => { if (linesVal) linesVal.textContent = linesSlider.value; });
    linesSlider.addEventListener('change', saveSettings);
  }

  if (opacitySlider) opacitySlider.addEventListener('input', () => {
    if (opacityVal) opacityVal.textContent = opacitySlider.value + '%';
    saveSettings();
  });
  if (speedSlider) speedSlider.addEventListener('input', () => {
    if (speedVal) speedVal.textContent = speedSlider.value;
    saveSettings();
  });

  for (let i = 1; i <= 10; i++) {
    const cInput = document.getElementById('color' + i);
    if (cInput) cInput.addEventListener('input', saveSettings);
  }

  if (textColor) textColor.addEventListener('input', saveSettings);

  [showArrow, showOpponentMoves, showText, showEvalBar, autoPilotToggle].forEach(el => {
    if (el) el.addEventListener('change', saveSettings);
  });

  if (mainToggle) {
    mainToggle.addEventListener('click', () => { 
      mainToggle.classList.toggle('off'); 
      mainToggle.textContent = mainToggle.classList.contains('off') ? 'Disabled' : 'Enabled';
      saveSettings(); 
    });
  }

  if (reloadBtn) reloadBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: "FORCE_RELOAD" });
    });
  });
});