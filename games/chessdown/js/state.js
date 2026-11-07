// @ts-check
// Chessdown client state: socket, constants, game state and DOM references.
// Every module imports `state` and reads or changes its fields (state.board, ...).
// Socket.io client (absent when the page is opened without the server).
export const socket = typeof io !== 'undefined' ? io('/chessdown') : null;

// Rules live in engine.js (a classic script loaded first, shared with the server).
export const Engine = globalThis.ChessdownEngine;
export const { ROWS, COLS, MAX_POINTS } = Engine;
// Bot draft and search (bot-search.js, a classic script shared with the trainer).
export const Bot = globalThis.ChessdownBot;

// Filled glyphs for both sides: CSS colours them with the jersey and an outline.
export const PIECE_ICONS = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };
export const PIECES = Object.fromEntries(Object.entries(Engine.PIECE_VALUES)
    .map(([type, value]) => [type, { value, icon: PIECE_ICONS[type] }]));

export const COLOR_HEX = {
    'red': '#e74c3c',
    'blue': '#3498db',
    'green': '#2ecc71',
    'yellow': '#f1c40f',
    'purple': '#9b59b6',
    'orange': '#e67e22',
    'white': '#ecf0f1',
    'black': '#2c3e50'
};

export const state = {
    // Online
    /** @type {string|null} */
    currentRoomCode: null,
    myPlayerNumber: 1,

    // Game
    /** @type {Array<Array<{type: string, player: number, hasMoved?: boolean}|null>>} */
    board: Array(ROWS).fill(null).map(() => Array(COLS).fill(null)),
    gameState: 'mainMenu', // mainMenu, draft1, draft2, gameplay, over
    currentPlayer: 1,
    draftOrder: [1, 2],
    currentDraftIndex: 0,
    draftPoints: { 1: MAX_POINTS, 2: MAX_POINTS },
    kingsPlaced: { 1: false, 2: false },
    playerColors: { 1: 'blue', 2: 'red' },
    /** @type {{type: string, cost: number}|null} */
    selectedDraftPiece: null,
    removeMode: false,
    /** @type {Record<string, number>} */
    positionHistory: {},

    // Bot
    isBotMatch: false,
    /** @type {any} */
    botProfile: { ...Bot.DEFAULT_PROFILE, pieceWeights: { ...Bot.DEFAULT_PROFILE.pieceWeights } },
    botDifficultyLevel: 'master', // novice, apprentice, expert, master
    botArchetype: 'normal', // normal, ecuries, citadelle, chapiteau, chair, sorcieres
    /** @type {any} */
    botTrainingData: null, // training_data.json

    // Play
    /** @type {any} */
    selectedBoardPiece: null,
    /** @type {any} */
    lastMove: null, // { piece, fromR, fromC, toR, toC, isDoubleStep }
    touchdownTimer: { player: null, row: null, col: null },
    isAnimating: false,

    // Timer
    timerMode: 'turn', // 'turn' or 'overall'
    timerBaseSeconds: 10,
    playerTimeRemaining: { 1: 10000, 2: 10000 }, // In ms
    timeLeft: 10_000,
    /** @type {any} */
    timerInterval: null,
};

// DOM Elements
export const ui = {
    gameContainer: /** @type {HTMLElement} */ (document.getElementById('game-container')),
    gameLayout: /** @type {HTMLElement} */ (document.getElementById('game-layout')),
    sideStatus: /** @type {HTMLElement} */ (document.getElementById('side-status')),
    timerBarContainer: /** @type {HTMLElement} */ (document.getElementById('timer-bar-container')),
    timerBar: /** @type {HTMLElement} */ (document.getElementById('timer-bar')),
    statusBar: /** @type {HTMLElement} */ (document.getElementById('status-bar')),
    mainMenu: /** @type {HTMLElement} */ (document.getElementById('main-menu')),
    coinFlipScreen: /** @type {HTMLElement} */ (document.getElementById('coin-flip-screen')),
    coin: /** @type {HTMLElement} */ (document.getElementById('coin')),
    coinFront: /** @type {HTMLElement} */ (document.getElementById('coin-front')),
    coinBack: /** @type {HTMLElement} */ (document.getElementById('coin-back')),
    coinText: /** @type {HTMLElement} */ (document.getElementById('coin-text')),
    transitionScreen: /** @type {HTMLElement} */ (document.getElementById('transition-screen')),
    transitionTitle: /** @type {HTMLElement} */ (document.getElementById('transition-title')),
    draftHeader: /** @type {HTMLElement} */ (document.getElementById('draft-header')),
    draftFooter: /** @type {HTMLElement} */ (document.getElementById('draft-footer')),
    pointsLeft: /** @type {HTMLElement} */ (document.getElementById('draft-points')),
    colorPicker: /** @type {HTMLElement} */ (document.querySelector('.color-picker')),
    shopItems: /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.shop-item')),
    boardContainer: /** @type {HTMLElement} */ (document.getElementById('board-container')),
    difficultyModal: /** @type {HTMLElement} */ (document.getElementById('difficulty-modal')),
    chessboard: /** @type {HTMLElement} */ (document.getElementById('chessboard')),
    endzoneTop: /** @type {HTMLElement} */ (document.getElementById('endzone-top')),
    endzoneBottom: /** @type {HTMLElement} */ (document.getElementById('endzone-bottom')),
    victoryScreen: /** @type {HTMLElement} */ (document.getElementById('victory-screen')),
    victoryTitle: /** @type {HTMLElement} */ (document.getElementById('victory-title')),
    victoryReason: /** @type {HTMLElement} */ (document.getElementById('victory-reason')),
    
    // Draft UI
    draftPointsSpan: /** @type {HTMLElement} */ (document.getElementById('draft-points')),
    colorSwatches: /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.color-swatch')),
    btnValidateDraft: /** @type {HTMLButtonElement} */ (document.getElementById('btn-validate-draft')),
    btnClearDraft: /** @type {HTMLButtonElement} */ (document.getElementById('btn-clear-draft')),
    btnRemoveMode: /** @type {HTMLButtonElement} */ (document.getElementById('btn-remove-mode')),
    btnMainMenu: /** @type {HTMLButtonElement} */ (document.getElementById('btn-main-menu')),
    btnHowToPlay: /** @type {HTMLButtonElement} */ (document.getElementById('btn-how-to-play')),
    rulesModal: /** @type {HTMLElement} */ (document.getElementById('rules-modal')),
    btnCloseRules: /** @type {HTMLButtonElement} */ (document.getElementById('btn-close-rules')),
    
    // Timer UI
    btnShowTimer: /** @type {HTMLButtonElement} */ (document.getElementById('btn-show-timer')),
    timerModal: /** @type {HTMLElement} */ (document.getElementById('timer-modal')),
    btnSaveTimer: /** @type {HTMLButtonElement} */ (document.getElementById('btn-save-timer')),
    timerMinInput: /** @type {HTMLInputElement} */ (document.getElementById('timer-min')),
    timerSecInput: /** @type {HTMLInputElement} */ (document.getElementById('timer-sec')),
    timerTextOverlay: /** @type {HTMLElement} */ (document.getElementById('timer-text-overlay'))
};
