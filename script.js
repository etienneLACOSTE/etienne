const scrollLayer = document.getElementById('scroll-layer');
const squaresLayer = document.getElementById('squares-layer');
const piecesLayer = document.getElementById('pieces-layer');
const kingPiece = document.getElementById('king-piece');
const scoreEl = document.getElementById('score-val');
const powerEl = document.getElementById('power-val');
const livesEl = document.getElementById('lives-val');
const timerBar = document.getElementById('timer-bar');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreEl = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-btn');
const analyseBtn = document.getElementById('analyse-btn');
const gameContainer = document.getElementById('game-container');

// Game state
let king = { x: 3, y: 1 };
let lastSafeKing = { x: 3, y: 1 };
let boardY = 0; // Board's visual bottom row
let maxBoardY = 0; // To track how far we generated enemies
let maxBoardYRendered = -1; // To track how many rows of DOM squares exist
let currentPower = null;
let score = 0;
let lives = 3;
let enemies = [];
let dangerZones = new Map();

// Time state
let timeLimit = 60000;
const minTimeLimit = 10000;
let timeLeft = timeLimit;
let lastFrameTime = 0;
let timerAnimationId;
let isAnimating = false;
let isGameOver = false;
let showingMistake = false;
let activeAttackers = new Set();
let justTransformed = false;
let latestValidPath = [];

const PIECES = { P: '♟', N: '♞', B: '♝', R: '♜', Q: '♛', K: '♔' };
const WHITE_PIECES = { P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕', K: '♔' };

function initGame() {
    king = { x: 3, y: 1 };
    lastSafeKing = { x: 3, y: 1 };
    boardY = 0;
    maxBoardY = 0;
    maxBoardYRendered = -1;
    currentPower = null;
    score = 0;
    lives = 3;
    enemies = [];
    latestValidPath = [];
    squaresLayer.innerHTML = ''; // Reset DOM
    
    // Clear pieces EXCEPT the king
    const enemyNodes = piecesLayer.querySelectorAll('.enemy-piece');
    enemyNodes.forEach(n => n.remove());
    
    timeLimit = 60000;
    isGameOver = false;
    showingMistake = false;
    justTransformed = false;
    activeAttackers.clear();
    gameOverScreen.classList.add('hidden');
    updateUI();
    
    generateEnemiesForRows(2, 14);
    maxBoardY = 14;
    calculateDangerZones();
    syncDOM();
    resetTimer();
}

function getDangerKey(x, y) { return `${x},${y}`; }

function addDanger(x, y, enemy) {
    if (x >= 0 && x <= 7 && y >= 0) {
        const key = getDangerKey(x, y);
        if (!dangerZones.has(key)) dangerZones.set(key, new Set());
        dangerZones.get(key).add(enemy);
    }
}

function calculateDangerZones() {
    dangerZones = new Map();
    // FIX: Seules les pièces totalement visibles et NON-SHADY sont actives.
    // L'écran affiche de boardY à boardY + 10. Les shady sont +8, +9, +10.
    // Les pièces actives sont donc strictement contenues entre boardY (bas de l'écran) et boardY + 7.
    const activeEnemies = enemies.filter(e => e.y >= boardY && e.y <= boardY + 7);
    
    activeEnemies.forEach(e => {
        if (e.type === 'P') {
            addDanger(e.x - 1, e.y - 1, e);
            addDanger(e.x + 1, e.y - 1, e);
        } else if (e.type === 'N') {
            const moves = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
            moves.forEach(m => addDanger(e.x + m[0], e.y + m[1], e));
        } else if (e.type === 'B' || e.type === 'R' || e.type === 'Q') {
            const dirs = [];
            if (e.type === 'B' || e.type === 'Q') dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
            if (e.type === 'R' || e.type === 'Q') dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
            dirs.forEach(d => {
                for (let i = 1; i < 15; i++) {
                    const nx = e.x + d[0] * i;
                    const ny = e.y + d[1] * i;
                    addDanger(nx, ny, e);
                    if (enemies.some(en => en.x === nx && en.y === ny)) break;
                    if (nx < 0 || nx > 7) break;
                }
            });
        }
    });
}

function doesPieceAttackSquare(piece, tx, ty, allPieces) {
    if (piece.type === 'P') {
        return (tx === piece.x - 1 || tx === piece.x + 1) && ty === piece.y - 1;
    }
    if (piece.type === 'N') {
        const dx = Math.abs(tx - piece.x);
        const dy = Math.abs(ty - piece.y);
        return (dx === 2 && dy === 1) || (dx === 1 && dy === 2);
    }
    const dx = tx - piece.x;
    const dy = ty - piece.y;
    const isDiag = Math.abs(dx) === Math.abs(dy);
    const isStraight = dx === 0 || dy === 0;
    
    if (piece.type === 'B' && !isDiag) return false;
    if (piece.type === 'R' && !isStraight) return false;
    if (piece.type === 'Q' && !isDiag && !isStraight) return false;
    
    const sx = dx === 0 ? 0 : Math.sign(dx);
    const sy = dy === 0 ? 0 : Math.sign(dy);
    let cx = piece.x + sx;
    let cy = piece.y + sy;
    while (cx !== tx || cy !== ty) {
        if (allPieces.some(e => e.x === cx && e.y === cy)) return false;
        cx += sx;
        cy += sy;
    }
    return true;
}
function isSquareSafeSimulated(tx, ty, simulatedEnemies) {
    const simBoardY = Math.max(0, ty - 1);
    const activeEnemies = simulatedEnemies.filter(e => e.y >= simBoardY && e.y <= simBoardY + 7);
    
    for (let e of activeEnemies) {
        if (doesPieceAttackSquare(e, tx, ty, simulatedEnemies)) {
            return false;
        }
    }
    return true;
}

function isValidMoveSimulated(startX, startY, power, targetX, targetY, simulatedEnemies) {
    const dx = targetX - startX;
    const dy = targetY - startY;
    
    if (dx === 0 && dy === 0) return false;
    if (targetX < 0 || targetX > 7 || targetY < 0) return false;

    function checkPath(sx, sy) {
        let currX = startX + sx;
        let currY = startY + sy;
        while (currX !== targetX || currY !== targetY) {
            if (simulatedEnemies.some(e => e.x === currX && e.y === currY)) return false;
            currX += sx;
            currY += sy;
        }
        return true;
    }
    
    const p = power || 'K';
    
    if (p === 'K') return Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
    if (p === 'N') return (Math.abs(dx) === 2 && Math.abs(dy) === 1) || (Math.abs(dx) === 1 && Math.abs(dy) === 2);
    
    if (p === 'P') {
        const isCapture = simulatedEnemies.some(e => e.x === targetX && e.y === targetY);
        if (dx === 0 && dy === 1 && !isCapture) return true;
        if (Math.abs(dx) === 1 && dy === 1 && isCapture) return true;
        return false;
    }
    
    const isRookMove = (dx === 0 || dy === 0);
    const isBishopMove = Math.abs(dx) === Math.abs(dy);
    
    if (p === 'R' && !isRookMove) return false;
    if (p === 'B' && !isBishopMove) return false;
    if (p === 'Q' && !isRookMove && !isBishopMove) return false;
    
    return checkPath(dx === 0 ? 0 : Math.sign(dx), dy === 0 ? 0 : Math.sign(dy));
}

function findPath(startX, startY, startPower, targetY, allEnemies) {
    let queue = [{ x: startX, y: startY, power: startPower, capturedIds: [], path: [{x: startX, y: startY}] }];
    let visited = new Set();
    
    let stateKey = `${startX},${startY},${startPower || 'K'},`;
    visited.add(stateKey);
    
    let iterations = 0;
    
    while (queue.length > 0) {
        iterations++;
        if (iterations > 3000) break;
        
        let bestIdx = 0;
        for (let i = 1; i < queue.length; i++) {
            if (queue[i].y > queue[bestIdx].y) bestIdx = i;
        }
        let curr = queue.splice(bestIdx, 1)[0];
        
        if (curr.y >= targetY) {
            return curr.path;
        }
        
        let currentEnemies = allEnemies.filter(e => !curr.capturedIds.includes(e.id));
        let minY = Math.max(0, curr.y - 1);
        let maxY = curr.y + 3;
        
        for (let ny = minY; ny <= maxY; ny++) {
            for (let nx = 0; nx < 8; nx++) {
                if (isValidMoveSimulated(curr.x, curr.y, curr.power, nx, ny, currentEnemies)) {
                    let capIdx = currentEnemies.findIndex(e => e.x === nx && e.y === ny);
                    let captured = capIdx !== -1 ? currentEnemies[capIdx] : null;
                    
                    let nextEnemies = currentEnemies;
                    let nextCapturedIds = curr.capturedIds;
                    let nextPower = null;
                    
                    if (captured) {
                        nextEnemies = currentEnemies.filter(e => e.id !== captured.id);
                        nextCapturedIds = [...curr.capturedIds, captured.id];
                        nextPower = captured.type;
                    }
                    
                    if (isSquareSafeSimulated(nx, ny, nextEnemies)) {
                        let nKey = `${nx},${ny},${nextPower || 'K'},${nextCapturedIds.sort().join('|')}`;
                        if (!visited.has(nKey)) {
                            visited.add(nKey);
                            queue.push({
                                x: nx, 
                                y: ny, 
                                power: nextPower, 
                                capturedIds: nextCapturedIds, 
                                path: [...curr.path, {x: nx, y: ny}]
                            });
                        }
                    }
                }
            }
        }
    }
    return null;
}

function generateEnemiesForRows(startRow, endRow) {
    let currentY = startRow;
    let baseEnemies = [...enemies.filter(e => e.y < startRow)];
    
    while (currentY <= endRow) {
        let attempts = 0;
        let rowGenerated = false;
        
        while (attempts < 15) {
            enemies = [...baseEnemies.filter(e => e.y < currentY)];
            
            let count;
            const rand = Math.random();
            if (currentY < 20) { count = rand < 0.7 ? 1 : (rand < 0.9 ? 2 : 0); }
            else if (currentY < 50) { count = rand < 0.5 ? 1 : (rand < 0.8 ? 2 : 3); }
            else if (currentY < 80) { count = rand < 0.3 ? 1 : (rand < 0.6 ? 2 : 3); }
            else { count = rand < 0.2 ? 1 : (rand < 0.5 ? 2 : (rand < 0.9 ? 3 : 4)); }
            
            const difficulty = Math.min(1, currentY / 80);
            if (currentY > 5 && Math.random() < (0.10 + difficulty * 0.15)) {
                count = 0;
                let wallType = Math.random() < 0.5 ? 'R' : 'Q';
                let wx = Math.floor(Math.random() * 8);
                enemies.push({ x: wx, y: currentY, type: wallType, id: 'enemy-' + Math.random().toString(36).substr(2, 9) });
                
                let kx = Math.floor(Math.random() * 8);
                const keyTypes = ['P', 'N', 'B'];
                enemies.push({ x: kx, y: currentY - 1, type: keyTypes[Math.floor(Math.random() * keyTypes.length)], id: 'enemy-' + Math.random().toString(36).substr(2, 9) });
            } else {
                for (let i = 0; i < count; i++) {
                    let x = Math.floor(Math.random() * 8);
                    const types = ['P', 'P', 'N', 'B', 'R'];
                    let type = types[Math.floor(Math.random() * types.length)];
                    if (!enemies.some(e => e.x === x && e.y === currentY)) {
                        enemies.push({ x, y: currentY, type, id: 'enemy-' + Math.random().toString(36).substr(2, 9) });
                    }
                }
            }
            
            let path = findPath(king.x, king.y, currentPower, currentY, enemies);
            
            if (path) {
                latestValidPath = path;
                baseEnemies = [...enemies];
                rowGenerated = true;
                break;
            }
            
            if (attempts === 14) {
                enemies = [...baseEnemies.filter(e => e.y < currentY)];
                let fallbackPath = findPath(king.x, king.y, currentPower, currentY, enemies);
                if (fallbackPath) {
                    latestValidPath = fallbackPath;
                    baseEnemies = [...enemies];
                    rowGenerated = true;
                    break;
                }
            }
            
            attempts++;
        }
        
        if (rowGenerated) {
            currentY++;
        } else {
            currentY--;
            if (currentY < startRow) {
                enemies = [...baseEnemies.filter(e => e.y < startRow)];
                break;
            }
        }
    }
}

function syncDOM() {
    boardY = Math.max(0, king.y - 1); // Keep king on row 1 from the bottom
    
    // Shift the scroll layer down to simulate camera panning up
    scrollLayer.style.transform = `translateY(${boardY * 60}px)`;
    
    // Generate new logic rows if needed
    if (boardY + 13 > maxBoardY && !showingMistake) {
        generateEnemiesForRows(maxBoardY + 1, boardY + 13);
        maxBoardY = boardY + 13;
    }
    
    // Generate DOM squares if needed
    if (maxBoardY > maxBoardYRendered) {
        for (let row = maxBoardYRendered + 1; row <= maxBoardY; row++) {
            for (let col = 0; col < 8; col++) {
                const sq = document.createElement('div');
                sq.className = `square ${(col + row) % 2 !== 0 ? 'dark' : 'light'}`;
                sq.id = `sq-${col}-${row}`;
                sq.dataset.x = col;
                sq.dataset.y = row;
                sq.style.left = `${col * 60}px`;
                sq.style.bottom = `${row * 60}px`; // IMPORTANT: Position from bottom
                
                // Add labels
                if (col === 0) {
                    const rankLabel = document.createElement('span');
                    rankLabel.className = 'rank-label';
                    rankLabel.textContent = row + 1; // 1 to infinity
                    sq.appendChild(rankLabel);
                }
                
                squaresLayer.appendChild(sq);
            }
        }
        maxBoardYRendered = maxBoardY;
        
        // Add File letters to the current bottom row
        // We clean old ones and add to new bottom
        document.querySelectorAll('.file-label').forEach(el => el.remove());
        for (let col = 0; col < 8; col++) {
            const bottomSq = document.getElementById(`sq-${col}-${boardY}`);
            if (bottomSq) {
                const fileLabel = document.createElement('span');
                fileLabel.className = 'file-label';
                fileLabel.textContent = String.fromCharCode(65 + col);
                bottomSq.appendChild(fileLabel);
            }
        }
    }
    
    // Update square states (shady, danger)
    // We only need to iterate over visible squares
    for (let row = boardY; row <= boardY + 11; row++) {
        for (let col = 0; col < 8; col++) {
            const sq = document.getElementById(`sq-${col}-${row}`);
            if (!sq) continue;
            
            // Shady: the top 3 visible rows
            if (row >= boardY + 8) {
                sq.classList.add('shady');
            } else {
                sq.classList.remove('shady');
            }
            
            // Danger
            let isDanger = false;
            if (showingMistake && dangerZones.has(getDangerKey(col, row))) {
                const attackersHere = dangerZones.get(getDangerKey(col, row));
                attackersHere.forEach(attacker => {
                    if (activeAttackers.has(attacker)) isDanger = true;
                });
            }
            if (isDanger) {
                sq.classList.add('danger');
            } else {
                sq.classList.remove('danger');
            }
        }
    }
    
    // Update King position and style
    kingPiece.style.left = `${king.x * 60}px`;
    kingPiece.style.bottom = `${king.y * 60}px`;
    kingPiece.textContent = currentPower ? WHITE_PIECES[currentPower] : WHITE_PIECES['K'];
    
    if (justTransformed) {
        kingPiece.classList.add('transform-anim');
        setTimeout(() => kingPiece.classList.remove('transform-anim'), 600);
        justTransformed = false;
    }
    
    if (isAnimating) {
        kingPiece.classList.add('king-moving');
    } else {
        kingPiece.classList.remove('king-moving');
    }
    
    // Clean up old enemies from memory
    enemies = enemies.filter(e => e.y >= boardY - 5);
    
    // Sync Enemy DOM elements
    // Get all existing enemy DOM elements
    const existingEnemyNodes = document.querySelectorAll('.enemy-piece');
    const existingIds = new Set();
    existingEnemyNodes.forEach(node => {
        // If the enemy is no longer in the array, remove the DOM element
        if (!enemies.find(e => e.id === node.id)) {
            node.remove();
        } else {
            existingIds.add(node.id);
            // Remove highlight class
            node.classList.remove('attacker-highlight');
        }
    });
    
    // Create new elements or highlight
    enemies.forEach(e => {
        let node = document.getElementById(e.id);
        if (!node) {
            node = document.createElement('div');
            node.id = e.id;
            node.className = 'piece black enemy-piece';
            node.style.left = `${e.x * 60}px`;
            node.style.bottom = `${e.y * 60}px`;
            node.textContent = PIECES[e.type];
            piecesLayer.appendChild(node);
        }
        
        if (showingMistake && activeAttackers.has(e)) {
            node.classList.add('attacker-highlight');
        }
    });
}

function updateUI() {
    scoreEl.textContent = score;
    powerEl.textContent = currentPower ? WHITE_PIECES[currentPower] : WHITE_PIECES['K'];
    if (currentPower) {
        powerEl.classList.add('power-active');
    } else {
        powerEl.classList.remove('power-active');
    }
    
    let hearts = '';
    for (let i = 0; i < 3; i++) hearts += i < lives ? '❤️' : '🖤';
    livesEl.innerHTML = hearts;
}

function resetTimer() {
    timeLeft = timeLimit;
    lastFrameTime = performance.now();
    cancelAnimationFrame(timerAnimationId);
    if (!isGameOver) timerAnimationId = requestAnimationFrame(updateTimer);
    timerBar.style.backgroundColor = 'var(--accent)';
}

function updateTimer(timestamp) {
    if (isGameOver) return;
    const dt = timestamp - lastFrameTime;
    lastFrameTime = timestamp;
    timeLeft -= dt;
    if (timeLeft < 0) timeLeft = 0;
    
    const pct = (timeLeft / timeLimit) * 100;
    timerBar.style.width = `${pct}%`;
    if (pct < 30) timerBar.style.backgroundColor = '#ef4444';
    
    if (timeLeft <= 0) {
        loseLife("Temps écoulé !");
    } else {
        timerAnimationId = requestAnimationFrame(updateTimer);
    }
}

function loseLife(reason) {
    lives--;
    updateUI();
    gameContainer.classList.add('shake');
    setTimeout(() => gameContainer.classList.remove('shake'), 400);
    
    if (lives <= 0) {
        endGame();
    } else {
        king = { ...lastSafeKing };
        currentPower = null;
        showingMistake = false;
        activeAttackers.clear();
        timeLimit = Math.min(60000, timeLimit + 10000);
        syncDOM();
        resetTimer();
    }
}

function endGame() {
    isGameOver = true;
    cancelAnimationFrame(timerAnimationId);
    finalScoreEl.textContent = score;
    gameOverScreen.classList.remove('hidden');
}

function isValidMove(targetX, targetY) {
    const dx = targetX - king.x;
    const dy = targetY - king.y;
    
    if (dx === 0 && dy === 0) return false;
    if (targetX < 0 || targetX > 7 || targetY < 0) return false;

    // Check path collisions for sliding
    function checkPath(sx, sy) {
        let currX = king.x + sx;
        let currY = king.y + sy;
        while (currX !== targetX || currY !== targetY) {
            if (enemies.some(e => e.x === currX && e.y === currY)) return false;
            currX += sx;
            currY += sy;
        }
        return true;
    }
    
    const power = currentPower || 'K';
    
    if (power === 'K') return Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
    if (power === 'N') return (Math.abs(dx) === 2 && Math.abs(dy) === 1) || (Math.abs(dx) === 1 && Math.abs(dy) === 2);
    
    if (power === 'P') {
        const isCapture = enemies.some(e => e.x === targetX && e.y === targetY);
        if (dx === 0 && dy === 1 && !isCapture) return true;
        if (Math.abs(dx) === 1 && dy === 1 && isCapture) return true;
        return false;
    }
    
    const isRookMove = (dx === 0 || dy === 0);
    const isBishopMove = Math.abs(dx) === Math.abs(dy);
    
    if (power === 'R' && !isRookMove) return false;
    if (power === 'B' && !isBishopMove) return false;
    if (power === 'Q' && !isRookMove && !isBishopMove) return false;
    
    return checkPath(dx === 0 ? 0 : Math.sign(dx), dy === 0 ? 0 : Math.sign(dy));
}

function hasAnySafeMove() {
    let currentEnemies = enemies;
    let minY = Math.max(0, king.y - 1);
    let maxY = king.y + 7;
    
    for (let ny = minY; ny <= maxY; ny++) {
        for (let nx = 0; nx < 8; nx++) {
            if (isValidMoveSimulated(king.x, king.y, currentPower, nx, ny, currentEnemies)) {
                let capIdx = currentEnemies.findIndex(e => e.x === nx && e.y === ny);
                let nextEnemies = capIdx !== -1 ? currentEnemies.filter((e, idx) => idx !== capIdx) : currentEnemies;
                
                if (isSquareSafeSimulated(nx, ny, nextEnemies)) {
                    return true;
                }
            }
        }
    }
    return false;
}

function attemptMove(targetX, targetY) {
    if (isGameOver || showingMistake) return;
    if (!isValidMove(targetX, targetY)) return;
    
    lastSafeKing = { ...king };
    king.x = targetX;
    king.y = targetY;
    boardY = Math.max(0, king.y - 1); // UPDATE EARLY
    
    if (king.y > maxBoardYRendered - 10) score += 1;
    
    timeLimit = Math.max(minTimeLimit, timeLimit - 500);
    calculateDangerZones(); // Recalculate now that king moved
    
    if (dangerZones.has(getDangerKey(king.x, king.y))) {
        cancelAnimationFrame(timerAnimationId);
        showingMistake = true;
        activeAttackers = dangerZones.get(getDangerKey(king.x, king.y));
        syncDOM();
        setTimeout(() => loseLife("Échec !"), 1500);
    } else {
        const capturedEnemyIndex = enemies.findIndex(e => e.x === king.x && e.y === king.y);
        if (capturedEnemyIndex !== -1) {
            const capType = enemies[capturedEnemyIndex].type;
            enemies.splice(capturedEnemyIndex, 1);
            score += 5;
            currentPower = capType;
            justTransformed = true;
        } else {
            currentPower = null;
        }
        
        updateUI();
        
        if (!hasAnySafeMove()) {
            cancelAnimationFrame(timerAnimationId);
            showingMistake = true;
            syncDOM();
            setTimeout(() => loseLife("Bloqué !"), 1500);
        } else {
            resetTimer();
            isAnimating = true;
            syncDOM();
            setTimeout(() => { 
                isAnimating = false; 
                syncDOM(); 
            }, 150);
        }
    }
}

// Mouse click movement
document.getElementById('board').addEventListener('click', (e) => {
    let target = e.target;
    let targetX, targetY;
    
    if (target.classList.contains('piece') && target.id.startsWith('enemy-')) {
        // Clicked directly on an enemy piece
        const enemy = enemies.find(en => en.id === target.id);
        if (enemy) {
            targetX = enemy.x;
            targetY = enemy.y;
        }
    } else {
        // Clicked on a square
        const square = target.closest('.square');
        if (square) {
            targetX = parseInt(square.dataset.x);
            targetY = parseInt(square.dataset.y);
        }
    }
    
    if (targetX !== undefined && targetY !== undefined) {
        attemptMove(targetX, targetY);
    }
});

window.addEventListener('keydown', (e) => {
    if (isGameOver || showingMistake) return;
    let dx = 0, dy = 0;
    switch (e.key) {
        case 'ArrowUp': case 'w': case 'z': case '8': dy = 1; break;
        case 'ArrowDown': case 's': case '2': dy = -1; break;
        case 'ArrowLeft': case 'q': case 'a': case '4': dx = -1; break;
        case 'ArrowRight': case 'd': case '6': dx = 1; break;
        case '7': dx = -1; dy = 1; break;
        case '9': dx = 1; dy = 1; break;
        case '1': dx = -1; dy = -1; break;
        case '3': dx = 1; dy = -1; break;
        default: return;
    }
    attemptMove(king.x + dx, king.y + dy);
});

restartBtn.addEventListener('click', initGame);

analyseBtn.addEventListener('click', () => {
    gameOverScreen.classList.add('hidden');
    
    let analysisPath = findPath(lastSafeKing.x, lastSafeKing.y, currentPower, maxBoardY, enemies);
    let pathToDraw = analysisPath || latestValidPath;
    
    const floatingRestart = document.createElement('button');
    floatingRestart.textContent = "Quitter l'analyse";
    floatingRestart.id = "floating-restart";
    floatingRestart.className = "action-btn primary";
    
    document.getElementById('ui-layer').appendChild(floatingRestart);
    floatingRestart.addEventListener('click', () => {
        floatingRestart.remove();
        initGame();
    });

    if (!pathToDraw || pathToDraw.length === 0) return;
    
    let startStep = pathToDraw[0];
    
    // Rewind animation
    kingPiece.classList.add('king-moving');
    kingPiece.style.transition = 'all 0.8s ease-in-out';
    kingPiece.style.left = `${startStep.x * 60}px`;
    kingPiece.style.bottom = `${startStep.y * 60}px`;
    
    scrollLayer.style.transition = 'transform 0.8s ease-in-out';
    boardY = Math.max(0, startStep.y - 1);
    scrollLayer.style.transform = `translateY(${boardY * 60}px)`;
    
    const rewindText = document.createElement('div');
    rewindText.textContent = !analysisPath ? "⏪ Retour dans le temps..." : "⏪ Reprise depuis la dernière position...";
    rewindText.style.position = 'absolute';
    rewindText.style.top = '60px';
    rewindText.style.left = '50%';
    rewindText.style.transform = 'translateX(-50%)';
    rewindText.style.color = '#38bdf8';
    rewindText.style.fontWeight = 'bold';
    rewindText.style.fontSize = '24px';
    rewindText.style.textShadow = '0 0 10px rgba(0,0,0,0.8)';
    rewindText.style.zIndex = '1000';
    document.getElementById('ui-layer').appendChild(rewindText);
    
    setTimeout(() => {
        rewindText.remove();
        kingPiece.style.transition = '';
        scrollLayer.style.transition = '';
        
        let stepIndex = 0;
        function animateAnalysis() {
            if (stepIndex >= pathToDraw.length || document.getElementById('floating-restart') === null) return;
            
            let step = pathToDraw[stepIndex];
            
            kingPiece.style.left = `${step.x * 60}px`;
            kingPiece.style.bottom = `${step.y * 60}px`;
            
            boardY = Math.max(0, step.y - 1);
            scrollLayer.style.transform = `translateY(${boardY * 60}px)`;
            
            if (step.y >= boardY && step.y <= maxBoardYRendered) {
                const sq = document.getElementById(`sq-${step.x}-${step.y}`);
                if (sq) sq.classList.add('golden-path');
            }
            
            stepIndex++;
            setTimeout(animateAnalysis, 300);
        }
        
        animateAnalysis();
    }, 1000);
});

initGame();
