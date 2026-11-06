const PIECES = { 'p': { value: 1 }, 'n': { value: 3 }, 'b': { value: 3 }, 'r': { value: 5 }, 'q': { value: 9 }, 'k': { value: 0 } };
const botProfile = { pieceWeights: { 'p': 73, 'n': 491, 'b': 360, 'r': 252, 'q': 817, 'k': 10000 } };
const piecesPool = ['p', 'n', 'b', 'r', 'q'];
let draftPoints = 39;
let pieceCounts = { 'p': 0, 'n': 0, 'b': 0, 'r': 0, 'q': 0 };
let army = [];

// Draft the army first
while(draftPoints > 0) {
    let affordable = piecesPool.filter(p => PIECES[p].value <= draftPoints);
    if (affordable.length === 0) break;
    
    affordable.sort((a, b) => {
        let roiA = (botProfile.pieceWeights[a] / PIECES[a].value) / (pieceCounts[a] + 1);
        let roiB = (botProfile.pieceWeights[b] / PIECES[b].value) / (pieceCounts[b] + 1);
        return roiB - roiA;
    });

    let selectedPiece = affordable[0];
    if (affordable.length > 1 && Math.random() < 0.15) {
        selectedPiece = affordable[1];
    }
    
    pieceCounts[selectedPiece]++;
    army.push(selectedPiece);
    draftPoints -= PIECES[selectedPiece].value;
}

// Sort army: cheapest first (Pawns), then expensive.
army.sort((a, b) => PIECES[a].value - PIECES[b].value);

let ROWS = 12;
let COLS = 8;
let board = Array(ROWS).fill(null).map(() => Array(COLS).fill(null));

// King safe placement
let kR = 0;
let kC = 2 + Math.floor(Math.random() * 4);
board[kR][kC] = { type: 'k', player: 2, hasMoved: false };

// Get available slots, sorted so front line (row 2) comes FIRST
// Wait, if we want pawns in front, and pawns are sorted first in army,
// then slots should be ordered with r=2 first!
let slots = [];
for(let r=2; r>=0; r--) {
    // Randomize columns within the row to avoid predictable pawn placement
    let cols = [0,1,2,3,4,5,6,7].sort(() => Math.random() - 0.5);
    for(let c of cols) {
        if (board[r][c] === null) slots.push({r,c});
    }
}

// Place pieces
for(let i=0; i<army.length; i++) {
    let slot = slots[i];
    board[slot.r][slot.c] = { type: army[i], player: 2, hasMoved: false };
}

for(let r=0; r<3; r++) {
    console.log(`Row ${r}:`, board[r].map(p => p ? p.type : '.').join(' '));
}

