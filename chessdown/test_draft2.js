const PIECES = { 'p': { value: 1 }, 'n': { value: 3 }, 'b': { value: 3 }, 'r': { value: 5 }, 'q': { value: 9 }, 'k': { value: 0 } };
const botProfile = { pieceWeights: { 'p': 73, 'n': 491, 'b': 360, 'r': 252, 'q': 817, 'k': 10000 } };
const piecesPool = ['p', 'n', 'b', 'r', 'q'];
let draftPoints = 39;
let pieceCounts = { 'p': 0, 'n': 0, 'b': 0, 'r': 0, 'q': 0 };
let army = [];

while(draftPoints > 0) {
    let affordable = piecesPool.filter(p => PIECES[p].value <= draftPoints);
    if (affordable.length === 0) break;
    
    affordable.sort((a, b) => {
        let roiA = (botProfile.pieceWeights[a] / PIECES[a].value) / (pieceCounts[a] + 1);
        let roiB = (botProfile.pieceWeights[b] / PIECES[b].value) / (pieceCounts[b] + 1);
        return roiB - roiA;
    });

    let selectedPiece = affordable[0];
    if (affordable.length > 1 && Math.random() < 0.1) {
        selectedPiece = affordable[1];
    }
    
    pieceCounts[selectedPiece]++;
    army.push(selectedPiece);
    draftPoints -= PIECES[selectedPiece].value;
}

console.log("Bot Army:", pieceCounts);
