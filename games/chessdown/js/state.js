// Chessdown client state: socket, constants, game state and DOM references.

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
