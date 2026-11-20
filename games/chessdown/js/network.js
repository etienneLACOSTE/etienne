// @ts-check
// Online play: Socket.io event handlers, registered by setupEventListeners().
import { fireConfetti } from '../confetti.js';
import { COLOR_HEX, Engine, MAX_POINTS, playerName, socket, state, ui } from './state.js';
import { clearHighlights, renderBoard, showScreen } from './board-view.js';
import { setupColorPicker, startDraftPhase } from './draft.js';
import { endGame, resetGame, resumeGameplay, startGameplay, startTurn } from './gameplay.js';
import { makeVirtualMove } from './rules-bridge.js';
import { refreshInvites } from './invites.js';
import { watchConnection } from '../../../assets/js/connection-notice.js';
import { notify } from '../../../assets/js/dialog.js';
import { drawTurnPlayed } from './draw.js';
import { chat } from './chat.js';
import { forgetSeat, keepSeat, RESUME_FAILED } from '../../../assets/js/seat.js';

/**
 * Show the game the server sent back to a reloaded page: the waiting room, the draft
 * (started again, or waiting for the opponent once drafted) or the game in progress.
 * @param {any} data server/chessdown.js resumeState
 */
function resumeOnlineGame(data) {
    resetGame();
    ui.victoryScreen.classList.add('hidden');
    state.currentRoomCode = data.id;
    state.myPlayerNumber = data.playerNumber;
    state.isBotMatch = false;
    state.timerMode = data.timer.mode;
    state.timerBaseSeconds = data.timer.seconds;
    state.playerNames = data.names || { 1: null, 2: null };
    state.playerColors = data.playerColors;
    state.board = data.board;
    state.lastMove = data.lastMove;
    if (data.gameState === 'waiting') {
        document.getElementById('waiting-room-code').textContent = data.id;
        showScreen(document.getElementById('waiting-screen'));
        refreshInvites();
        return;
    }
    chat?.start(); // Both players are in the room
    if (data.gameState === 'drafting') {
        const me = state.myPlayerNumber;
        // Points and king of the pieces already placed (only once drafted).
        const mine = state.board.flat().filter((piece) => piece && piece.player === me);
        state.draftPoints[me] = MAX_POINTS - mine.reduce((sum, piece) => sum + Engine.PIECE_VALUES[piece.type], 0);
        state.kingsPlaced[me] = mine.some((piece) => piece.type === 'k');
        startDraftPhase(me);
        if (data.drafted) {
            ui.draftHeader.classList.add('hidden');
            ui.draftFooter.classList.add('hidden');
            ui.statusBar.textContent = 'Waiting for opponent to finish drafting...';
            ui.btnValidateDraft.disabled = true;
        }
        return;
    }
    resumeGameplay(data);
}

export function setupNetwork() {
    // Socket Events
    if (socket) {
        socket.on('roomCreated', (code) => {
        state.currentRoomCode = code;
        state.myPlayerNumber = 1;
        document.getElementById('waiting-room-code').textContent = code;
        showScreen(document.getElementById('waiting-screen'));
        refreshInvites();
    });

    socket.on('roomJoined', (data) => {
        state.currentRoomCode = data.roomCode;
        state.myPlayerNumber = data.playerNumber;
    });

    socket.on('gameStarted', (data) => {
        // Both players use the room's timer (chosen by its creator).
        const timer = data && data.roomState && data.roomState.timer;
        if (timer) {
            state.timerMode = timer.mode;
            state.timerBaseSeconds = timer.seconds;
        }
        state.playerNames = (data && data.roomState && data.roomState.names) || { 1: null, 2: null };
        startDraftPhase(state.myPlayerNumber);
        chat?.start(); // Both players are in the room
    });

    socket.on('draftPhaseEnded', (data) => {
        // Sync the fully merged board and colors from server
        state.board = data.roomState.board;
        state.playerColors = data.roomState.playerColors;
        startGameplay(data.roomState.currentPlayer);
    });

    // Brute-force color sync to bypass any UI listener issues
    setInterval(() => {
        if (state.currentRoomCode && state.gameState.startsWith('draft')) {
            socket.emit('colorSelected', { 
                roomCode: state.currentRoomCode, 
                player: state.myPlayerNumber, 
                color: state.playerColors[state.myPlayerNumber] 
            });
        }
    }, 500);

    socket.on('moveMade', (data) => {
        const { from, to, nextPlayer } = data;
        const targetPiece = state.board[to.r][to.c];
        const piece = state.board[from.r][from.c];
        
        // Handle King capture
        if (targetPiece && targetPiece.type === 'k') {
            const winner = piece.player;
            const winnerColorHex = COLOR_HEX[state.playerColors[winner]];
            
            // Move piece to king spot for visual satisfaction
            state.board[to.r][to.c] = piece;
            state.board[from.r][from.c] = null;
            if (piece) piece.hasMoved = true;
            renderBoard();

            if (state.myPlayerNumber === winner) {
                fireConfetti([winnerColorHex, '#f1c40f']);
                endGame('Victory!', `You captured the King!`, winner);
            } else {
                endGame('Defeat...', `${playerName(winner)} captured your King.`, winner);
            }
            return;
        }

        // Same resolution as local play: handles en passant and records lastMove.
        if (piece) makeVirtualMove({ fromR: from.r, fromC: from.c, toR: to.r, toC: to.c });

        state.currentPlayer = nextPlayer;
        state.selectedBoardPiece = null;
        clearHighlights();
        renderBoard();
        drawTurnPlayed();
        startTurn();
    });

    // Overall timer: the server declares who ran out of time.
    socket.on('timeOut', (data) => {
        if (state.gameState === 'over') return;
        const winner = data.loser === 1 ? 2 : 1;
        if (state.myPlayerNumber === winner) {
            fireConfetti([COLOR_HEX[state.playerColors[winner]], '#f1c40f']);
            endGame('Time Out!', 'Your opponent ran out of time!', winner);
        } else {
            endGame('Time Out!', 'You ran out of time.', winner);
        }
    });

        socket.on('turnSkipped', (data) => {
        state.currentPlayer = data.nextPlayer;
        state.selectedBoardPiece = null;
        clearHighlights();
        drawTurnPlayed();
        startTurn();
    });

    // Both players agreed on a draw (offers: draw.js).
    socket.on('drawAgreed', () => {
        if (state.gameState === 'over') return;
        fireConfetti([COLOR_HEX[state.playerColors[1]], COLOR_HEX[state.playerColors[2]]], 30);
        endGame('DRAW', 'by agreement', 0, 'agreement');
    });

    socket.on('playAgainStatus', (data) => {
        const btn = /** @type {HTMLButtonElement} */ (document.getElementById('btn-restart'));
        if (btn && !btn.disabled) btn.textContent = `Play Again (${data.count}/2)`;
    });

    socket.on('opponentColorChanged', (color) => {
        const opponentPlayer = state.myPlayerNumber === 1 ? 2 : 1;
        state.playerColors[opponentPlayer] = color;
        if (state.gameState.startsWith('draft')) {
            setupColorPicker();
        }
    });

    socket.on('gameRestarted', () => {
        const btn = /** @type {HTMLButtonElement} */ (document.getElementById('btn-restart'));
        if (btn) {
            btn.textContent = "Play Again";
            btn.disabled = false;
        }
        ui.victoryScreen.classList.add('hidden');
        
        // Reset local draft state
        state.draftPoints = { 1: MAX_POINTS, 2: MAX_POINTS };
        state.kingsPlaced = { 1: false, 2: false };
        
        startDraftPhase(state.myPlayerNumber);
    });

    socket.on('opponentLeft', () => {
        state.currentRoomCode = null;
        resetGame();
        showScreen(ui.mainMenu);
        notify('Your opponent left the game.');
    });

    // The server closed an idle room (see server/socket-utils.js).
    socket.on('roomClosed', (reason) => {
        state.currentRoomCode = null;
        resetGame();
        showScreen(ui.mainMenu);
        notify(reason);
    });

    socket.on('errorMsg', (msg) => {
        notify(msg);
    });

    // A reloaded page comes back to its game (assets/js/seat.js).
    keepSeat(socket, 'chessdown', {
        idle: () => !state.currentRoomCode && !['draft1', 'draft2', 'gameplay'].includes(state.gameState),
        onResumed: resumeOnlineGame,
        onFailed: (reason) => notify(RESUME_FAILED[reason]),
    });

    // A dropped connection: the server keeps the seat a while (see connection-notice.js).
    watchConnection(socket, {
        inRoom: () => Boolean(state.currentRoomCode),
        onLost: () => {
            state.currentRoomCode = null; // The room is gone: nothing to leave
            forgetSeat('chessdown');
            if (state.gameState === 'over') return; // The end screen stays up
            resetGame();
            showScreen(ui.mainMenu);
            notify('Connection lost: the game could not be resumed.');
        },
    });
    } // End of if (socket)
}
