const fs = require('fs');

const ROWS = 12;
const COLS = 8;
let board = Array(ROWS).fill(null).map(() => Array(COLS).fill(null));

const PIECES = { 'p': { value: 1 }, 'n': { value: 3 }, 'b': { value: 3 }, 'r': { value: 5 }, 'q': { value: 9 }, 'k': { value: 0 } };
const botProfile = { depth: 5, pieceWeights: { 'p': 73, 'n': 491, 'b': 360, 'r': 252, 'q': 817, 'k': 10000 }, centerBonusCols: 12, centerBonusRows: 48, pawnForwardBonus: 0, touchdownBonus: 1695 };
let lastMove = null;

// VERY simple mock board where User CAN attack the King in 2 moves, and Bot MUST respond.
board[2][4] = { type: 'k', player: 2, hasMoved: false };
board[1][4] = { type: 'n', player: 2, hasMoved: false };
board[0][0] = { type: 'r', player: 2, hasMoved: false };

board[10][4] = { type: 'k', player: 1, hasMoved: false };
board[9][4] = { type: 'q', player: 1, hasMoved: false }; // Queen is one step away from attacking column 4!
// Note: User Queen is at 9,4. Bot King at 2,4. 
// BUT wait, Queen at 9,4 can ALREADY attack 2,4!
// Let's put Queen at 9,3. It attacks 2,3.
board[9][3] = { type: 'q', player: 1, hasMoved: false }; 

function checkTouchdownForPlayer(player) {
    const targetRow = player === 1 ? 0 : ROWS - 1;
    for (let c = 0; c < COLS; c++) {
        const piece = board[targetRow][c];
        if (piece && piece.player === player) return true;
    }
    return false;
}

function evaluateBoard() {
    let score = 0;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const piece = board[r][c];
            if (piece) {
                let val = piece.type === 'k' ? 10000 : (botProfile.pieceWeights[piece.type] || PIECES[piece.type].value * 100);
                if (piece.player === 2) score += val; else score -= val;
            }
        }
    }
    return score;
}

function getValidMoves(r, c) {
    const piece = board[r][c];
    if (!piece) return [];
    const moves = [];
    const dir = piece.player === 1 ? -1 : 1;
    function addIfValid(tr, tc, canCapture = true, mustCapture = false) {
        if (tr < 0 || tr >= ROWS || tc < 0 || tc >= COLS) return false;
        const target = board[tr][tc];
        if (!target) { if (!mustCapture) { moves.push({ r: tr, c: tc }); return true; } return false; }
        else { if (canCapture && target.player !== piece.player) { moves.push({ r: tr, c: tc }); } return false; }
    }
    function slide(dr, dc) { let tr = r + dr; let tc = c + dc; while (addIfValid(tr, tc)) { tr += dr; tc += dc; } }
    switch (piece.type) {
        case 'p': if (addIfValid(r + dir, c, false)) { if (!piece.hasMoved) addIfValid(r + dir * 2, c, false); }
                  addIfValid(r + dir, c - 1, true, true); addIfValid(r + dir, c + 1, true, true); break;
        case 'n': [ [-2,-1], [-2,1], [2,-1], [2,1], [-1,-2], [-1,2], [1,-2], [1,2] ].forEach(m => addIfValid(r + m[0], c + m[1])); break;
        case 'b': slide(1, 1); slide(1, -1); slide(-1, 1); slide(-1, -1); break;
        case 'r': slide(1, 0); slide(-1, 0); slide(0, 1); slide(0, -1); break;
        case 'q': slide(1, 0); slide(-1, 0); slide(0, 1); slide(0, -1); slide(1, 1); slide(1, -1); slide(-1, 1); slide(-1, -1); break;
        case 'k': [ [-1,-1], [-1,0], [-1,1], [0,-1], [0,1], [1,-1], [1,0], [1,1] ].forEach(m => addIfValid(r + m[0], c + m[1])); break;
    }
    return moves;
}

function generateAllMoves(player) {
    let allMoves = [];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c] && board[r][c].player === player) {
                let moves = getValidMoves(r, c);
                for (let m of moves) allMoves.push({ fromR: r, fromC: c, toR: m.r, toC: m.c });
            }
        }
    }
    return allMoves;
}

function makeVirtualMove(move) {
    const piece = board[move.fromR][move.fromC];
    const targetPiece = board[move.toR][move.toC];
    board[move.toR][move.toC] = piece;
    board[move.fromR][move.fromC] = null;
    let oldHasMoved = piece.hasMoved;
    piece.hasMoved = true;
    return { targetPiece, oldHasMoved };
}

function undoVirtualMove(move, undoData) {
    const piece = board[move.toR][move.toC];
    board[move.fromR][move.fromC] = piece;
    board[move.toR][move.toC] = undoData.targetPiece;
    piece.hasMoved = undoData.oldHasMoved;
}

function minimax(depth, alpha, beta, isMaximizing) {
    let p1King = false, p2King = false;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c] && board[r][c].type === 'k') {
                if (board[r][c].player === 1) p1King = true;
                if (board[r][c].player === 2) p2King = true;
            }
        }
    }
    if (!p1King) return 99999 + depth;
    if (!p2King) return -99999 - depth;
    if (depth === 0) return evaluateBoard();

    const moves = generateAllMoves(isMaximizing ? 2 : 1);
    if (moves.length === 0) return isMaximizing ? -99999 : 99999;
    
    // SORT MOVES (King captures first)
    moves.sort((a, b) => {
        let targetA = board[a.toR][a.toC];
        let targetB = board[b.toR][b.toC];
        let valA = targetA ? (targetA.type === 'k' ? 10000 : PIECES[targetA.type].value) : 0;
        let valB = targetB ? (targetB.type === 'k' ? 10000 : PIECES[targetB.type].value) : 0;
        return valB - valA;
    });

    if (isMaximizing) {
        let maxEval = -Infinity;
        for (let move of moves) {
            let undoData = makeVirtualMove(move);
            let ev = minimax(depth - 1, alpha, beta, false);
            undoVirtualMove(move, undoData);
            maxEval = Math.max(maxEval, ev);
            alpha = Math.max(alpha, ev);
            if (beta <= alpha) break;
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (let move of moves) {
            let undoData = makeVirtualMove(move);
            let ev = minimax(depth - 1, alpha, beta, true);
            undoVirtualMove(move, undoData);
            minEval = Math.min(minEval, ev);
            beta = Math.min(beta, ev);
            if (beta <= alpha) break;
        }
        return minEval;
    }
}

// User plays 9,3 -> 9,4 (Queen attacks King)
console.log("User moves Queen to 9,4 to attack King");
board[9][4] = board[9][3];
board[9][3] = null;

// Now it's Bot's turn
let maxEval = -Infinity;
let bestMove = null;
const moves = generateAllMoves(2);
for (let move of moves) {
    let undoData = makeVirtualMove(move);
    let ev = minimax(4, -Infinity, Infinity, false);
    undoVirtualMove(move, undoData);
    console.log(`Bot considers ${move.fromR},${move.fromC} -> ${move.toR},${move.toC} : Eval = ${ev}`);
    if (ev > maxEval) {
        maxEval = ev;
        bestMove = move;
    }
}
console.log("BEST BOT RESPONSE:", bestMove);
