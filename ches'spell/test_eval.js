const fs = require('fs');
const code = fs.readFileSync("/home/cos/Documents/etienne/ches'spell/script.js", 'utf-8');

let logs = [];
const console = { log: (msg) => logs.push(msg), error: (msg) => logs.push("ERR: " + msg) };

try {
    eval(code + `
    app.init();
    // Setup a starting board for black's turn
    engine.init(false); // regular game
    engine.turn = 'black';
    app.isBotGame = true;
    
    // Evaluate e5
    engine.board[1][4] = null; // e7 empty
    engine.board[3][4] = 'p'; // e5
    let score_e5 = app.evaluateBoard();
    
    // Evaluate Nc6
    engine.board[1][4] = 'p'; // restore e7
    engine.board[3][4] = null; 
    engine.board[0][1] = null; // b8 empty
    engine.board[2][2] = 'n'; // c6
    let score_nc6 = app.evaluateBoard();
    
    // Evaluate just a random pawn push (a6)
    engine.board[0][1] = 'n'; // restore b8
    engine.board[2][2] = null;
    engine.board[1][0] = null; // a7 empty
    engine.board[2][0] = 'p'; // a6
    let score_a6 = app.evaluateBoard();
    
    logs.push("e5 score: " + score_e5);
    logs.push("Nc6 score: " + score_nc6);
    logs.push("a6 score: " + score_a6);
    
    fs.writeFileSync('/tmp/test_eval.txt', logs.join('\\n'));
    `);
} catch (e) {
    fs.writeFileSync('/tmp/test_eval.txt', "ERROR: " + e.stack);
}
