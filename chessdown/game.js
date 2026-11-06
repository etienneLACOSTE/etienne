// Socket.io Client
let socket = null;
if (typeof io !== 'undefined') {
    socket = io();
}
let currentRoomCode = null;
let myPlayerNumber = 1;

// Constants
const ROWS = 12;
const COLS = 8;
const MAX_POINTS = 39;

const PIECES = {
    'p': { value: 1, icon: '♙' },
    'n': { value: 3, icon: '♘' },
    'b': { value: 3, icon: '♗' },
    'r': { value: 5, icon: '♖' },
    'q': { value: 9, icon: '♕' },
    'k': { value: 0, icon: '♔' }
};

const COLOR_HEX = {
    'red': '#e74c3c',
    'blue': '#3498db',
    'green': '#2ecc71',
    'yellow': '#f1c40f',
    'purple': '#9b59b6',
    'orange': '#e67e22',
    'white': '#ecf0f1',
    'black': '#2c3e50'
};

// Game State
let board = Array(ROWS).fill(null).map(() => Array(COLS).fill(null));
let gameState = 'menu'; // menu, draft1, draft2, gameplay
let currentPlayer = 1;
let draftOrder = [1, 2];
let currentDraftIndex = 0;
let draftPoints = { 1: MAX_POINTS, 2: MAX_POINTS };
let kingsPlaced = { 1: false, 2: false };
let playerColors = { 1: 'blue', 2: 'red' };
let selectedDraftPiece = null;
let removeMode = false;
let positionHistory = {};

// Gameplay state
let selectedBoardPiece = null;
let lastMove = null; // { piece, fromR, fromC, toR, toC, isDoubleStep }

// Timer state
const TURN_TIME_MS = 10000;
let timeLeft = TURN_TIME_MS;
let timerInterval = null;

// DOM Elements
const ui = {
    gameContainer: document.getElementById('game-container'),
    gameLayout: document.getElementById('game-layout'),
    sideStatus: document.getElementById('side-status'),
    timerBarContainer: document.getElementById('timer-bar-container'),
    timerBar: document.getElementById('timer-bar'),
    statusBar: document.getElementById('status-bar'),
    mainMenu: document.getElementById('main-menu'),
    coinFlipScreen: document.getElementById('coin-flip-screen'),
    coin: document.getElementById('coin'),
    coinFront: document.getElementById('coin-front'),
    coinBack: document.getElementById('coin-back'),
    coinText: document.getElementById('coin-text'),
    transitionScreen: document.getElementById('transition-screen'),
    transitionTitle: document.getElementById('transition-title'),
    draftHeader: document.getElementById('draft-header'),
    draftFooter: document.getElementById('draft-footer'),
    pointsLeft: document.getElementById('draft-points'),
    colorPicker: document.querySelector('.color-picker'),
    shopItems: document.querySelectorAll('.shop-item'),
    boardContainer: document.getElementById('board-container'),
    chessboard: document.getElementById('chessboard'),
    endzoneTop: document.getElementById('endzone-top'),
    endzoneBottom: document.getElementById('endzone-bottom'),
    victoryScreen: document.getElementById('victory-screen'),
    victoryTitle: document.getElementById('victory-title'),
    victoryReason: document.getElementById('victory-reason'),
    
    // Draft UI
    draftPointsSpan: document.getElementById('draft-points'),
    shopItems: document.querySelectorAll('.shop-item'),
    colorSwatches: document.querySelectorAll('.color-swatch'),
    btnValidateDraft: document.getElementById('btn-validate-draft'),
    btnClearDraft: document.getElementById('btn-clear-draft'),
    btnRemoveMode: document.getElementById('btn-remove-mode'),
    btnMainMenu: document.getElementById('btn-main-menu'),
    btnHowToPlay: document.getElementById('btn-how-to-play'),
    rulesModal: document.getElementById('rules-modal'),
    btnCloseRules: document.getElementById('btn-close-rules'),
};

function serializeBoard() {
    let str = "";
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const p = board[r][c];
            str += p ? `${p.player}${p.type}` : ".";
        }
    }
    return str + currentPlayer;
}

// Initialization
function init() {
    setupEventListeners();
    showScreen(ui.mainMenu);
    ui.statusBar.textContent = "Welcome to Chessdown";
}

function setupEventListeners() {
    const btnStartLocal = document.getElementById('btn-start-local');
    if (btnStartLocal) {
        btnStartLocal.addEventListener('pointerdown', () => {
            currentRoomCode = null;
            enterFullscreen();
            startDraftPhase(1);
        });
    }

    const btnReady = document.getElementById('btn-ready');
    if (btnReady) {
        btnReady.addEventListener('pointerdown', handleTransitionReady);
    }

    const btnCreateRoom = document.getElementById('btn-create-room');
    const btnJoinRoom = document.getElementById('btn-join-room');
    const inputRoomCode = document.getElementById('room-code-input');

    if (btnCreateRoom) {
        btnCreateRoom.addEventListener('pointerdown', () => {
            if (!socket) return alert("Online mode is not available right now. Please launch the server.");
            enterFullscreen();
            socket.emit('createRoom');
        });
    }

    if (btnJoinRoom) {
        btnJoinRoom.addEventListener('pointerdown', () => {
            if (!socket) return alert("Online mode is not available right now. Please launch the server.");
            enterFullscreen();
            const code = inputRoomCode.value.trim().toUpperCase();
            if (code.length === 4) {
                socket.emit('joinRoom', code);
            } else {
                alert("Please enter a valid 4-letter code.");
            }
        });
    }

    // Socket Events
    if (socket) {
        socket.on('roomCreated', (code) => {
        currentRoomCode = code;
        myPlayerNumber = 1;
        document.getElementById('waiting-room-code').textContent = code;
        showScreen(document.getElementById('waiting-screen'));
    });

    socket.on('roomJoined', (data) => {
        currentRoomCode = data.roomCode;
        myPlayerNumber = data.playerNumber;
    });

    socket.on('gameStarted', (data) => {
        startDraftPhase(myPlayerNumber);
    });

    socket.on('draftPhaseEnded', (data) => {
        // Sync the fully merged board and colors from server
        board = data.roomState.board;
        playerColors = data.roomState.playerColors;
        startGameplay(data.roomState.currentPlayer);
    });

    // Brute-force color sync to bypass any UI listener issues
    setInterval(() => {
        if (currentRoomCode && gameState.startsWith('draft')) {
            socket.emit('colorSelected', { 
                roomCode: currentRoomCode, 
                player: myPlayerNumber, 
                color: playerColors[myPlayerNumber] 
            });
        }
    }, 500);

    socket.on('moveMade', (data) => {
        const { from, to, nextPlayer } = data;
        const targetPiece = board[to.r][to.c];
        const piece = board[from.r][from.c];
        
        // Handle King capture
        if (targetPiece && targetPiece.type === 'k') {
            const winner = piece.player;
            const winnerColorHex = COLOR_HEX[playerColors[winner]];
            
            // Move piece to king spot for visual satisfaction
            board[to.r][to.c] = piece;
            board[from.r][from.c] = null;
            if (piece) piece.hasMoved = true;
            renderBoard();

            if (myPlayerNumber === winner) {
                fireConfetti([winnerColorHex, '#f1c40f']);
                endGame('Victory!', `You captured the King!`, winner);
            } else {
                endGame('Defeat...', `Player ${winner} captured your King.`, winner);
            }
            return;
        }

        board[to.r][to.c] = piece;
        board[from.r][from.c] = null;
        if (piece) piece.hasMoved = true;
        
        currentPlayer = nextPlayer;
        selectedBoardPiece = null;
        clearHighlights();
        renderBoard();
        startTurn();
    });

    socket.on('playAgainStatus', (data) => {
        const btn = document.getElementById('btn-restart');
        if (btn && !btn.disabled) btn.textContent = `Play Again (${data.count}/2)`;
    });

    socket.on('opponentColorChanged', (color) => {
        const opponentPlayer = myPlayerNumber === 1 ? 2 : 1;
        playerColors[opponentPlayer] = color;
        if (gameState.startsWith('draft')) {
            setupColorPicker();
        }
    });

    socket.on('gameRestarted', () => {
        const btn = document.getElementById('btn-restart');
        if (btn) {
            btn.textContent = "Play Again";
            btn.disabled = false;
        }
        ui.victoryScreen.classList.add('hidden');
        
        // Reset local draft state
        draftPoints = { 1: MAX_POINTS, 2: MAX_POINTS };
        kingsPlaced = { 1: false, 2: false };
        
        startDraftPhase(myPlayerNumber);
    });

    socket.on('opponentLeft', () => {
        alert("Your opponent left the game.");
        resetGame();
        showScreen(ui.mainMenu);
    });

    socket.on('errorMsg', (msg) => {
        alert(msg);
    });
    } // End of if (socket)
    
    ui.btnMainMenu.addEventListener('pointerdown', () => {
        if (currentRoomCode) {
            socket.emit('leaveRoom', { roomCode: currentRoomCode });
            currentRoomCode = null;
        }
        resetGame();
        showScreen(ui.mainMenu);
        ui.statusBar.textContent = "Welcome to Chessdown";
    });

    const btnRestart = document.getElementById('btn-restart');
    if (btnRestart) {
        btnRestart.addEventListener('pointerdown', () => {
            if (currentRoomCode) {
                socket.emit('playAgainRequest', { roomCode: currentRoomCode });
                btnRestart.textContent = "Waiting... (1/2)";
                btnRestart.disabled = true;
            } else {
                // Fallback for local
                resetGame();
                startDraftPhase(1);
            }
        });
    }
    
    ui.btnHowToPlay.addEventListener('pointerdown', () => {
        showScreen(ui.rulesModal);
    });
    
    ui.btnCloseRules.addEventListener('pointerdown', () => {
        showScreen(ui.mainMenu);
    });
    
    ui.shopItems.forEach(item => {
        item.addEventListener('pointerdown', () => {
            if (removeMode) toggleRemoveMode();
            ui.shopItems.forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            selectedDraftPiece = {
                type: item.dataset.type,
                cost: parseInt(item.dataset.cost)
            };
        });
    });

    ui.colorSwatches.forEach(swatch => {
        swatch.addEventListener('pointerdown', () => {
            if (swatch.classList.contains('disabled')) return;
            ui.colorSwatches.forEach(s => s.classList.remove('selected'));
            swatch.classList.add('selected');
            playerColors[currentPlayer] = swatch.dataset.color;
            updateShopColors();
            renderBoard(); // Update piece colors dynamically
            
            if (currentRoomCode) {
                socket.emit('colorSelected', { roomCode: currentRoomCode, player: myPlayerNumber, color: swatch.dataset.color });
            }
        });
    });

    ui.btnRemoveMode.addEventListener('pointerdown', toggleRemoveMode);
    ui.btnClearDraft.addEventListener('pointerdown', clearCurrentDraft);
    ui.btnValidateDraft.addEventListener('pointerdown', validateDraft);
}

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

// --- Draft Logic ---

function toggleRemoveMode() {
    removeMode = !removeMode;
    ui.btnRemoveMode.textContent = removeMode ? "Remove Mode: ON" : "Remove Mode: OFF";
    ui.btnRemoveMode.classList.toggle('btn-danger', removeMode);
    ui.btnRemoveMode.classList.toggle('btn-secondary', !removeMode);
    if (removeMode) {
        selectedDraftPiece = null;
        ui.shopItems.forEach(i => i.classList.remove('selected'));
    }
}

function showTransitionScreen() {
    ui.gameLayout.classList.add('hidden');
    ui.draftHeader.classList.add('hidden');
    ui.draftFooter.classList.add('hidden');
    ui.transitionTitle.textContent = `Player ${currentPlayer}'s Turn`;
    ui.statusBar.textContent = `Waiting for Player ${currentPlayer}`;
    showScreen(ui.transitionScreen);
}

function startDraftPhase(player) {
    currentPlayer = player;
    gameState = `draft${player}`;
    
    if (!currentRoomCode) {
        if (player === 2) {
            ui.gameContainer.classList.add('rotate-180');
        } else {
            ui.gameContainer.classList.remove('rotate-180');
        }
    }
    
    ui.statusBar.classList.remove('hidden'); // Ensure visible
    
    if (!currentRoomCode && player === 2) {
        showTransitionScreen();
    } else {
        // Bypass the old transition screen, go straight to drafting!
        showScreen(ui.draftHeader);
        ui.draftFooter.classList.remove('hidden');
        ui.gameLayout.classList.remove('hidden');
        ui.gameContainer.classList.add('draft-mode');
        createBoardDOM(true);
        setupColorPicker();
        updateShopColors();
        updateDraftUI();
        renderBoard();
        ui.statusBar.textContent = `Draft Phase: Build your army!`;
    }
}

function handleTransitionReady() {
    showScreen(ui.draftHeader);
    ui.draftFooter.classList.remove('hidden'); // Also show footer
    ui.gameLayout.classList.remove('hidden');
    ui.gameContainer.classList.add('draft-mode');
    createBoardDOM(true);
    setupColorPicker();
    updateShopColors();
    updateDraftUI();
    renderBoard();
    ui.statusBar.textContent = `Draft Phase: Player ${currentPlayer}`;
}

function updateShopColors() {
    ui.shopItems.forEach(item => {
        item.className = item.className.replace(/jersey-\w+/g, '');
        item.classList.add(`jersey-${playerColors[currentPlayer]}`);
    });
}

function setupColorPicker() {
    ui.colorSwatches.forEach(s => s.classList.remove('disabled', 'selected'));

    const opponentPlayer = currentRoomCode ? (myPlayerNumber === 1 ? 2 : 1) : (currentPlayer === 1 ? 2 : 1);
    const opponentColor = playerColors[opponentPlayer];
    
    // Disable opponent's color
    const disabledSwatch = document.querySelector(`.color-swatch[data-color="${opponentColor}"]`);
    if (disabledSwatch) disabledSwatch.classList.add('disabled');

    // Auto select a different default color if current is disabled
    if (playerColors[currentPlayer] === opponentColor) {
        const available = document.querySelector(`.color-swatch:not(.disabled)`);
        if (available) {
            playerColors[currentPlayer] = available.dataset.color;
            updateShopColors();
            renderBoard();
            if (currentRoomCode) {
                socket.emit('colorSelected', { roomCode: currentRoomCode, player: myPlayerNumber, color: playerColors[currentPlayer] });
            }
        }
    }

    // Select current player's color
    const activeSwatch = document.querySelector(`.color-swatch[data-color="${playerColors[currentPlayer]}"]`);
    if (activeSwatch) activeSwatch.classList.add('selected');
}

function updateDraftUI() {
    ui.draftPointsSpan.textContent = draftPoints[currentPlayer];
    
    ui.shopItems.forEach(item => {
        const cost = parseInt(item.dataset.cost);
        const type = item.dataset.type;
        
        if (cost > draftPoints[currentPlayer] && type !== 'k') {
            item.classList.add('disabled');
        } else if (type === 'k' && kingsPlaced[currentPlayer]) {
            item.classList.add('disabled');
        } else {
            item.classList.remove('disabled');
        }
    });

    if (selectedDraftPiece) {
        const activeShopItem = document.querySelector(`.shop-item[data-type="${selectedDraftPiece.type}"]`);
        if (activeShopItem && activeShopItem.classList.contains('disabled')) {
            activeShopItem.classList.remove('selected');
            selectedDraftPiece = null;
        }
    }

    ui.btnValidateDraft.disabled = !kingsPlaced[currentPlayer];
}

function handleSquareClick(viewR, viewC) {
    if (gameState.startsWith('draft')) {
        handleDraftSquareClick(viewR, viewC);
    } else if (gameState === 'gameplay') {
        handleGameplaySquareClick(viewR, viewC);
    }
}

function handleDraftSquareClick(viewR, viewC) {
    const zone = getDraftZoneView();
    if (viewR < zone.min || viewR > zone.max) {
        // Blink row or square in red
        const squares = ui.chessboard.children;
        for (let c = 0; c < COLS; c++) {
            const sq = squares[viewR * COLS + c];
            sq.classList.remove('error-blink');
            void sq.offsetWidth; // trigger reflow
            sq.classList.add('error-blink');
        }
        return; // Outside draft zone
    }

    const { r, c } = getBoardCoords(viewR, viewC);
    const currentPiece = board[r][c];

    if (removeMode) {
        if (currentPiece && currentPiece.player === currentPlayer) {
            draftPoints[currentPlayer] += PIECES[currentPiece.type].value;
            if (currentPiece.type === 'k') kingsPlaced[currentPlayer] = false;
            board[r][c] = null;
            updateDraftUI();
            renderBoard();
        }
        return;
    }

    if (!selectedDraftPiece) return;

    if (currentPiece) {
        if (currentPiece.player === currentPlayer) {
            draftPoints[currentPlayer] += PIECES[currentPiece.type].value;
            if (currentPiece.type === 'k') kingsPlaced[currentPlayer] = false;
            board[r][c] = null;
        } else {
            return;
        }
    }

    if (selectedDraftPiece.type === 'k' && kingsPlaced[currentPlayer]) return;
    if (draftPoints[currentPlayer] >= selectedDraftPiece.cost) {
        board[r][c] = {
            type: selectedDraftPiece.type,
            player: currentPlayer,
            hasMoved: false
        };
        draftPoints[currentPlayer] -= selectedDraftPiece.cost;
        if (selectedDraftPiece.type === 'k') kingsPlaced[currentPlayer] = true;
        
        updateDraftUI();
        renderBoard();
    }
}

function clearCurrentDraft() {
    const zone = getDraftZoneView();
    for (let viewR = zone.min; viewR <= zone.max; viewR++) {
        for (let viewC = 0; viewC < COLS; viewC++) {
            const { r, c } = getBoardCoords(viewR, viewC);
            if (board[r][c] && board[r][c].player === currentPlayer) {
                board[r][c] = null;
            }
        }
    }
    draftPoints[currentPlayer] = MAX_POINTS;
    kingsPlaced[currentPlayer] = false;
    updateDraftUI();
    renderBoard();
}

function validateDraft() {
    if (currentRoomCode) {
        // Extract pieces for myPlayerNumber
        const myPieces = [];
        const zone = getDraftZoneView();
        for (let viewR = zone.min; viewR <= zone.max; viewR++) {
            for (let viewC = 0; viewC < COLS; viewC++) {
                const { r, c } = getBoardCoords(viewR, viewC);
                if (board[r][c] && board[r][c].player === myPlayerNumber) {
                    myPieces.push({ r, c, type: board[r][c].type });
                }
            }
        }
        
        socket.emit('draftComplete', {
            roomCode: currentRoomCode,
            player: myPlayerNumber,
            color: playerColors[myPlayerNumber],
            pieces: myPieces
        });

        // Hide draft UI and show waiting message
        ui.draftHeader.classList.add('hidden');
        ui.draftFooter.classList.add('hidden');
        ui.statusBar.textContent = "Waiting for opponent to finish drafting...";
        ui.btnValidateDraft.disabled = true;
    } else {
        if (currentPlayer === 1) {
            startDraftPhase(2);
        } else {
            // Both drafted! Start coin flip.
            ui.draftHeader.classList.add('hidden');
            ui.draftFooter.classList.add('hidden');
            const winner = Math.random() < 0.5 ? 1 : 2;
            startGameplay(winner);
        }
    }
}

// --- Gameplay Logic ---

function startGameplay(winner) {
    gameState = 'gameplay';
    positionHistory = {}; // Reset repetition history
    ui.statusBar.classList.add('hidden'); // Hide status bar during match
    
    ui.gameContainer.classList.remove('rotate-180');
    ui.gameContainer.classList.remove('draft-mode');
    
    ui.gameLayout.classList.remove('hidden');
    createBoardDOM(false);
    renderBoard();
    startCoinFlip(winner);
}

function finalizeGameplayStart() {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    ui.sideStatus.classList.remove('hidden'); // Show timer
    
    selectedBoardPiece = null;
    clearHighlights();
    renderBoard();
    startTurn();
}

function checkTouchdownWin() {
    const targetRow = currentPlayer === 1 ? 0 : ROWS - 1;
    for (let c = 0; c < COLS; c++) {
        const piece = board[targetRow][c];
        if (piece && piece.player === currentPlayer) {
            return true;
        }
    }
    return false;
}

function startTurn() {
    if (checkTouchdownWin()) {
        const winner = currentPlayer;
        const winnerColorHex = COLOR_HEX[playerColors[winner]];
        
        if (myPlayerNumber === winner) {
            fireConfetti([winnerColorHex, '#f1c40f']);
            endGame('Victory!', `TOUCHDOWN! You survived in the endzone!`, winner);
        } else {
            if (!currentRoomCode) {
                fireConfetti([winnerColorHex, '#f1c40f']);
                endGame('Victory!', `TOUCHDOWN! Player ${winner} survived in the endzone!`, winner);
            } else {
                endGame('Defeat...', `TOUCHDOWN! Player ${winner} survived in the endzone!`, winner);
            }
        }
        return;
    }
    
    const state = serializeBoard();
    positionHistory[state] = (positionHistory[state] || 0) + 1;
    if (positionHistory[state] >= 3) {
        const p1Color = COLOR_HEX[playerColors[1]];
        const p2Color = COLOR_HEX[playerColors[2]];
        fireConfetti([p1Color, p2Color], 30);
        endGame('DRAW', "by 3 repetitions", 0);
        return;
    }
    
    startTimer();
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timeLeft = TURN_TIME_MS;
    
    // Set hourglass flow direction
    // P1 (bottom) = flex-end (shrinks downwards)
    // P2 (top) = flex-start (shrinks upwards)
    ui.timerBarContainer.style.justifyContent = currentPlayer === 1 ? 'flex-end' : 'flex-start';

    // Setup initial bar color
    const hex = COLOR_HEX[playerColors[currentPlayer]];
    ui.timerBar.style.backgroundColor = hex;
    ui.timerBar.style.height = '100%';

    timerInterval = setInterval(() => {
        timeLeft -= 100; // Tick every 100ms
        const percent = (timeLeft / TURN_TIME_MS) * 100;
        ui.timerBar.style.height = `${percent}%`;

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            skipTurn();
        }
    }, 100);
}

function skipTurn() {
    clearHighlights();
    selectedBoardPiece = null;
    currentPlayer = currentPlayer === 1 ? 2 : 1;
    startTurn();
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

function handleGameplaySquareClick(viewR, viewC) {
    if (currentRoomCode && currentPlayer !== myPlayerNumber) return; // Ignore if not our turn in online mode

    const { r, c } = getBoardCoords(viewR, viewC);
    const clickedPiece = board[r][c];
    const squareEl = getSquareElement(viewR, viewC);

    if (selectedBoardPiece && squareEl.classList.contains('highlight')) {
        if (currentRoomCode) {
            // Send move to server
            socket.emit('makeMove', {
                roomCode: currentRoomCode,
                from: { r: selectedBoardPiece.r, c: selectedBoardPiece.c },
                to: { r, c }
            });
            selectedBoardPiece = null;
            clearHighlights();
        } else {
            // Local mode
            movePiece(selectedBoardPiece.r, selectedBoardPiece.c, r, c);
        }
        return;
    }

    const activePlayer = currentRoomCode ? myPlayerNumber : currentPlayer;
    if (clickedPiece && clickedPiece.player === activePlayer) {
        selectedBoardPiece = { r, c, piece: clickedPiece };
        highlightValidMoves(r, c);
    } else {
        selectedBoardPiece = null;
        clearHighlights();
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

function getValidMoves(r, c) {
    const piece = board[r][c];
    if (!piece) return [];
    
    const moves = [];
    const dir = piece.player === 1 ? -1 : 1; // P1 starts bottom (row 15), moves UP (-1). P2 starts top (row 0), moves DOWN (+1)

    function addIfValid(tr, tc, canCapture = true, mustCapture = false) {
        if (tr < 0 || tr >= ROWS || tc < 0 || tc >= COLS) return false;
        const target = board[tr][tc];
        
        if (!target) {
            if (!mustCapture) {
                moves.push({ r: tr, c: tc });
                return true;
            }
            return false;
        } else {
            if (canCapture && target.player !== piece.player) {
                moves.push({ r: tr, c: tc });
            }
            return false;
        }
    }

    function slide(dr, dc) {
        let tr = r + dr;
        let tc = c + dc;
        while (addIfValid(tr, tc)) {
            tr += dr;
            tc += dc;
        }
    }

    switch (piece.type) {
        case 'p':
            if (addIfValid(r + dir, c, false)) {
                if (!piece.hasMoved) {
                    addIfValid(r + dir * 2, c, false);
                }
            }
            addIfValid(r + dir, c - 1, true, true);
            addIfValid(r + dir, c + 1, true, true);
            
            if (lastMove && lastMove.piece.type === 'p' && lastMove.isDoubleStep) {
                if (lastMove.toR === r && Math.abs(lastMove.toC - c) === 1) {
                    moves.push({ r: r + dir, c: lastMove.toC, isEnPassant: true });
                }
            }
            break;

        case 'n':
            const knightMoves = [
                [-2,-1], [-2,1], [2,-1], [2,1],
                [-1,-2], [-1,2], [1,-2], [1,2]
            ];
            knightMoves.forEach(m => addIfValid(r + m[0], c + m[1]));
            break;

        case 'b':
            slide(1, 1); slide(1, -1); slide(-1, 1); slide(-1, -1);
            break;

        case 'r':
            slide(1, 0); slide(-1, 0); slide(0, 1); slide(0, -1);
            break;

        case 'q':
            slide(1, 0); slide(-1, 0); slide(0, 1); slide(0, -1);
            slide(1, 1); slide(1, -1); slide(-1, 1); slide(-1, -1);
            break;

        case 'k':
            const kingMoves = [
                [-1,-1], [-1,0], [-1,1],
                [0,-1],          [0,1],
                [1,-1],  [1,0],  [1,1]
            ];
            kingMoves.forEach(m => addIfValid(r + m[0], c + m[1]));
            break;
    }

    return moves;
}

function movePiece(fromR, fromC, toR, toC) {
    const piece = board[fromR][fromC];
    const targetPiece = board[toR][toC];
    
    let isEnPassant = piece.type === 'p' && fromC !== toC && targetPiece === null;
    let isDoubleStep = piece.type === 'p' && Math.abs(fromR - toR) === 2;

    board[toR][toC] = piece;
    board[fromR][fromC] = null;
    piece.hasMoved = true;

    if (isEnPassant) {
        board[fromR][toC] = null; 
    }

    lastMove = { piece, fromR, fromC, toR, toC, isDoubleStep };

    clearHighlights();
    selectedBoardPiece = null;
    renderBoard();

    if (targetPiece && targetPiece.type === 'k') {
        const winner = currentPlayer;
        const winnerColorHex = COLOR_HEX[playerColors[winner]];
        fireConfetti([winnerColorHex, '#f1c40f']);
        endGame('Victory!', `Player ${winner} captured the King!`, winner);
        return;
    }

    currentPlayer = currentPlayer === 1 ? 2 : 1;
    startTurn();
}

function isTouchdown(piece, r) {
    if (piece.player === 1 && r === 0) return true; // P1 starts bottom(15), ends top(0)
    if (piece.player === 2 && r === ROWS - 1) return true; // P2 starts top(0), ends bottom(15)
    return false;
}

function endGame(title, reason, winner) {
    gameState = 'over';
    clearInterval(timerInterval);
    ui.victoryTitle.textContent = title;
    ui.victoryReason.textContent = reason;
    
    const canvas = document.getElementById('confetti-canvas');
    if (!currentRoomCode && winner === 2) {
        ui.victoryScreen.classList.add('rotate-180');
        if (canvas) canvas.classList.add('rotate-180');
    } else {
        ui.victoryScreen.classList.remove('rotate-180');
        if (canvas) canvas.classList.remove('rotate-180');
    }
    
    showScreen(ui.victoryScreen);
}

function resetGame() {
    clearInterval(timerInterval);
    ui.sideStatus.classList.add('hidden');
    ui.gameContainer.classList.remove('rotate-180');
    ui.victoryScreen.classList.remove('rotate-180');
    const canvas = document.getElementById('confetti-canvas');
    if (canvas) canvas.classList.remove('rotate-180');
    board = Array(ROWS).fill(null).map(() => Array(COLS).fill(null));
    draftPoints = { 1: MAX_POINTS, 2: MAX_POINTS };
    kingsPlaced = { 1: false, 2: false };
    selectedDraftPiece = null;
    lastMove = null;
    currentDraftIndex = 0;
    positionHistory = {};
}

// Start
init();
