// @ts-check
// Gameplay: turns, timer, moves, end of game.
import { fireConfetti } from '../confetti.js';
import { COLOR_HEX, COLS, Engine, MAX_POINTS, ROWS, playerName, socket, state, ui } from './state.js';
import { clearHighlights, createBoardDOM, getSquareElement, highlightValidMoves, renderBoard, showScreen, showStarter, startCoinFlip } from './board-view.js';
import { getBoardCoords, getViewCoords } from './coords.js';
import { chooseBotMove } from './bot.js';
import { announceTurn, resetAnnouncements } from './a11y.js';
import { checkTouchdownWin, makeVirtualMove, serializeBoard } from './rules-bridge.js';
import { reportResult } from '../../../assets/js/session.js';
import { resetDrawOffers } from './draw.js';
import { chat } from './chat.js';
import { forgetSeat } from '../../../assets/js/seat.js';
import { t } from '../../../assets/js/i18n.js';
import { hideScore, recordLocalGame, seriesEnd, showScore } from './match.js';
import { afterMove, beforeMove, noteGameStart, noteTouchdown, settleGame } from './all-star.js';
import { hideLadderResult } from './ladder-view.js';
import { closePieceInfo, markBoardSeen, showPieceInfo } from './piece-guide.js';

/** Levels are in play: All Star (a club, the career, online), or any piece with a level. */
const levelsInPlay = () => Boolean(state.allStar) || state.board.some((row) => row.some((p) => p && p.level !== undefined));
import { esc } from './club-art.js';
import { careerAfterGame, careerAfterMove, careerGameRules, careerNoTouchdowns, careerPuzzle, noteCareerTouchdown, puzzleTurn } from './career-match.js';

// --- Gameplay Logic ---

/**
 * Both armies are drafted: the match starts with the coin flip, or, in a series, with the
 * loser of the last game (`coin` false).
 * @param {number} winner who starts @param {{ coin?: boolean, text?: string }} [options]
 *   text: what is said instead of "the loser starts" (a career puzzle's instruction)
 */
export function startGameplay(winner, { coin = true, text = '' } = {}) {
    resetAnnouncements(); // a11y.js
    state.gameState = 'gameplay';
    resetDrawOffers();
    state.matchStartedAt = Date.now();
    state.positionHistory = {}; // Reset repetition history
    state.rules = careerGameRules(); // A career quest's special rules (fresh each game), or none
    state.playerTimeRemaining[1] = state.timerBaseSeconds * 1000;
    state.playerTimeRemaining[2] = state.timerBaseSeconds * 1000;
    
    ui.statusBar.classList.add('hidden'); // Hide status bar during match
    
    ui.gameContainer.classList.remove('rotate-180');
    ui.gameContainer.classList.remove('draft-mode');
    
    ui.gameLayout.classList.remove('hidden');
    createBoardDOM(false);
    renderBoard();
    showMatchup();
    showScore();
    noteGameStart(); // All Star: who of the club plays this game
    if (levelsInPlay()) markBoardSeen(state.currentRoomCode ? (state.myPlayerNumber === 1 ? 2 : 1) : 2); // The levels met (piece-guide.js)
    ui.chessboard.classList.add('levels-shown'); // Levels in view until the first move
    if (coin) startCoinFlip(winner, finalizeGameplayStart);
    else showStarter(winner, text || t('series.loserStarts', { name: playerName(winner) }), finalizeGameplayStart);
}

/** Online, the coin flip shows who plays whom: "Alice vs Bob" (a guest is "Player N"). */
function showMatchup() {
    const matchup = document.getElementById('matchup');
    if (!matchup) return;
    matchup.hidden = !state.currentRoomCode;
    const me = state.myPlayerNumber;
    matchup.textContent = t('coin.matchup', { a: playerName(me), b: playerName(me === 1 ? 2 : 1) });
}

/**
 * Online, a page that comes back to a game in progress (assets/js/seat.js): the board as
 * the server keeps it, whose turn it is and the time left, without the coin flip.
 * @param {{ currentPlayer: number, positionHistory: Record<string, number>, timeLeft: Record<number, number> }} game
 */
export function resumeGameplay({ currentPlayer, positionHistory, timeLeft }) {
    resetAnnouncements(); // a11y.js
    state.gameState = 'gameplay';
    resetDrawOffers();
    state.positionHistory = { ...positionHistory }; // The current position is counted already
    state.currentPlayer = currentPlayer;
    state.playerTimeRemaining[1] = timeLeft[1];
    state.playerTimeRemaining[2] = timeLeft[2];
    ui.statusBar.classList.add('hidden');
    ui.gameContainer.classList.remove('rotate-180', 'draft-mode');
    ui.gameLayout.classList.remove('hidden');
    createBoardDOM(false);
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    ui.sideStatus.classList.remove('hidden');
    state.selectedBoardPiece = null;
    clearHighlights();
    renderBoard();
    startTimer(timeLeft[currentPlayer]);
    announceTurn();
}

export function finalizeGameplayStart() {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    ui.sideStatus.classList.remove('hidden'); // Show timer
    
    state.selectedBoardPiece = null;
    clearHighlights();
    renderBoard();
    startTurn();
}

export function startTurn() {
    if (checkTouchdownWin() && !careerNoTouchdowns()) { // A career quest may switch touchdowns off
        const winner = state.currentPlayer;
        noteTouchdown(winner);
        noteCareerTouchdown(winner, state.board[Engine.endzoneRow(winner)].filter((p) => p && p.player === winner).map((p) => p.type));
        const winnerColorHex = COLOR_HEX[state.playerColors[winner]];
        
        if (state.myPlayerNumber === winner) {
            fireConfetti([winnerColorHex, '#f1c40f']);
            endGame(t('end.victory'), t('end.touchdownYou'), winner, 'touchdown');
        } else {
            if (!state.currentRoomCode) {
                fireConfetti([winnerColorHex, '#f1c40f']);
                endGame(t('end.victory'), t('end.touchdownPlayer', { n: winner }), winner, 'touchdown');
            } else {
                endGame(t('end.defeat'), t('end.touchdownThem', { name: playerName(winner) }), winner, 'touchdown');
            }
        }
        return;
    }
    
    // A career puzzle: player 1 has a number of moves to score; the other side answers.
    const puzzle = puzzleTurn(state.currentPlayer);
    if (puzzle === 'out') return endGame(t('end.defeat'), t('career.puzzle.outOfMoves'), 2); // Not a game for the stats
    if (careerPuzzle()) showScore(); // "Move 2/3"

    const position = serializeBoard();
    state.positionHistory[position] = (state.positionHistory[position] || 0) + 1;
    if (state.positionHistory[position] >= 3) {
        const p1Color = COLOR_HEX[state.playerColors[1]];
        const p2Color = COLOR_HEX[state.playerColors[2]];
        fireConfetti([p1Color, p2Color], 30);
        endGame(t('end.draw'), t('end.byRepetition'), 0, 'repetition');
        return;
    }
    
    startTimer();

    if (state.isBotMatch && state.currentPlayer === 2 && state.gameState !== 'over') {
        setTimeout(playBotTurn, 500);
    }

    // Screen readers hear the move just played and whose turn it is (a11y.js).
    if (state.gameState === 'gameplay') announceTurn();
}

function playBotTurn() {
    if (state.gameState === 'over') return;
    const move = chooseBotMove();
    if (move) movePiece(move.fromR, move.fromC, move.toR, move.toC);
    else skipTurn();
}

export function formatTime(ms) {
    const totalSecs = Math.ceil(ms / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** @param {number} [turnLeftMs] per-turn mode: what is left of a turn already started */
export function startTimer(turnLeftMs) {
    if (state.timerInterval) clearInterval(state.timerInterval);
    
    if (state.timerMode === 'turn') {
        state.timeLeft = turnLeftMs ?? state.timerBaseSeconds * 1000;
    }
    
    // Set hourglass flow direction
    // P1 (bottom) = flex-end (shrinks downwards)
    // P2 (top) = flex-start (shrinks upwards)
    ui.timerBarContainer.style.justifyContent = state.currentPlayer === 1 ? 'flex-end' : 'flex-start';

    // Setup initial bar color
    const hex = COLOR_HEX[state.playerColors[state.currentPlayer]];
    ui.timerBar.style.backgroundColor = hex;
    
    // Initial display
    const currentMs = state.timerMode === 'turn' ? state.timeLeft : state.playerTimeRemaining[state.currentPlayer];
    ui.timerBar.style.height = `${(currentMs / (state.timerBaseSeconds * 1000)) * 100}%`;
    ui.timerTextOverlay.textContent = formatTime(currentMs);

    state.timerInterval = setInterval(() => {
        if (state.timerMode === 'turn') {
            state.timeLeft -= 100;
            const percent = (state.timeLeft / (state.timerBaseSeconds * 1000)) * 100;
            ui.timerBar.style.height = `${percent}%`;
            ui.timerTextOverlay.textContent = formatTime(state.timeLeft);

            if (state.timeLeft <= 0) {
                clearInterval(state.timerInterval);
                skipTurn();
            }
        } else {
            // Overall Mode
            state.playerTimeRemaining[state.currentPlayer] -= 100;
            const percent = (state.playerTimeRemaining[state.currentPlayer] / (state.timerBaseSeconds * 1000)) * 100;
            ui.timerBar.style.height = `${percent}%`;
            ui.timerTextOverlay.textContent = formatTime(state.playerTimeRemaining[state.currentPlayer]);

            if (state.playerTimeRemaining[state.currentPlayer] <= 0) {
                clearInterval(state.timerInterval);
                const winner = state.currentPlayer === 1 ? 2 : 1;
                const winnerColorHex = COLOR_HEX[state.playerColors[winner]];
                fireConfetti([winnerColorHex, '#f1c40f']);
                endGame(t('end.timeOut'), t('end.playerOutOfTime', { n: state.currentPlayer }), winner, 'time');
            }
        }
    }, 100);
}

export function skipTurn() {
    clearHighlights();
    state.selectedBoardPiece = null;
    if (state.currentRoomCode) {
        // Online, the server decides: the player whose time ran out gives up the turn,
        // and both clients switch when the server announces it ('turnSkipped').
        if (state.currentPlayer === state.myPlayerNumber) socket.emit('skipTurn', { roomCode: state.currentRoomCode });
        return;
    }
    state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
    startTurn();
}

export function handleGameplaySquareClick(viewR, viewC) {
    if (state.isAnimating) return;
    // A piece of the other side, with levels in play: its box (what it can do), at any time
    {
        const { r, c } = getBoardCoords(viewR, viewC);
        const piece = state.board[r][c];
        const me = state.currentRoomCode ? state.myPlayerNumber : state.isBotMatch ? 1 : state.currentPlayer;
        const target = state.selectedBoardPiece && getSquareElement(viewR, viewC).classList.contains('highlight');
        if (piece && piece.player !== me && !target && levelsInPlay()) {
            state.selectedBoardPiece = null;
            clearHighlights();
            return showPieceInfo(piece, /** @type {HTMLElement} */ (getSquareElement(viewR, viewC)));
        }
    }
    if (state.currentRoomCode && state.currentPlayer !== state.myPlayerNumber) return; // Ignore if not our turn in online mode
    if (state.isBotMatch && state.currentPlayer === 2) return; // Block human clicks when bot is playing

    const { r, c } = getBoardCoords(viewR, viewC);
    const clickedPiece = state.board[r][c];
    const squareEl = getSquareElement(viewR, viewC);

    if (state.selectedBoardPiece && squareEl.classList.contains('highlight')) {
        if (state.currentRoomCode) {
            // Send move to server
            socket.emit('makeMove', {
                roomCode: state.currentRoomCode,
                from: { r: state.selectedBoardPiece.r, c: state.selectedBoardPiece.c },
                to: { r, c }
            });
            state.selectedBoardPiece = null;
            clearHighlights();
        } else {
            // Local mode
            movePiece(state.selectedBoardPiece.r, state.selectedBoardPiece.c, r, c);
        }
        return;
    }

    const activePlayer = state.currentRoomCode ? state.myPlayerNumber : state.currentPlayer;
    if (clickedPiece && clickedPiece.player === activePlayer) {
        state.selectedBoardPiece = { r, c, piece: clickedPiece };
        highlightValidMoves(r, c);
    } else {
        state.selectedBoardPiece = null;
        clearHighlights();
    }
}

export function movePiece(fromR, fromC, toR, toC) {
    if (state.isAnimating) return;
    
    const piece = state.board[fromR][fromC];
    const targetPiece = state.board[toR][toC];
    
    clearHighlights();
    state.selectedBoardPiece = null;

    // --- Animation Phase ---
    state.isAnimating = true;
    clearInterval(state.timerInterval); // Pause timer

    const { viewR: fVR, viewC: fVC } = getViewCoords(fromR, fromC);
    const { viewR: tVR, viewC: tVC } = getViewCoords(toR, toC);
    const fromSq = getSquareElement(fVR, fVC);
    const toSq = getSquareElement(tVR, tVC);

    if (fromSq && toSq) {
        const pieceIcon = /** @type {HTMLElement|null} */ (fromSq.querySelector('.piece-icon'));
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
        const before = beforeMove(); // All Star: to see who moved, took or was taken
        const mover = state.currentPlayer;
        const theirs = () => state.board.flat().filter((p) => p && p.player !== mover).length;
        const theirsBefore = theirs();
        makeVirtualMove({ fromR, fromC, toR, toC }); // Also handles en passant and lastMove
        afterMove(piece, before);
        const goal = careerAfterMove(mover, theirsBefore - theirs()); // A career quest's goal may end the game
        ui.chessboard.classList.remove('levels-shown');
        
        state.isAnimating = false;
        renderBoard();

        if (targetPiece && targetPiece.type === 'k') {
            const winner = state.currentPlayer;
            const winnerColorHex = COLOR_HEX[state.playerColors[winner]];
            fireConfetti([winnerColorHex, '#f1c40f']);
            endGame(t('end.victory'), t('end.playerCapturedKing', { n: winner }), winner, 'king');
            return;
        }
        if (goal) {
            fireConfetti([COLOR_HEX[state.playerColors[1]], '#f1c40f']);
            const c = /** @type {any} */ (state.career);
            endGame(t('end.victory'), t(`career.end.${goal}`, { n: c.goal.n }), 1); // Not a game for the stats
            return;
        }

        state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
        startTurn();
    }, 300);
}

/**
 * @param {string} title @param {string} reason what the end screen says
 * @param {number} winner 1 or 2, or 0 for a draw
 * @param {'king' | 'touchdown' | 'time' | 'repetition' | 'agreement' | 'resign'} [how] for the stats
 * @param {{ match?: boolean }} [options] match: the whole match was resigned (not only this game)
 */
export function endGame(title, reason, winner, how, { match = false } = {}) {
    state.gameState = 'over';
    closePieceInfo({ focus: false });
    // The series counts the game (online, the server sent it already: 'seriesUpdate').
    if (!state.currentRoomCode) recordLocalGame(winner);
    // The whole match resigned: the series is over, won by the other side.
    if (match && !state.currentRoomCode && !state.series.over) state.series = { ...state.series, over: true, winner: /** @type {0 | 1 | 2} */ (winner) };
    // Online, once the match is over nothing is left to come back to after a reload (a
    // rematch brings a new seat); between two games of a series, the seat is kept.
    if (state.currentRoomCode && state.series.over) forgetSeat('chessdown');
    resetDrawOffers();
    clearInterval(state.timerInterval);
    // Against the bot, the signed-in player is player 1; on the same screen, the side they
    // chose at the start (none: not counted). Online, the server records the result.
    const side = state.isBotMatch ? 1 : state.localSide;
    if (!state.currentRoomCode && state.account && how && side && !careerPuzzle()) { // A puzzle is not a game against the bot
        reportResult({
            game: 'chessdown',
            mode: state.isBotMatch ? 'bot' : 'local',
            result: winner === 0 ? 'draw' : winner === side ? 'win' : 'loss',
            reason: how,
            opponent: state.isBotMatch ? `Bot (${state.botDifficultyLevel || 'master'})` : `Player ${side === 1 ? 2 : 1}`,
            startedAt: state.matchStartedAt,
        });
    }
    ui.victoryTitle.textContent = title;
    ui.victoryReason.textContent = reason;
    showSeriesEnd();
    showClubResults(settleGame(winner), careerAfterGame(winner));
    
    const canvas = document.getElementById('confetti-canvas');
    if (!state.currentRoomCode && winner === 2 && !state.isBotMatch) {
        ui.victoryScreen.classList.add('rotate-180');
        if (canvas) canvas.classList.add('rotate-180');
    } else {
        ui.victoryScreen.classList.remove('rotate-180');
        if (canvas) canvas.classList.remove('rotate-180');
    }
    
    showScreen(ui.victoryScreen);
}

/**
 * All Star: what the game brought the club (all-star.js): the players who went up a level,
 * a recruit when the series is won. Nothing outside All Star.
 * @param {{ levelUps: { name: string, level: number }[], recruit: boolean } | null} results
 */
function showClubResults(results, career = null) {
    let box = document.getElementById('victory-club');
    if (!box) {
        box = document.createElement('ul');
        box.id = 'victory-club';
        box.className = 'victory-club';
        document.getElementById('victory-series')?.after(box);
    }
    const lines = results ? [
        ...(career ? career.lines : []),
        ...results.levelUps.map((u) => t('allStar.levelUp', { name: u.name, n: u.level })),
        ...(results.recruit ? [t('allStar.recruitWon')] : []),
        ...(results.levelUps.length || results.recruit ? [] : [t('allStar.xpCounted')]),
    ] : [];
    // A career match: once over, back to the map; a streak goes on with its next game.
    const restart = /** @type {HTMLButtonElement | null} */ (document.getElementById('btn-restart'));
    if (career && restart && career.finished) restart.textContent = t('career.backToMap');
    else if (career && restart && career.next) restart.textContent = career.next;
    box.innerHTML = lines.map((line) => `<li>${esc(line)}</li>`).join('');
    box.hidden = !lines.length;
}

/** The end screen's line about the series, and its button: next game, or a new match. */
export function showSeriesEnd() {
    const { line, button } = seriesEnd();
    const box = document.getElementById('victory-series');
    if (box) {
        box.textContent = line;
        box.hidden = !line;
    }
    const restart = /** @type {HTMLButtonElement | null} */ (document.getElementById('btn-restart'));
    if (restart && !restart.disabled) restart.textContent = button;
    // A ranked series once over: no rematch (the next one goes through the queue).
    if (restart) restart.hidden = Boolean(state.ranked && state.series.over);
    showScore();
}

export function resetGame() {
    clearInterval(state.timerInterval);
    closePieceInfo({ focus: false });
    hideScore(); // Shown again when the next game of a series starts
    if (state.gameState === 'gameplay') state.gameState = 'over'; // No draw offer from the menu
    resetDrawOffers();
    chat?.stop();
    ui.sideStatus.classList.add('hidden');
    // The pitch goes away with the game: a screen shown next (the career's map) gets the room.
    ui.gameLayout.classList.add('hidden');
    ui.gameContainer.classList.remove('rotate-180', 'draft-mode');
    ui.victoryScreen.classList.remove('rotate-180');
    const canvas = document.getElementById('confetti-canvas');
    if (canvas) canvas.classList.remove('rotate-180');
    state.board = Array(ROWS).fill(null).map(() => Array(COLS).fill(null));
    state.draftPoints = { 1: MAX_POINTS, 2: MAX_POINTS };
    state.kingsPlaced = { 1: false, 2: false };
    state.selectedDraftPiece = null;
    state.lastMove = null;
    state.currentDraftIndex = 0;
    state.positionHistory = {};
    state.playerNames = { 1: null, 2: null };
    hideLadderResult();
}
