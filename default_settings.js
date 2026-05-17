

const DefaultSettings = {

  state: {
    isExtensionEnabled: true,
    showArrow: true,
    showOpponentMoves: false,
    showText: true,
    showEvalBar: true,
    textColor: '#ffffff',
    arrowOpacity: 80,
    depth: 9,
    lines: 3,
    autoPilot: false,
    autoPilotSpeed: 5,
    arrowColors: [
      '#ff0000', '#ff8800', '#ffff00', '#00ff00', '#00ffff', 
      '#0000ff', '#8800ff', '#ff00ff', '#ffffff', '#aaaaaa'
    ]
  },


  sliders: {
    depth:   { min: 5,  max: 14 }, 
    lines:   { min: 1,  max: 10 },  
    speed:   { min: 1,  max: 10 },
    opacity: { min: 0, max: 100 }
  },

  speedDelays: {
    1: { min: 1500, max: 2500 },
    2: { min: 1200, max: 2000 },
    3: { min: 900,  max: 1500 },
    4: { min: 700,  max: 1200 },
    5: { min: 500,  max: 900 },
    6: { min: 350,  max: 600 },
    7: { min: 200,  max: 400 },
    8: { min: 100,  max: 250 },
    9: { min: 50,   max: 150 },
    10:{ min: 10,   max: 50 }
  }
};