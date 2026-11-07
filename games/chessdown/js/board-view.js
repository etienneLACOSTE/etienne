// Board rendering, view/board coordinate mapping, screens and coin flip.

function showScreen(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    screen.classList.remove('hidden');
}

function enterFullscreen() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(err => console.log(err));
    } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
    }
    
    // Lock orientation to portrait if supported
    if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock("portrait").catch(err => console.log("Orientation lock not supported:", err));
    }
}

// --- View / Coordinate Mapping ---
// During draft, players see a 6x8 board. Rows 0-5.
// P1 draft rows 0-5 map to board rows 6-11.
// P2 draft rows 0-5 map to board rows 5-0 (inverted).
function getBoardCoords(viewR, viewC) {
    if (gameState === 'gameplay') {
        if (currentRoomCode && myPlayerNumber === 2) {
            return { r: (ROWS - 1) - viewR, c: (COLS - 1) - viewC };
        } else {
            return { r: viewR, c: viewC };
        }
    } else {
        const activePlayer = currentRoomCode ? myPlayerNumber : currentPlayer;
        if (activePlayer === 1) {
            return { r: viewR + 6, c: viewC };
        } else {
            return { r: 5 - viewR, c: 7 - viewC };
        }
    }
}

function getViewCoords(r, c) {
    if (gameState === 'gameplay') {
        if (currentRoomCode && myPlayerNumber === 2) {
            return { viewR: (ROWS - 1) - r, viewC: (COLS - 1) - c };
        } else {
            return { viewR: r, viewC: c };
        }
    } else {
        const activePlayer = currentRoomCode ? myPlayerNumber : currentPlayer;
        if (activePlayer === 1) {
            return { viewR: r - 6, viewC: c };
        } else {
            return { viewR: 5 - r, viewC: 7 - c };
        }
    }
}

// Returns the drafting zone on the VIEW (6x8)
function getDraftZoneView() {
    return { min: 3, max: 5 }; // Bottom 3 rows of the 6x8 view
}

function createBoardDOM(isDraft) {
    ui.chessboard.innerHTML = '';
    const viewRows = isDraft ? 6 : ROWS;
    
    ui.chessboard.style.gridTemplateRows = `repeat(${viewRows}, 1fr)`;
    ui.chessboard.style.aspectRatio = isDraft ? '1 / 1' : '1 / 2';
    ui.chessboard.style.maxWidth = isDraft ? 'min(100%, 45vh)' : 'min(100%, 45vh)';

    // Hide endzones during draft
    if (isDraft) {
        ui.endzoneTop.classList.add('hidden');
        ui.endzoneBottom.classList.add('hidden');
    } else {
        ui.endzoneTop.classList.remove('hidden');
        ui.endzoneBottom.classList.remove('hidden');
        // Set endzone colors based on jerseys
        if (myPlayerNumber === 2) {
            ui.endzoneTop.className = `endzone endzone-${playerColors[1]}`;
            ui.endzoneBottom.className = `endzone endzone-${playerColors[2]}`;
        } else {
            ui.endzoneTop.className = `endzone endzone-${playerColors[2]}`;
            ui.endzoneBottom.className = `endzone endzone-${playerColors[1]}`;
        }
    }

    for (let viewR = 0; viewR < viewRows; viewR++) {
        for (let viewC = 0; viewC < COLS; viewC++) {
            const square = document.createElement('div');
            square.classList.add('square');
            // Checkerboard pattern
            if ((viewR + viewC) % 2 === 0) square.classList.add('light');
            else square.classList.add('dark');
            
            // Yard lines only in full gameplay mode
            if (!isDraft) {
                if (viewR === 2 || viewR === 5 || viewR === 8) square.classList.add('yard-line-bottom');
                if (viewR === 3 || viewR === 6 || viewR === 9) square.classList.add('yard-line-top');
            } else {
                // In draft mode, we show a red line above row 3
                if (viewR === 3) square.classList.add('draft-limit');
            }

            square.dataset.vr = viewR;
            square.dataset.vc = viewC;
            square.addEventListener('pointerdown', () => handleSquareClick(viewR, viewC));
            ui.chessboard.appendChild(square);
        }
    }
}

// --- Coin Flip ---

function startCoinFlip(winner) {
    showScreen(ui.coinFlipScreen);
    
    // Apply chosen colors to the coin faces
    ui.coinFront.className = `coin-face coin-front endzone-${playerColors[1]}`;
    ui.coinBack.className = `coin-face coin-back endzone-${playerColors[2]}`;
    
    // Reset rotation before spinning
    ui.coin.style.transition = 'none';
    ui.coin.style.transform = `rotateY(0deg)`;
    
    // Force reflow
    void ui.coin.offsetWidth;

    // Determine winner from server
    const result = winner;
    const spinDegrees = result === 1 ? 3600 : 3780; // 10 spins instead of 5

    ui.coin.style.transition = 'transform 2s cubic-bezier(0.2, 0.8, 0.2, 1)';
    ui.coin.style.transform = `rotateY(${spinDegrees}deg)`;

    const coinContainer = ui.coinFlipScreen.querySelector('.coin-container');
    coinContainer.style.animation = 'none';
    void coinContainer.offsetWidth;
    coinContainer.style.animation = 'coinThrow 2s ease-in-out forwards';

    setTimeout(() => {
        currentPlayer = result; // Set starting player
        setTimeout(finalizeGameplayStart, 1000); // 1 second pause to see result then start
    }, 2000);
}

function renderBoard() {
    const squares = ui.chessboard.children;
    const viewRows = gameState === 'gameplay' ? ROWS : 6;
    const draftZone = gameState !== 'gameplay' ? getDraftZoneView() : null;

    for (let viewR = 0; viewR < viewRows; viewR++) {
        for (let viewC = 0; viewC < COLS; viewC++) {
            const index = viewR * COLS + viewC;
            const square = squares[index];
            square.innerHTML = '';
            
            square.classList.remove('draft-area');
            if (draftZone && viewR >= draftZone.min && viewR <= draftZone.max) {
                square.classList.add('draft-area');
            }

            const { r, c } = getBoardCoords(viewR, viewC);
            const piece = board[r][c];

            // Reset classes
            square.className = square.className.replace(/jersey-\w+/g, '');
            square.classList.remove('has-piece');

            if (piece) {
                // In draft, only show current player's pieces
                if (gameState !== 'gameplay' && piece.player !== currentPlayer) {
                    continue;
                }

                const pieceDef = PIECES[piece.type];
                
                // Create span to allow rotating just the icon
                const span = document.createElement('span');
                span.classList.add('piece-icon');
                span.textContent = pieceDef.icon;
                
                const isOpponent = currentRoomCode ? piece.player !== myPlayerNumber : piece.player === 2;
                if (gameState === 'gameplay' && isOpponent) {
                    span.classList.add('piece-rotated');
                }
                
                square.appendChild(span);
                square.classList.add('has-piece');
                square.classList.add(`jersey-${playerColors[piece.player]}`);
            }
        }
    }
}

function getSquareElement(viewR, viewC) {
    return ui.chessboard.children[viewR * COLS + viewC];
}

function clearHighlights() {
    const squares = ui.chessboard.children;
    for (let i = 0; i < squares.length; i++) {
        squares[i].classList.remove('highlight', 'selected');
    }
}

function highlightValidMoves(r, c) {
    clearHighlights();
    const { viewR: vr, viewC: vc } = getViewCoords(r, c);
    getSquareElement(vr, vc).classList.add('selected');

    const moves = getValidMoves(r, c);
    moves.forEach(m => {
        const { viewR, viewC } = getViewCoords(m.r, m.c);
        const sq = getSquareElement(viewR, viewC);
        if (sq) sq.classList.add('highlight');
    });
}
