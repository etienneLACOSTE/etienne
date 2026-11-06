const fs = require('fs');
let code = fs.readFileSync('script.js', 'utf8');

code = code.replace(/const app = \{[\s\S]*?\};\s*const engine/g, 'const app = {botDifficulty: "master", botTryUseSpell: ()=>{}}; const engine');

const prefix = `
let window = { addEventListener: () => {} };
let document = { 
    getElementById: () => ({ value: 'master', addEventListener: ()=>{} }), 
    querySelectorAll: () => ([]),
    querySelector: () => ({ classList: { add: ()=>{}, remove: ()=>{} } }),
    addEventListener: () => {} 
};
let io = () => ({ on: () => {}, emit: () => {} });
const Audio = class { play(){} };
let isOnline = false;
let currentRoomCode = null;
let myPlayerColor = 'white';
let p1Deck = [];
let p2Deck = [];
`;

eval(prefix + code);

engine.initBoard();
engine.turn = 'black';
initZobrist();

engine.transpositionTable.clear();
engine.historyTable = {};

let maxEval = -Infinity;
let bestMove = null;
let alpha = -Infinity;
let beta = Infinity;

const color = 'black';
let allMoves = [];
for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
        if (engine.board[r][c] && engine.getColor(engine.board[r][c]) === color) {
            const oldTurn = engine.turn;
            engine.turn = color;
            let moves = engine.getValidMoves(r, c);
            engine.turn = oldTurn;
            moves.forEach(m => allMoves.push({from: {r, c}, to: m, isSniper: m.isSniper}));
        }
    }
}

const depths = { 'novice': 2, 'apprentice': 3, 'expert': 4, 'master': 5 };
let depth = 5;

for (let move of allMoves) {
    let target = engine.makeVirtualMove(move);
    let ev = engine.minimax(depth - 1, alpha, beta, false);
    engine.undoVirtualMove(move, target);
    
    const cols = ['a','b','c','d','e','f','g','h'];
    const algebraic = cols[move.from.c] + (8-move.from.r) + cols[move.to.c] + (8-move.to.r);
    
    console.log(algebraic + " : " + ev);
    
    if (ev > maxEval) {
        maxEval = ev;
        bestMove = algebraic;
    }
}
console.log("BEST:", bestMove, "EVAL:", maxEval);
