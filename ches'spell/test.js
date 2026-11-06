const fs = require('fs');
const code = fs.readFileSync("/home/cos/Documents/etienne/ches'spell/script.js", 'utf-8');

// VERY basic sandbox to catch immediate syntax/reference errors in minimax or botTryUseSpell
let logs = [];
const console = { log: (msg) => logs.push(msg), error: (msg, err) => logs.push(msg + " " + (err ? err.message : '')) };

try {
    eval(code + `
    app.init();
    app.startDemo(); // sets up the board
    // skip demo steps
    demoStep = 3; 
    engine.turn = 'black'; // force bot's turn
    app.isBotGame = true;
    app.playBotTurn();
    
    setTimeout(() => {
        fs.writeFileSync('/tmp/test_output.txt', logs.join('\\n'));
    }, 1000);
    `);
} catch (e) {
    fs.writeFileSync('/tmp/test_output.txt', "ERROR: " + e.stack);
}
