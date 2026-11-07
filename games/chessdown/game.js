// Socket.io Client
let socket = null;
if (typeof io !== 'undefined') {
    socket = io('/chessdown');
}
let currentRoomCode = null;
let myPlayerNumber = 1;

// Constants
// Rules live in engine.js (loaded first); this file is the UI and the bot.
const { ROWS, COLS, MAX_POINTS } = ChessdownEngine;

const PIECE_ICONS = { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' };
const PIECES = Object.fromEntries(Object.entries(ChessdownEngine.PIECE_VALUES)
    .map(([type, value]) => [type, { value, icon: PIECE_ICONS[type] }]));

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
let gameState = 'mainMenu'; // mainMenu, draft, gameplay, over
let currentPlayer = 1;
let draftOrder = [1, 2];
let currentDraftIndex = 0;
let draftPoints = { 1: MAX_POINTS, 2: MAX_POINTS };
let kingsPlaced = { 1: false, 2: false };
let playerColors = { 1: 'blue', 2: 'red' };
let selectedDraftPiece = null;
let removeMode = false;
let positionHistory = {};
let isBotMatch = false;
let botProfile = {
    depth: 5,
    pieceWeights: { 'p': 100, 'n': 300, 'b': 300, 'r': 500, 'q': 900, 'k': 10000 },
    centerBonusCols: 10,
    centerBonusRows: 20,
    pawnForwardBonus: 10,
    touchdownBonus: 2000
};
let botDifficultyLevel = 'master'; // novice, apprentice, expert, master
let botArchetype = 'normal'; // normal, ecuries, citadelle, chapiteau, chair, sorcieres
let botTrainingData = null; // Store the JSON data
// Gameplay state
let selectedBoardPiece = null;
let lastMove = null; // { piece, fromR, fromC, toR, toC, isDoubleStep }
let touchdownTimer = { player: null, row: null, col: null };
let isAnimating = false;

// Timer state
let timerMode = 'turn'; // 'turn' or 'overall'
let timerBaseSeconds = 10;
let playerTimeRemaining = { 1: 10000, 2: 10000 }; // In ms

let timeLeft = timerBaseSeconds * 1000;
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
    difficultyModal: document.getElementById('difficulty-modal'),
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
    
    // Timer UI
    btnShowTimer: document.getElementById('btn-show-timer'),
    timerModal: document.getElementById('timer-modal'),
    btnSaveTimer: document.getElementById('btn-save-timer'),
    timerMinInput: document.getElementById('timer-min'),
    timerSecInput: document.getElementById('timer-sec'),
    timerTextOverlay: document.getElementById('timer-text-overlay')
};

function serializeBoard() {
    return ChessdownEngine.serializeBoard(board, currentPlayer);
}

// Initialization
function init() {
    setupEventListeners();
    
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('demo') === 'true') {
        startDemo();
        return;
    }
    
    showScreen(ui.mainMenu);
    ui.statusBar.textContent = "Welcome to Chessdown";
    
    // Fetch AI training data once at startup
    fetch('training_data.json')
        .then(response => response.json())
        .then(data => {
            if (data && data.generations && data.generations.length > 0) {
                botTrainingData = data;
                console.log(`Loaded training data with ${data.generations.length} generations.`);
                if (urlParams.get('demo') !== 'true') {
                    loadBotProfileForDifficulty('master');
                } else {
                    loadBotProfileForDifficulty('novice');
                }
            }
        })
        .catch(err => {
            console.log("No trained AI found, using default bot profile.", err);
        });
}

function startDemo() {
    currentRoomCode = null;
    isBotMatch = true;
    botDifficultyLevel = 'novice';
    if(botTrainingData) loadBotProfileForDifficulty('novice');
    startDraftPhase(1);

    const overlay = document.createElement('div');
    overlay.id = 'demo-overlay-bubble';
    overlay.innerHTML = `
        <h2 style="margin: 0 0 15px 0; color: #2563eb; font-size: 1.2rem;">Interactive Demo</h2>
        <p id="demo-text" style="margin: 0; line-height: 1.5; font-size: 0.95rem;">Welcome to Chessdown! First, build your army. Click the highlighted <b>King</b> in the shop.</p>
        <a href="/" style="color: #3b82f6; text-decoration: none; margin-top: 15px; display: inline-block; pointer-events: auto; font-weight: bold; border-top: 1px solid #e2e8f0; padding-top: 10px; width: 100%;">← Return to Hub</a>
    `;
    
    let demoStep = 0;
    const pText = overlay.querySelector('#demo-text');
    
    const style = document.createElement('style');
    style.textContent = `
        #demo-overlay-bubble {
            position: absolute;
            width: 320px;
            background: white;
            color: #1e293b;
            padding: 20px;
            border-radius: 15px;
            z-index: 99999;
            text-align: left;
            border: 2px solid #e2e8f0;
            font-family: sans-serif;
            pointer-events: none;
            box-shadow: 0 10px 25px rgba(0,0,0,0.4);
        }
        .demo-highlight { animation: demoPulse 1.5s infinite; border: 2px solid #60a5fa !important; box-sizing: border-box; cursor: pointer !important; z-index: 100; position: relative; }
        @keyframes demoPulse { 0% { box-shadow: 0 0 0 0 rgba(96,165,250, 0.7); } 70% { box-shadow: 0 0 0 15px rgba(96,165,250, 0); } 100% { box-shadow: 0 0 0 0 rgba(96,165,250, 0); } }
    `;
    document.head.appendChild(style);
    
    // Position the bubble relative to the board dynamically to avoid overflow: hidden clipping
    setTimeout(() => {
        document.body.appendChild(overlay);
        const board = document.getElementById('chessboard');
        
        function updatePosition() {
            if (!document.getElementById('demo-overlay-bubble')) return;
            const r = board.getBoundingClientRect();
            // If there's enough space on the right (320px width + 40px margin)
            if (window.innerWidth > r.right + 360) {
                overlay.style.top = Math.max(20, r.top) + 'px';
                overlay.style.left = (r.right + 20) + 'px';
                overlay.style.transform = 'none';
            } else {
                // Otherwise put it on top center
                overlay.style.top = '20px';
                overlay.style.left = '50%';
                overlay.style.transform = 'translateX(-50%)';
            }
        }
        updatePosition();
        window.addEventListener('resize', updatePosition);
    }, 100);
    
    function highlightRow(r) {
        document.querySelectorAll('.demo-highlight').forEach(el => el.classList.remove('demo-highlight'));
        if (r !== null) {
            document.querySelectorAll(`.square[data-vr="${r}"]`).forEach(el => el.classList.add('demo-highlight'));
        }
    }

    setTimeout(() => {
        const kingItem = document.querySelector('.shop-item[data-type="k"]');
        if(kingItem) kingItem.classList.add('demo-highlight');
        
        const shopItems = document.querySelectorAll('.shop-item');
        shopItems.forEach(item => {
            item.addEventListener('pointerdown', (e) => {
                if (demoStep === 0 && item.dataset.type === 'k') {
                    demoStep = 1;
                    document.querySelectorAll('.demo-highlight').forEach(el => el.classList.remove('demo-highlight'));
                    pText.innerHTML = "Perfect! The King is your most vital piece. Click on any highlighted square on the <b>bottom row</b> to place it safely.";
                    highlightRow(5);
                } else if (demoStep === 2 && item.dataset.type === 'r') {
                    demoStep = 3;
                    document.querySelectorAll('.demo-highlight').forEach(el => el.classList.remove('demo-highlight'));
                    pText.innerHTML = "Good! Place the Rook on your last row to defend the King from side attacks.";
                    highlightRow(5);
                } else if (demoStep === 4 && item.dataset.type === 'r') {
                    demoStep = 5;
                    document.querySelectorAll('.demo-highlight').forEach(el => el.classList.remove('demo-highlight'));
                    pText.innerHTML = "Place the second Rook on your last row as well.";
                    highlightRow(5);
                } else if (demoStep === 6 && item.dataset.type === 'p') {
                    demoStep = 7;
                    document.querySelectorAll('.demo-highlight').forEach(el => el.classList.remove('demo-highlight'));
                    pText.innerHTML = "Pawns are great for breaking 'vis-à-vis' (direct line of sight) attacks. Place it in front of your King or Rooks (row 4).";
                    highlightRow(4);
                } else if (demoStep > 7) {
                    item.classList.remove('demo-highlight');
                }
            });
        });
        
        const originalHandleDraftSquareClick = handleDraftSquareClick;
        window.handleDraftSquareClick = function(viewR, viewC) {
            if (demoStep === 1) {
                if (viewR !== 5) {
                    pText.innerHTML = "<span style='color: #fca5a5;'>Please place the King on the highlighted bottom row!</span>";
                    return;
                }
                originalHandleDraftSquareClick(viewR, viewC);
                demoStep = 2;
                highlightRow(null);
                pText.innerHTML = "King placed! Now click the <b>Rook</b> in the shop to secure your backline.";
                const rookItem = document.querySelector('.shop-item[data-type="r"]');
                if(rookItem) rookItem.classList.add('demo-highlight');
            } else if (demoStep === 3) {
                if (viewR !== 5) {
                    pText.innerHTML = "<span style='color: #fca5a5;'>Please place the Rook on the bottom row to defend the King!</span>";
                    return;
                }
                originalHandleDraftSquareClick(viewR, viewC);
                demoStep = 4;
                highlightRow(null);
                pText.innerHTML = "First Rook placed. Buy a <b>second Rook</b>.";
                const rookItem = document.querySelector('.shop-item[data-type="r"]');
                if(rookItem) rookItem.classList.add('demo-highlight');
            } else if (demoStep === 5) {
                if (viewR !== 5) {
                    pText.innerHTML = "<span style='color: #fca5a5;'>Place it on the bottom row!</span>";
                    return;
                }
                originalHandleDraftSquareClick(viewR, viewC);
                demoStep = 6;
                highlightRow(null);
                pText.innerHTML = "Backline secured! Now click the <b>Pawn</b> in the shop.";
                const pawnItem = document.querySelector('.shop-item[data-type="p"]');
                if(pawnItem) pawnItem.classList.add('demo-highlight');
            } else if (demoStep === 7) {
                if (viewR !== 4) {
                    pText.innerHTML = "<span style='color: #fca5a5;'>Place the Pawn on the highlighted row in front of your pieces.</span>";
                    return;
                }
                originalHandleDraftSquareClick(viewR, viewC);
                demoStep = 8;
                highlightRow(null);
                pText.innerHTML = "Well done! Now you are on your own. <b>Spend ALL your remaining points</b> (try Queens or Knights). When points reach 0, click <b>Validate Draft</b>.";
                
                const checkPoints = setInterval(() => {
                    if (draftPoints[1] <= 1 && demoStep === 8) {
                        demoStep = 9;
                        const validateBtn = document.getElementById('btn-validate-draft');
                        if(validateBtn) validateBtn.classList.add('demo-highlight');
                        pText.innerHTML = "Your army is ready! Click <b>Validate Draft</b> to start the battle. Be fast, you only have 10 seconds per turn!";
                        clearInterval(checkPoints);
                    }
                }, 500);
            } else if (demoStep >= 8) {
                originalHandleDraftSquareClick(viewR, viewC);
            }
        };

        const oldBtn = ui.btnValidateDraft;
        const newBtn = oldBtn.cloneNode(true);
        oldBtn.parentNode.replaceChild(newBtn, oldBtn);
        ui.btnValidateDraft = newBtn;
        
        newBtn.addEventListener('pointerdown', () => {
            newBtn.classList.remove('demo-highlight');
            pText.innerHTML = "<b>Battle started!</b><br><br>• Pieces move exactly like in classical chess.<br>• <b>Win condition 1:</b> Capture the enemy King.<br>• <b>Win condition 2:</b> Reach the enemy's last row (Touchdown).<br><br>Good luck!";
            validateDraft();
        });

    }, 500);
}

function loadBotProfileForDifficulty(level) {
    botDifficultyLevel = level;
    if (!botTrainingData) return;

    const generations = botTrainingData.generations;
    let targetGenIndex = generations.length - 1; // Default to last
    let depth = 5;

    if (level === 'novice') {
        targetGenIndex = Math.min(39, generations.length - 1); // Gen 40
        depth = 3;
    } else if (level === 'apprentice') {
        targetGenIndex = Math.min(69, generations.length - 1); // Gen 70
        depth = 3;
    } else if (level === 'expert') {
        targetGenIndex = Math.min(89, generations.length - 1); // Gen 90
        depth = 4;
    } else if (level === 'master') {
        targetGenIndex = generations.length - 1; // Last Gen (Gen 100)
        depth = 5;
    }

    const selectedBot = generations[targetGenIndex].bestBot;
    console.log(`Loading AI Profile [${level.toUpperCase()}]: Gen ${targetGenIndex + 1}, Depth ${depth}`);
    botProfile = selectedBot;
    botProfile.depth = depth;
}

function setupEventListeners() {
    const btnStartLocal = document.getElementById('btn-start-local');
    if (btnStartLocal) {
        btnStartLocal.addEventListener('pointerdown', () => {
            currentRoomCode = null;
            isBotMatch = false;
            enterFullscreen();
            startDraftPhase(1);
        });
    }

    const btnStartBot = document.getElementById('btn-start-bot');
    if (btnStartBot) {
        btnStartBot.addEventListener('pointerdown', () => {
            ui.mainMenu.classList.add('hidden');
            ui.difficultyModal.classList.remove('hidden');
        });
    }

    const btnCloseDifficulty = document.getElementById('btn-close-difficulty');
    if (btnCloseDifficulty) {
        btnCloseDifficulty.addEventListener('pointerdown', () => {
            ui.difficultyModal.classList.add('hidden');
            ui.mainMenu.classList.remove('hidden');
        });
    }

    const diffButtons = document.querySelectorAll('.btn-difficulty');
    diffButtons.forEach(btn => {
        btn.addEventListener('pointerdown', (e) => {
            diffButtons.forEach(b => b.classList.remove('selected'));
            e.target.classList.add('selected');
            botDifficultyLevel = e.target.getAttribute('data-level');
        });
    });

    const archButtons = document.querySelectorAll('.btn-archetype');
    archButtons.forEach(btn => {
        btn.addEventListener('pointerdown', (e) => {
            archButtons.forEach(b => b.classList.remove('selected'));
            e.target.classList.add('selected');
            botArchetype = e.target.getAttribute('data-arch');
        });
    });

    const btnConfirmCampaign = document.getElementById('btn-confirm-campaign');
    if (btnConfirmCampaign) {
        btnConfirmCampaign.addEventListener('pointerdown', () => {
            loadBotProfileForDifficulty(botDifficultyLevel);
            ui.difficultyModal.classList.add('hidden');
            
            currentRoomCode = null;
            isBotMatch = true;
            enterFullscreen();
            startDraftPhase(1);
        });
    }

    if (ui.btnShowTimer) {
        ui.btnShowTimer.addEventListener('pointerdown', () => {
            ui.mainMenu.classList.add('hidden');
            ui.timerModal.classList.remove('hidden');
        });
    }

    const timerToggleBtns = document.querySelectorAll('.timer-toggle-btn');
    timerToggleBtns.forEach(btn => {
        btn.addEventListener('pointerdown', (e) => {
            timerToggleBtns.forEach(b => b.classList.remove('selected'));
            e.target.classList.add('selected');
            timerMode = e.target.getAttribute('data-mode');
            
            if (timerMode === 'turn') {
                document.getElementById('timer-desc-turn').classList.remove('hidden');
                document.getElementById('timer-desc-overall').classList.add('hidden');
            } else {
                document.getElementById('timer-desc-turn').classList.add('hidden');
                document.getElementById('timer-desc-overall').classList.remove('hidden');
            }
        });
    });

    if (ui.btnSaveTimer) {
        ui.btnSaveTimer.addEventListener('pointerdown', () => {
            const m = parseInt(ui.timerMinInput.value) || 0;
            const s = parseInt(ui.timerSecInput.value) || 0;
            timerBaseSeconds = (m * 60) + s;
            if (timerBaseSeconds <= 0) timerBaseSeconds = 10; // Fallback
            
            ui.timerModal.classList.add('hidden');
            ui.mainMenu.classList.remove('hidden');
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
    if (!kingsPlaced[currentPlayer]) return; // Extra safeguard against disabled buttons bypassing via pointerdown

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
            if (isBotMatch) {
                autoDraftBot();
                ui.draftHeader.classList.add('hidden');
                ui.draftFooter.classList.add('hidden');
                const winner = Math.random() < 0.5 ? 1 : 2;
                startGameplay(winner);
            } else {
                startDraftPhase(2);
            }
        } else {
            // Both drafted! Start coin flip.
            ui.draftHeader.classList.add('hidden');
            ui.draftFooter.classList.add('hidden');
            const winner = Math.random() < 0.5 ? 1 : 2;
            startGameplay(winner);
        }
    }
}

function autoDraftBot() {
    currentPlayer = 2;
    draftPoints[2] = MAX_POINTS;
    kingsPlaced[2] = false;

    // Pick a color different from P1
    const availableColors = Object.keys(COLOR_HEX).filter(c => c !== playerColors[1]);
    playerColors[2] = availableColors[Math.floor(Math.random() * availableColors.length)];

    // King Placement Logic
    let kR = 0;
    let kC = 2 + Math.floor(Math.random() * 4); // Safe central columns
    
    if (botDifficultyLevel === 'novice') {
        // Novice puts King anywhere in the top 3 rows
        kR = Math.floor(Math.random() * 3);
        kC = Math.floor(Math.random() * COLS);
    } else if (botDifficultyLevel === 'apprentice') {
        // Apprentice puts King in top 2 rows, mostly safe but sometimes exposed
        kR = Math.floor(Math.random() * 2);
    }
    
    board[kR][kC] = { type: 'k', player: 2, hasMoved: false };
    kingsPlaced[2] = true;

    const piecesPool = ['p', 'n', 'b', 'r', 'q'];
    
    let pieceCounts = { 'p': 0, 'n': 0, 'b': 0, 'r': 0, 'q': 0 };
    let army = [];

    // 0. Archétypes : Forcer l'achat de pièces spécifiques (50% du budget ~ 19 points)
    if (botArchetype !== 'normal') {
        let archPiece = '';
        let targetCount = 0;
        if (botArchetype === 'ecuries') { archPiece = 'n'; targetCount = 6; } // 18 pts
        else if (botArchetype === 'citadelle') { archPiece = 'r'; targetCount = 3; } // 15 pts
        else if (botArchetype === 'chapiteau') { archPiece = 'b'; targetCount = 6; } // 18 pts
        else if (botArchetype === 'chair') { archPiece = 'p'; targetCount = 19; } // 19 pts
        else if (botArchetype === 'sorcieres') { archPiece = 'q'; targetCount = 2; } // 18 pts

        for (let i = 0; i < targetCount; i++) {
            if (draftPoints[2] >= PIECES[archPiece].value) {
                pieceCounts[archPiece]++;
                army.push(archPiece);
                draftPoints[2] -= PIECES[archPiece].value;
            }
        }
    }

    // 1. Déterminer le reste de l'armée en fonction du budget et de l'ADN
    while (draftPoints[2] > 0) {
        let affordable = piecesPool.filter(p => PIECES[p].value <= draftPoints[2]);
        if (affordable.length === 0) break;

        let selectedPiece;

        if (botDifficultyLevel === 'novice') {
            // Pure random
            selectedPiece = affordable[Math.floor(Math.random() * affordable.length)];
        } else {
            // Draft intelligent avec rendements décroissants
            affordable.sort((a, b) => {
                let roiA = (botProfile.pieceWeights[a] / PIECES[a].value) / (pieceCounts[a] + 1);
                let roiB = (botProfile.pieceWeights[b] / PIECES[b].value) / (pieceCounts[b] + 1);
                return roiB - roiA;
            });

            selectedPiece = affordable[0];
            let subOptimalChance = 0.05; // Master
            if (botDifficultyLevel === 'expert') subOptimalChance = 0.15;
            if (botDifficultyLevel === 'apprentice') subOptimalChance = 0.50;

            if (affordable.length > 1 && Math.random() < subOptimalChance) {
                selectedPiece = affordable[1];
            }
        }
        
        pieceCounts[selectedPiece]++;
        army.push(selectedPiece);
        draftPoints[2] -= PIECES[selectedPiece].value;
    }

    // 2. Assigner des cases structurées (Phalange)
    let availableSlots = [];
    for(let r = 2; r >= 0; r--) {
        for(let c = 0; c < 8; c++) {
            if (board[r][c] === null) availableSlots.push({r, c});
        }
    }
    
    // Fonction d'aide pour placer une pièce au meilleur endroit disponible
    function placePiece(pieceType, preferredRows, preferEdges) {
        let bestSlotIdx = -1;
        let bestScore = -9999;
        
        for (let i = 0; i < availableSlots.length; i++) {
            let slot = availableSlots[i];
            let score = 0;
            
            // Priorité de rangée
            if (preferredRows.includes(slot.r)) {
                score += 100; // Forte préférence pour les bonnes lignes
                score -= preferredRows.indexOf(slot.r) * 10; // Préférer la première de la liste
            } else {
                score -= Math.abs(slot.r - preferredRows[0]) * 50;
            }
            
            // Priorité horizontale
            let distToCenter = Math.abs(slot.c - 3.5);
            if (preferEdges) {
                score += distToCenter * 10;
            } else {
                score -= distToCenter * 10;
            }
            
            if (score > bestScore) {
                bestScore = score;
                bestSlotIdx = i;
            }
        }
        
        if (bestSlotIdx !== -1) {
            let slot = availableSlots.splice(bestSlotIdx, 1)[0];
            board[slot.r][slot.c] = { type: pieceType, player: 2, hasMoved: false };
        }
    }

    // 3. Placement stratégique selon le type de pièce
    // Tours : sur la ligne de fond (0), sur les bords
    let rooks = army.filter(p => p === 'r');
    rooks.forEach(p => placePiece('r', [0, 1], true));
    
    // Reines : sur la ligne de fond (0), au centre
    let queens = army.filter(p => p === 'q');
    queens.forEach(p => placePiece('q', [0, 1], false));
    
    // Fous : sur les lignes arrière (0, 1), vers le centre
    let bishops = army.filter(p => p === 'b');
    bishops.forEach(p => placePiece('b', [0, 1], false));
    
    // Cavaliers : sur la ligne du milieu (1), répartis
    let knights = army.filter(p => p === 'n');
    knights.forEach(p => placePiece('n', [1, 2], false));
    
    // Pions : en première ligne (2), formant un mur
    let pawns = army.filter(p => p === 'p');
    pawns.forEach(p => placePiece('p', [2, 1, 0], false));
}

// --- Gameplay Logic ---

function startGameplay(winner) {
    gameState = 'gameplay';
    positionHistory = {}; // Reset repetition history
    playerTimeRemaining[1] = timerBaseSeconds * 1000;
    playerTimeRemaining[2] = timerBaseSeconds * 1000;
    
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
    return ChessdownEngine.hasPieceInEndzone(board, currentPlayer);
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

    if (isBotMatch && currentPlayer === 2 && gameState !== 'over') {
        setTimeout(playBotTurn, 500);
    }
}

function formatTime(ms) {
    const totalSecs = Math.ceil(ms / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    
    if (timerMode === 'turn') {
        timeLeft = timerBaseSeconds * 1000;
    }
    
    // Set hourglass flow direction
    // P1 (bottom) = flex-end (shrinks downwards)
    // P2 (top) = flex-start (shrinks upwards)
    ui.timerBarContainer.style.justifyContent = currentPlayer === 1 ? 'flex-end' : 'flex-start';

    // Setup initial bar color
    const hex = COLOR_HEX[playerColors[currentPlayer]];
    ui.timerBar.style.backgroundColor = hex;
    
    // Initial display
    const currentMs = timerMode === 'turn' ? timeLeft : playerTimeRemaining[currentPlayer];
    ui.timerBar.style.height = `${(currentMs / (timerBaseSeconds * 1000)) * 100}%`;
    ui.timerTextOverlay.textContent = formatTime(currentMs);

    timerInterval = setInterval(() => {
        if (timerMode === 'turn') {
            timeLeft -= 100;
            const percent = (timeLeft / (timerBaseSeconds * 1000)) * 100;
            ui.timerBar.style.height = `${percent}%`;
            ui.timerTextOverlay.textContent = formatTime(timeLeft);

            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                skipTurn();
            }
        } else {
            // Overall Mode
            playerTimeRemaining[currentPlayer] -= 100;
            const percent = (playerTimeRemaining[currentPlayer] / (timerBaseSeconds * 1000)) * 100;
            ui.timerBar.style.height = `${percent}%`;
            ui.timerTextOverlay.textContent = formatTime(playerTimeRemaining[currentPlayer]);

            if (playerTimeRemaining[currentPlayer] <= 0) {
                clearInterval(timerInterval);
                const winner = currentPlayer === 1 ? 2 : 1;
                const winnerColorHex = COLOR_HEX[playerColors[winner]];
                fireConfetti([winnerColorHex, '#f1c40f']);
                endGame('Time Out!', `Player ${currentPlayer} ran out of time!`, winner);
            }
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
    if (isAnimating) return;
    if (currentRoomCode && currentPlayer !== myPlayerNumber) return; // Ignore if not our turn in online mode
    if (isBotMatch && currentPlayer === 2) return; // Block human clicks when bot is playing

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
    return ChessdownEngine.getValidMoves({ board, lastMove }, r, c);
}

function movePiece(fromR, fromC, toR, toC) {
    if (isAnimating) return;
    
    const piece = board[fromR][fromC];
    const targetPiece = board[toR][toC];
    
    clearHighlights();
    selectedBoardPiece = null;

    // --- Animation Phase ---
    isAnimating = true;
    clearInterval(timerInterval); // Pause timer

    const { viewR: fVR, viewC: fVC } = getViewCoords(fromR, fromC);
    const { viewR: tVR, viewC: tVC } = getViewCoords(toR, toC);
    const fromSq = getSquareElement(fVR, fVC);
    const toSq = getSquareElement(tVR, tVC);

    if (fromSq && toSq) {
        const pieceIcon = fromSq.querySelector('.piece-icon');
        if (pieceIcon) {
            // Find target center
            const rectFrom = fromSq.getBoundingClientRect();
            const rectTo = toSq.getBoundingClientRect();
            const dx = rectTo.left - rectFrom.left;
            const dy = rectTo.top - rectFrom.top;

            // Make it pop up above other pieces
            pieceIcon.style.zIndex = '100';
            pieceIcon.style.position = 'relative';
            
            // Trigger hardware-accelerated transition
            requestAnimationFrame(() => {
                pieceIcon.style.transition = 'transform 0.3s ease-in-out';
                pieceIcon.style.transform = `translate(${dx}px, ${dy}px)`;
            });
        }
    }

    // --- Resolution Phase (After 300ms) ---
    setTimeout(() => {
        makeVirtualMove({ fromR, fromC, toR, toC }); // Also handles en passant and lastMove
        
        isAnimating = false;
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
    }, 300);
}

function endGame(title, reason, winner) {
    gameState = 'over';
    clearInterval(timerInterval);
    ui.victoryTitle.textContent = title;
    ui.victoryReason.textContent = reason;
    
    const canvas = document.getElementById('confetti-canvas');
    if (!currentRoomCode && winner === 2 && !isBotMatch) {
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

// --- Minimax AI ---

function checkTouchdownForPlayer(player) {
    return ChessdownEngine.hasPieceInEndzone(board, player);
}

function playBotTurn() {
    if (gameState === 'over') return;
    let bestMove = getBestMoveFromAI(botProfile.depth);
    if (bestMove) {
        movePiece(bestMove.fromR, bestMove.fromC, bestMove.toR, bestMove.toC);
    } else {
        skipTurn();
    }
}

function evaluateBoard() {
    let score = 0;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const piece = board[r][c];
            if (piece) {
                let val = piece.type === 'k' ? 10000 : (botProfile.pieceWeights[piece.type] || PIECES[piece.type].value * 100);
                let positionBonus = 0;

                // Contrôle du centre (dynamique basé sur l'entraînement)
                let centerBonus = 0;
                let bonusCols = botProfile.centerBonusCols !== undefined ? botProfile.centerBonusCols : 10;
                let bonusRows = botProfile.centerBonusRows !== undefined ? botProfile.centerBonusRows : 20;
                
                if (c >= 2 && c <= 5) centerBonus += bonusCols;
                if (r >= 4 && r <= 7) centerBonus += bonusRows;
                
                if (piece.type !== 'p' && piece.type !== 'k') {
                    positionBonus += centerBonus;
                }

                // Incitation au Touchdown (dynamique basé sur l'entraînement)
                let pawnForward = botProfile.pawnForwardBonus !== undefined ? botProfile.pawnForwardBonus : 10;
                let tdBonus = botProfile.touchdownBonus !== undefined ? botProfile.touchdownBonus : 2000;

                if (piece.player === 2) {
                    if (piece.type === 'p') positionBonus += r * pawnForward;
                    if (r === ROWS - 1) positionBonus += tdBonus;
                    score += val + positionBonus;
                } else {
                    if (piece.type === 'p') positionBonus += (ROWS - 1 - r) * pawnForward;
                    if (r === 0) positionBonus += tdBonus;
                    score -= (val + positionBonus);
                }
            }
        }
    }
    return score;
}

// Plays a move on the global board and keeps `lastMove` in sync.
function makeVirtualMove(move) {
    const state = { board, lastMove };
    const undoData = ChessdownEngine.applyMove(state, move);
    lastMove = state.lastMove;
    return undoData;
}

function undoVirtualMove(move, undoData) {
    const state = { board, lastMove };
    ChessdownEngine.undoMove(state, move, undoData);
    lastMove = state.lastMove;
}

function generateAllMoves(player) {
    return ChessdownEngine.generateAllMoves({ board, lastMove }, player);
}

function minimax(depth, alpha, beta, isMaximizing) {
    // Check if game over (King captured) BEFORE checking depth === 0
    let p1King = false, p2King = false;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c] && board[r][c].type === 'k') {
                if (board[r][c].player === 1) p1King = true;
                if (board[r][c].player === 2) p2King = true;
            }
        }
    }
    if (!p1King) return 99999 + depth; // P2 wins (Maximizer)
    if (!p2King) return -99999 - depth; // P1 wins (Minimizer)

    // Touchdown is an instant win if the piece survived until the start of the player's turn.
    // isMaximizing == true means it is P2's turn to play.
    if (isMaximizing && checkTouchdownForPlayer(2)) return 99999 + depth;
    if (!isMaximizing && checkTouchdownForPlayer(1)) return -99999 - depth;

    if (depth === 0) {
        return evaluateBoard();
    }

    const moves = generateAllMoves(isMaximizing ? 2 : 1);
    
    if (moves.length === 0) return isMaximizing ? -99999 : 99999;

    // Trier les coups pour optimiser l'élagage (absolument crucial pour que le Roi soit vu avant d'élaguer)
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

function getBestMoveFromAI(depth) {
    let bestMove = null;
    let maxEval = -Infinity;
    let alpha = -Infinity;
    let beta = Infinity;

    const moves = generateAllMoves(2);
    
    // Sort moves to improve alpha-beta pruning (King must be highest priority)
    moves.sort((a, b) => {
        let targetA = board[a.toR][a.toC];
        let targetB = board[b.toR][b.toC];
        let valA = targetA ? (targetA.type === 'k' ? 10000 : PIECES[targetA.type].value) : 0;
        let valB = targetB ? (targetB.type === 'k' ? 10000 : PIECES[targetB.type].value) : 0;
        return valB - valA;
    });

    for (let move of moves) {
        let undoData = makeVirtualMove(move);
        let ev = minimax(depth - 1, alpha, beta, false);
        undoVirtualMove(move, undoData);
        
        // Add tiny random noise to avoid playing the exact same game every time
        ev += Math.random() * 0.1;

        if (ev > maxEval) {
            maxEval = ev;
            bestMove = move;
        }
        alpha = Math.max(alpha, ev);
    }
    return bestMove;
}

// Start
init();
