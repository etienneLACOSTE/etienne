// @ts-check
// Online play: Socket.io event handlers, registered by setupEventListeners().
import { fireConfetti } from '../confetti.js';
import { COLOR_HEX, MAX_POINTS, socket, state, ui } from './state.js';
import { clearHighlights, renderBoard, showScreen } from './board-view.js';
import { setupColorPicker, startDraftPhase } from './draft.js';
import { endGame, resetGame, startGameplay, startTurn } from './gameplay.js';
import { makeVirtualMove } from './rules-bridge.js';

export function setupNetwork() {
    // Socket Events
    if (socket) {
        socket.on('roomCreated', (code) => {
        state.currentRoomCode = code;
        state.myPlayerNumber = 1;
        document.getElementById('waiting-room-code').textContent = code;
        showScreen(document.getElementById('waiting-screen'));
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
        startDraftPhase(state.myPlayerNumber);
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
                endGame('Defeat...', `Player ${winner} captured your King.`, winner);
            }
            return;
        }

        // Same resolution as local play: handles en passant and records lastMove.
        if (piece) makeVirtualMove({ fromR: from.r, fromC: from.c, toR: to.r, toC: to.c });

        state.currentPlayer = nextPlayer;
        state.selectedBoardPiece = null;
        clearHighlights();
        renderBoard();
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
        startTurn();
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
        alert("Your opponent left the game.");
        resetGame();
        showScreen(ui.mainMenu);
    });

    // The server closed an idle room (see server/socket-utils.js).
    socket.on('roomClosed', (reason) => {
        alert(reason);
        resetGame();
        showScreen(ui.mainMenu);
    });

    socket.on('errorMsg', (msg) => {
        alert(msg);
    });
    } // End of if (socket)
}
