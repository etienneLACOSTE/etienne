// @ts-check
// Draft phase: buying and placing pieces, colours, validation.
import { COLS, Engine, MAX_POINTS, PIECES, socket, state, ui } from './state.js';
import { createBoardDOM, renderBoard, showScreen } from './board-view.js';
import { getBoardCoords, getDraftZoneView } from './coords.js';
import { startGameplay } from './gameplay.js';
import { autoDraftBot } from './bot.js';
import { nextStarter, showScore } from './match.js';
import { LINEUP_SLOTS, benchPlayers, clubPlayer, clubSeat, isAllStar, lineup, pieceFor, saveLineup } from './all-star.js';
import { esc } from './club-art.js';
import { benchAllows, careerArmy, isCareerMatch, lockedLineup, noteDraft } from './career-match.js';

/** What a piece on the board cost in the draft (its level's cost; classic pieces: level 3). */
const costOf = (piece) => Engine.pieceCost(piece.type, piece.level);

/** Who starts: in a series, the loser of the last game; otherwise the coin. */
function beginMatch() {
    const starter = nextStarter();
    startGameplay(starter || (Math.random() < 0.5 ? 1 : 2), { coin: !starter });
}
import { t } from '../../../assets/js/i18n.js';

// --- Draft Logic ---

export function toggleRemoveMode() {
    state.removeMode = !state.removeMode;
    ui.btnRemoveMode.textContent = state.removeMode ? t('draft.removeOn') : t('draft.removeOff');
    ui.btnRemoveMode.classList.toggle('btn-danger', state.removeMode);
    ui.btnRemoveMode.classList.toggle('btn-secondary', !state.removeMode);
    if (state.removeMode) {
        state.selectedDraftPiece = null;
        ui.shopItems.forEach(i => i.classList.remove('selected'));
    }
}

export function showTransitionScreen() {
    ui.gameLayout.classList.add('hidden');
    ui.draftHeader.classList.add('hidden');
    ui.draftFooter.classList.add('hidden');
    ui.transitionTitle.textContent = t('transition.title', { n: state.currentPlayer });
    ui.statusBar.textContent = t('status.waitingFor', { n: state.currentPlayer });
    showScreen(ui.transitionScreen);
}

export function startDraftPhase(player) {
    state.currentPlayer = player;
    state.gameState = `draft${player}`;
    showScore(); // A best of 3 shows its score from the draft on
    
    if (!state.currentRoomCode) {
        if (player === 2) {
            ui.gameContainer.classList.add('rotate-180');
        } else {
            ui.gameContainer.classList.remove('rotate-180');
        }
    }
    
    ui.statusBar.classList.remove('hidden'); // Ensure visible
    
    if (!state.currentRoomCode && player === 2) {
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
        ui.statusBar.textContent = t('status.draftBuild');
        if (player === 1) playLockedLineup();
    }
}

/** A career quest with a locked line-up: from its second game, the same players on the same squares. */
function playLockedLineup() {
    const saved = lockedLineup();
    if (!saved) return;
    for (const { id, r, c } of saved) {
        const member = clubPlayer(id);
        if (!member || state.board[r][c]) continue;
        state.board[r][c] = pieceFor(member);
        state.draftPoints[1] -= Engine.pieceCost(member.type, member.level);
        if (member.type === 'k') state.kingsPlaced[1] = true;
    }
    renderBoard();
    announceDraft(t('career.lineupLocked'));
    validateDraft();
}

/** Player 1's pieces on the board, as the engine checks an army. */
function myArmy() {
    const pieces = [];
    state.board.forEach((row, r) => row.forEach((p, c) => {
        if (p && p.player === 1) pieces.push({ r, c, type: p.type, ...(p.level !== undefined ? { level: p.level } : {}), ...(p.clubId ? { clubId: p.clubId } : {}) });
    }));
    return pieces;
}

export function handleTransitionReady() {
    showScreen(ui.draftHeader);
    ui.draftFooter.classList.remove('hidden'); // Also show footer
    ui.gameLayout.classList.remove('hidden');
    ui.gameContainer.classList.add('draft-mode');
    createBoardDOM(true);
    setupColorPicker();
    updateShopColors();
    updateDraftUI();
    renderBoard();
    ui.statusBar.textContent = t('status.draftPlayer', { n: state.currentPlayer });
}

export function updateShopColors() {
    ui.shopItems.forEach(item => {
        item.className = item.className.replace(/jersey-\w+/g, '');
        item.classList.add(`jersey-${state.playerColors[state.currentPlayer]}`);
    });
}

export function setupColorPicker() {
    ui.colorSwatches.forEach(s => s.classList.remove('disabled', 'selected'));

    const opponentPlayer = state.currentRoomCode ? (state.myPlayerNumber === 1 ? 2 : 1) : (state.currentPlayer === 1 ? 2 : 1);
    const opponentColor = state.playerColors[opponentPlayer];
    
    // Disable opponent's color
    const disabledSwatch = document.querySelector(`.color-swatch[data-color="${opponentColor}"]`);
    if (disabledSwatch) disabledSwatch.classList.add('disabled');

    // Auto select a different default color if current is disabled
    if (state.playerColors[state.currentPlayer] === opponentColor) {
        const available = /** @type {HTMLElement|null} */ (document.querySelector(`.color-swatch:not(.disabled)`));
        if (available) {
            state.playerColors[state.currentPlayer] = available.dataset.color;
            updateShopColors();
            renderBoard();
            if (state.currentRoomCode) {
                socket.emit('colorSelected', { roomCode: state.currentRoomCode, player: state.myPlayerNumber, color: state.playerColors[state.currentPlayer] });
            }
        }
    }

    // Select current player's color
    const activeSwatch = document.querySelector(`.color-swatch[data-color="${state.playerColors[state.currentPlayer]}"]`);
    if (activeSwatch) activeSwatch.classList.add('selected');
}

export function updateDraftUI() {
    ui.draftPointsSpan.textContent = state.draftPoints[state.currentPlayer];
    renderBench();
    
    ui.shopItems.forEach(item => {
        const cost = parseInt(item.dataset.cost);
        const type = item.dataset.type;
        
        if (cost > state.draftPoints[state.currentPlayer] && type !== 'k') {
            item.classList.add('disabled');
        } else if (type === 'k' && state.kingsPlaced[state.currentPlayer]) {
            item.classList.add('disabled');
        } else {
            item.classList.remove('disabled');
        }
    });

    if (state.selectedDraftPiece) {
        const activeShopItem = document.querySelector(`.shop-item[data-type="${state.selectedDraftPiece.type}"]`);
        if (activeShopItem && activeShopItem.classList.contains('disabled')) {
            activeShopItem.classList.remove('selected');
            state.selectedDraftPiece = null;
        }
    }

    ui.btnValidateDraft.disabled = !state.kingsPlaced[state.currentPlayer];
}

/** The tutorial (demo.js) can take over the draft square clicks. */
export const draftHooks = { /** @type {((viewR: number, viewC: number) => void) | null} */ squareClick: null };

export function handleDraftSquareClick(viewR, viewC) {
    const zone = getDraftZoneView();
    if (viewR < zone.min || viewR > zone.max) {
        // Blink row or square in red
        const squares = /** @type {HTMLCollectionOf<HTMLElement>} */ (ui.chessboard.children);
        for (let c = 0; c < COLS; c++) {
            const sq = squares[viewR * COLS + c];
            sq.classList.remove('error-blink');
            void sq.offsetWidth; // trigger reflow
            sq.classList.add('error-blink');
        }
        return; // Outside draft zone
    }

    const { r, c } = getBoardCoords(viewR, viewC);
    const currentPiece = state.board[r][c];

    if (state.removeMode) {
        if (currentPiece && currentPiece.player === state.currentPlayer) {
            state.draftPoints[state.currentPlayer] += costOf(currentPiece);
            if (currentPiece.type === 'k') state.kingsPlaced[state.currentPlayer] = false;
            state.board[r][c] = null;
            updateDraftUI();
            renderBoard();
        }
        return;
    }

    if (!state.selectedDraftPiece) return;

    if (currentPiece) {
        if (currentPiece.player === state.currentPlayer) {
            state.draftPoints[state.currentPlayer] += costOf(currentPiece);
            if (currentPiece.type === 'k') state.kingsPlaced[state.currentPlayer] = false;
            state.board[r][c] = null;
        } else {
            return;
        }
    }

    if (state.selectedDraftPiece.type === 'k' && state.kingsPlaced[state.currentPlayer]) return;
    if (state.draftPoints[state.currentPlayer] >= state.selectedDraftPiece.cost) {
        const chosen = state.selectedDraftPiece;
        const member = chosen.clubId ? clubPlayer(chosen.clubId) : null;
        state.board[r][c] = member ? pieceFor(member) : { type: chosen.type, player: state.currentPlayer, hasMoved: false };
        state.draftPoints[state.currentPlayer] -= chosen.cost;
        if (chosen.type === 'k') state.kingsPlaced[state.currentPlayer] = true;
        if (member) state.selectedDraftPiece = null; // Each player of the club is placed once
        
        updateDraftUI();
        renderBoard();
    }
}

export function clearCurrentDraft() {
    const zone = getDraftZoneView();
    for (let viewR = zone.min; viewR <= zone.max; viewR++) {
        for (let viewC = 0; viewC < COLS; viewC++) {
            const { r, c } = getBoardCoords(viewR, viewC);
            if (state.board[r][c] && state.board[r][c].player === state.currentPlayer) {
                state.board[r][c] = null;
            }
        }
    }
    state.draftPoints[state.currentPlayer] = MAX_POINTS;
    state.kingsPlaced[state.currentPlayer] = false;
    updateDraftUI();
    renderBoard();
}

export function validateDraft() {
    if (!state.kingsPlaced[state.currentPlayer]) return; // Extra safeguard against disabled buttons bypassing via pointerdown

    if (state.currentRoomCode) {
        // Extract pieces for myPlayerNumber
        const myPieces = [];
        const zone = getDraftZoneView();
        for (let viewR = zone.min; viewR <= zone.max; viewR++) {
            for (let viewC = 0; viewC < COLS; viewC++) {
                const { r, c } = getBoardCoords(viewR, viewC);
                const piece = state.board[r][c];
                if (piece && piece.player === state.myPlayerNumber) {
                    // All Star: which club player stands here (the server knows its type and level)
                    myPieces.push({ r, c, type: piece.type, ...(piece.clubId ? { clubId: piece.clubId } : {}) });
                }
            }
        }
        
        socket.emit('draftComplete', {
            roomCode: state.currentRoomCode,
            player: state.myPlayerNumber,
            color: state.playerColors[state.myPlayerNumber],
            pieces: myPieces
        });

        // Hide draft UI and show waiting message
        ui.draftHeader.classList.add('hidden');
        ui.draftFooter.classList.add('hidden');
        ui.statusBar.textContent = t('status.waitingDraft');
        ui.btnValidateDraft.disabled = true;
    } else {
        if (state.currentPlayer === 1) {
            if (isCareerMatch()) {
                // The quest's limits (engine.js checkArmy): told in the status bar, the draft goes on.
                const army = myArmy();
                const errors = Engine.checkArmy(army, 1, { ...careerArmy(), budget: Engine.MAX_POINTS });
                if (errors.length) return announceDraft(t(`career.armyError.${errors[0]}`));
                noteDraft(army);
            }
            if (state.isBotMatch) {
                autoDraftBot();
                ui.draftHeader.classList.add('hidden');
                ui.draftFooter.classList.add('hidden');
                beginMatch();
            } else {
                startDraftPhase(2);
            }
        } else {
            // Both drafted: the match starts.
            ui.draftHeader.classList.add('hidden');
            ui.draftFooter.classList.add('hidden');
            beginMatch();
        }
    }
}

// --- All Star: the bench of the club replaces the shop (all-star.js) ---

/** The club's players not placed yet, each with its stars and cost; and the saved line-ups. */
function renderBench() {
    const shop = /** @type {HTMLElement} */ (ui.draftFooter.querySelector('.pieces-shop'));
    let bench = /** @type {HTMLElement | null} */ (document.getElementById('club-bench'));
    const seat = clubSeat();
    const show = isAllStar() && state.currentPlayer === seat;
    shop.hidden = show;
    /** @type {HTMLElement} */ (document.getElementById('color-picker')).hidden = show; // The club has its colours
    if (!show) {
        if (bench) bench.hidden = true;
        return;
    }
    if (!bench) {
        bench = document.createElement('div');
        bench.id = 'club-bench';
        bench.className = 'club-bench';
        shop.before(bench);
    }
    bench.hidden = false;
    const points = state.draftPoints[seat];
    const players = benchPlayers();
    const onBoard = myArmy().map((p) => p.type); // A career quest limits who may still go on
    const selected = state.selectedDraftPiece && state.selectedDraftPiece.clubId;
    const hadFocus = bench.contains(document.activeElement) ? /** @type {HTMLElement} */ (document.activeElement).dataset.focusKey : null;
    bench.innerHTML = `
      <div class="club-bench-players" role="group" aria-label="${esc(t('allStar.bench'))}">${players.length ? players.map((p) => {
        const cost = Engine.pieceCost(p.type, p.level);
        const blocked = (p.type === 'k' && state.kingsPlaced[seat]) || (p.type !== 'k' && cost > points) || !benchAllows(p, onBoard);
        return `<button type="button" class="club-bench-player" style="--club-colour:${state.allStar.club.primary}" data-club-id="${p.id}" data-focus-key="p${p.id}"
            aria-pressed="${selected === p.id}" ${blocked ? 'disabled' : ''}
            aria-label="${esc(t('allStar.place', { name: p.name, piece: t(`piece.${p.type}`), n: p.level, cost }))}">
            <span class="icon" aria-hidden="true">${PIECES[p.type].icon}</span>
            <span class="club-bench-name">${esc(p.name)}</span>
            <span class="club-bench-meta" aria-hidden="true">${'★'.repeat(p.level)} · ${cost}</span>
          </button>`;
      }).join('') : `<span class="muted">${esc(t('allStar.allPlaced'))}</span>`}</div>
      <div class="club-lineups" role="group" aria-label="${esc(t('allStar.lineups'))}">
        <span class="club-lineups-label" aria-hidden="true">${esc(t('allStar.lineups'))}</span>
        ${LINEUP_SLOTS.map((n) => `<span class="club-lineup">
          <button type="button" class="btn-ghost" data-lineup-load="${n}" data-focus-key="l${n}" ${lineup(n) ? '' : 'disabled'}>${esc(t('allStar.load', { n }))}</button>
          <button type="button" class="btn-ghost" data-lineup-save="${n}" data-focus-key="s${n}">${esc(t('allStar.save', { n }))}</button></span>`).join('')}
      </div>`;
    bench.querySelectorAll('[data-club-id]').forEach((b) => b.addEventListener('click', () => {
        const member = clubPlayer(Number(/** @type {HTMLElement} */ (b).dataset.clubId));
        if (!member) return;
        state.selectedDraftPiece = { type: member.type, cost: Engine.pieceCost(member.type, member.level), clubId: member.id };
        renderBench();
    }));
    bench.querySelectorAll('[data-lineup-save]').forEach((b) => b.addEventListener('click', () => {
        saveLineup(Number(/** @type {HTMLElement} */ (b).dataset.lineupSave));
        announceDraft(t('allStar.saved', { n: /** @type {HTMLElement} */ (b).dataset.lineupSave }));
        renderBench();
    }));
    bench.querySelectorAll('[data-lineup-load]').forEach((b) => b.addEventListener('click', () => loadLineup(Number(/** @type {HTMLElement} */ (b).dataset.lineupLoad))));
    if (hadFocus) /** @type {HTMLElement | null} */ (bench.querySelector(`[data-focus-key="${hadFocus}"]`))?.focus();
}

/** Put the players of a saved line-up back on their squares (those still in the club). */
function loadLineup(slot) {
    const saved = lineup(slot);
    if (!saved) return;
    clearCurrentDraft();
    for (const { id, r, c } of saved.pieces) {
        const member = clubPlayer(id);
        const cost = member ? Engine.pieceCost(member.type, member.level) : Infinity;
        const seat = clubSeat();
        if (!member || state.board[r][c] || (member.type !== 'k' && cost > state.draftPoints[seat])) continue;
        if (member.type === 'k' && state.kingsPlaced[seat]) continue;
        state.board[r][c] = pieceFor(member);
        state.draftPoints[seat] -= cost;
        if (member.type === 'k') state.kingsPlaced[seat] = true;
    }
    state.selectedDraftPiece = null;
    updateDraftUI();
    renderBoard();
    announceDraft(t('allStar.loaded', { n: slot }));
}

/** Online: the server refused the draft (a club changed elsewhere, say): drafting goes on. */
export function draftRefused() {
    ui.draftHeader.classList.remove('hidden');
    ui.draftFooter.classList.remove('hidden');
    updateDraftUI();
    announceDraft(t('online.draftRefused'));
}

/** A short message in the status bar (also read out: it is a status region). */
function announceDraft(text) {
    ui.statusBar.textContent = text;
}
