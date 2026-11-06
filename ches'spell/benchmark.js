const fs = require('fs');
const { execSync } = require('child_process');
const startTime = Date.now();
execSync('node train_spells.js --benchmark'); 
// Actually we can just time one game by injecting a script or just timing the first generation of a 2-bot population.
