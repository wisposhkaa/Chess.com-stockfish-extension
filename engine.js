try {

  let engine = new Worker('stockfish.js');


  engine.onmessage = function(event) {

    window.parent.postMessage({ type: 'FROM_ENGINE', data: event.data }, '*');
  };

  engine.onerror = function(err) {
    console.error("[Iframe] :", err.message);
  };

  window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'TO_ENGINE') {
      engine.postMessage(event.data.command);
    }
  });

  window.parent.postMessage({ type: 'FROM_ENGINE', data: 'IFRAME_READY' }, '*');

} catch (e) {
  console.error("[Iframe] :", e);
}