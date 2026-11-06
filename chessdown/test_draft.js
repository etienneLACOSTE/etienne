const PIECES = { 'p': { value: 1 }, 'n': { value: 3 }, 'b': { value: 3 }, 'r': { value: 5 }, 'q': { value: 9 }, 'k': { value: 0 } };
const botProfile = { pieceWeights: { 'p': 73, 'n': 491, 'b': 360, 'r': 252, 'q': 817, 'k': 10000 } };
const piecesPool = ['p', 'n', 'b', 'r', 'q'];
let draftPoints = 39;
let army = [];

while(draftPoints > 0) {
    let affordable = piecesPool.filter(p => PIECES[p].value <= draftPoints);
    if (affordable.length === 0) break;
    
    // Sort by ROI (weight / cost)
    affordable.sort((a, b) => {
        let roiA = botProfile.pieceWeights[a] / PIECES[a].value;
        let roiB = botProfile.pieceWeights[b] / PIECES[b].value;
        return roiB - roiA;
    });

    // Add slight randomness: 80% chance to pick best, 20% to pick second best
    let selectedPiece = affordable[0];
    if (affordable.length > 1 && Math.random() < 0.2) {
        selectedPiece = affordable[1];
    }
    
    army.push(selectedPiece);
    draftPoints -= PIECES[selectedPiece].value;
}

console.log("Bot Army:", army.reduce((acc, p) => { acc[p] = (acc[p]||0)+1; return acc; }, {}));
