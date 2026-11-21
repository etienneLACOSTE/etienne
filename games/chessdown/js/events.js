// @ts-check
// Input wiring: menus, modals, draft shop, buttons and board squares (one listener).
import { COLOR_HEX, socket, state, ui } from './state.js';
import { enterFullscreen, renderBoard, showScreen } from './board-view.js';
import { clearCurrentDraft, draftHooks, handleDraftSquareClick, handleTransitionReady, startDraftPhase, toggleRemoveMode, updateShopColors, validateDraft } from './draft.js';
import { endGame, handleGameplaySquareClick, resetGame } from './gameplay.js';
import { loadBotProfileForDifficulty } from './bot.js';
import { setupNetwork } from './network.js';
import { choose, notify } from '../../../assets/js/dialog.js';
import { setupDraw } from './draw.js';
import { fireConfetti } from '../confetti.js';
import { forgetSeat } from '../../../assets/js/seat.js';
import { clearFieldError, showFieldError } from '../../../assets/js/field-error.js';
import { t } from '../../../assets/js/i18n.js';
import { saveSettings, showSettings } from './settings.js';
import { askFormat, hideScore, startSeries } from './match.js';
import { loadClub } from './club-store.js';
import { closeCareer, openCareer } from './career-view.js';
import { beginCareerMatch, endCareerMatch } from './career-match.js';
import { showClub } from './club-view.js';
import { startOnboarding, stopOnboarding } from './club-onboarding.js';
import { beginAllStar, endAllStar } from './all-star.js';

/** The club chosen for the next campaign match (All Star), until the campaign starts or is cancelled. */
let pendingClub = null;

/** The jersey colour of the game nearest to the club's own (end zones, timer bar). */
function nearestJersey(hex) {
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [r, g, b] = rgb(hex);
    let best = 'blue';
    let dist = Infinity;
    for (const [name, h] of Object.entries(COLOR_HEX)) {
        const [x, y, z] = rgb(h);
        const d = (r - x) ** 2 + (g - y) ** 2 + (b - z) ** 2;
        if (d < dist) { dist = d; best = name; }
    }
    return best;
}

/** All Star: the club's page, or the commissioner's office when there is no club yet. */
function openAllStar() {
    const club = loadClub();
    const toMenu = () => {
        stopOnboarding();
        showScreen(ui.mainMenu);
        document.getElementById('btn-all-star')?.focus();
    };
    if (!club) {
        showScreen(/** @type {HTMLElement} */ (document.getElementById('club-onboarding')));
        startOnboarding((made) => openClubPage(made, toMenu));
        return;
    }
    openClubPage(club, toMenu);
}

/**
 * The career (docs/games/chessdown-career.md) with the club, from the club's page; back to
 * the club's page from it, or into a match (a matchday or a side quest).
 */
export function openCareerPage(club) {
    showScreen(/** @type {HTMLElement} */ (document.getElementById('career-screen')));
    openCareer(club, {
        onClub: () => openClubPage(loadClub() || club, () => { showScreen(ui.mainMenu); document.getElementById('btn-all-star')?.focus(); }),
        onPlay: (spec) => startCareerMatch(loadClub() || club, spec),
    });
}

/** A career match: the club against the rival's bot, with what the match asks (career-match.js). */
function startCareerMatch(club, spec) {
    closeCareer();
    state.currentRoomCode = null;
    state.isBotMatch = true;
    beginAllStar(club);
    state.playerColors[1] = nearestJersey(club.primary);
    const format = beginCareerMatch(spec);
    loadBotProfileForDifficulty(state.career.opponent.difficulty);
    state.botArchetype = state.career.opponent.archetype;
    enterFullscreen();
    startSeries(format);
    startDraftPhase(1);
}

/** The career match is over: back to the map, the club as it is now. */
function backToCareer() {
    const club = state.allStar ? state.allStar.club : loadClub();
    resetGame();
    endCareerMatch();
    endAllStar();
    state.gameState = 'mainMenu';
    hideScore();
    if (club) openCareerPage(club);
    else showScreen(ui.mainMenu);
}

function openClubPage(club, toMenu) {
    showScreen(/** @type {HTMLElement} */ (document.getElementById('club-screen')));
    showClub(/** @type {HTMLElement} */ (document.getElementById('club-view')), club, {
        onMenu: toMenu,
        onDeleted: openAllStar,
        onCareer: (playing) => openCareerPage(playing),
        // A campaign match with the club: the campaign setup first (difficulty, opponent).
        onPlay: (playing) => {
            pendingClub = playing;
            showScreen(ui.mainMenu);
            ui.mainMenu.classList.add('hidden');
            ui.difficultyModal.classList.remove('hidden');
            ui.difficultyModal.querySelector('h2')?.setAttribute('tabindex', '-1');
            /** @type {HTMLElement | null} */ (ui.difficultyModal.querySelector('h2'))?.focus();
        },
    });
}

const languageSelect = /** @type {HTMLSelectElement} */ (document.getElementById('language-select'));

/** A tap on a board square (or Enter on it, see a11y.js) goes to the draft or the match. */
function onBoardPointerdown(e) {
    const square = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('.square'));
    if (!square) return;
    const viewR = Number(square.dataset.vr);
    const viewC = Number(square.dataset.vc);
    if (state.gameState.startsWith('draft')) {
        (draftHooks.squareClick || handleDraftSquareClick)(viewR, viewC);
    } else if (state.gameState === 'gameplay') {
        handleGameplaySquareClick(viewR, viewC);
    }
}

export function setupEventListeners() {
    ui.chessboard.addEventListener('pointerdown', onBoardPointerdown);

    const btnStartLocal = document.getElementById('btn-start-local');
    if (btnStartLocal) {
        btnStartLocal.addEventListener('pointerdown', async (e) => {
            e.preventDefault(); // The mouse press must not take the focus out of the question below
            state.currentRoomCode = null;
            state.isBotMatch = false;
            endAllStar();
            enterFullscreen(); // While the tap still counts as the player's gesture
            state.localSide = 0;
            const format = await askFormat();
            if (!format) return; // Escape: back to the menu
            startSeries(format);
            if (state.account) {
                // The game counts in the account's stats for the side its player takes.
                const side = await choose(t('local.whichSide'), [
                    { label: t('local.player1'), value: '1' },
                    { label: t('local.player2'), value: '2' },
                    { label: t('local.neither'), value: '0' },
                ]);
                if (!side) return; // Escape: back to the menu
                state.localSide = Number(side);
            }
            startDraftPhase(1);
        });
    }

    const btnStartBot = document.getElementById('btn-start-bot');
    if (btnStartBot) {
        btnStartBot.addEventListener('pointerdown', () => {
            pendingClub = null; // The classic campaign
            ui.mainMenu.classList.add('hidden');
            ui.difficultyModal.classList.remove('hidden');
        });
    }

    const btnCloseDifficulty = document.getElementById('btn-close-difficulty');
    if (btnCloseDifficulty) {
        btnCloseDifficulty.addEventListener('pointerdown', () => {
            ui.difficultyModal.classList.add('hidden');
            if (pendingClub) {
                // Back to the club's page it came from.
                const club = pendingClub;
                pendingClub = null;
                return openClubPage(club, () => { showScreen(ui.mainMenu); document.getElementById('btn-all-star')?.focus(); });
            }
            ui.mainMenu.classList.remove('hidden');
        });
    }

    const diffButtons = document.querySelectorAll('.btn-difficulty');
    diffButtons.forEach(btn => {
        btn.addEventListener('pointerdown', (e) => {
            diffButtons.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            state.botDifficultyLevel = btn.getAttribute('data-level');
        });
    });

    const archButtons = document.querySelectorAll('.btn-archetype');
    archButtons.forEach(btn => {
        btn.addEventListener('pointerdown', (e) => {
            archButtons.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            state.botArchetype = btn.getAttribute('data-arch');
        });
    });

    const btnConfirmCampaign = document.getElementById('btn-confirm-campaign');
    if (btnConfirmCampaign) {
        btnConfirmCampaign.addEventListener('pointerdown', () => {
            loadBotProfileForDifficulty(state.botDifficultyLevel);
            ui.difficultyModal.classList.add('hidden');
            
            state.currentRoomCode = null;
            state.isBotMatch = true;
            enterFullscreen();
            // All Star when it came from the club's page: the club plays, in its colours.
            endCareerMatch(); // A friendly match or a quick game: no career rules
            if (pendingClub) {
                beginAllStar(pendingClub);
                state.playerColors[1] = nearestJersey(pendingClub.primary);
                pendingClub = null;
            } else {
                endAllStar();
            }
            startSeries('bo3'); // The campaign is always played in best of 3
            startDraftPhase(1);
        });
    }

    document.getElementById('btn-all-star')?.addEventListener('pointerdown', openAllStar);

    if (ui.btnShowTimer) {
        ui.btnShowTimer.addEventListener('pointerdown', () => {
            showSettings(languageSelect);
            ui.mainMenu.classList.add('hidden');
            ui.timerModal.classList.remove('hidden');
        });
    }

    const timerToggleBtns = document.querySelectorAll('.timer-toggle-btn');
    timerToggleBtns.forEach(btn => {
        btn.addEventListener('pointerdown', (e) => {
            timerToggleBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            
            if (btn.getAttribute('data-mode') === 'turn') {
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
            const selected = document.querySelector('.timer-toggle-btn.selected');
            // The timer of single games (a best of 3 always uses 30 s turns).
            state.chosenTimer = {
                mode: selected && selected.getAttribute('data-mode') === 'overall' ? 'overall' : 'turn',
                seconds: (m * 60) + s > 0 ? (m * 60) + s : 10, // Fallback
            };
            
            ui.timerModal.classList.add('hidden');
            ui.mainMenu.classList.remove('hidden');
            saveSettings(languageSelect); // Kept; a new language reloads the page
        });
    }

    const btnReady = document.getElementById('btn-ready');
    if (btnReady) {
        btnReady.addEventListener('pointerdown', handleTransitionReady);
    }

    const btnCreateRoom = document.getElementById('btn-create-room');
    const btnJoinRoom = document.getElementById('btn-join-room');
    const inputRoomCode = /** @type {HTMLInputElement} */ (document.getElementById('room-code-input'));

    if (btnCreateRoom) {
        btnCreateRoom.addEventListener('pointerdown', async (e) => {
            if (!socket) return void notify(t('online.unavailable'));
            endAllStar();
            e.preventDefault(); // The mouse press must not take the focus out of the question
            enterFullscreen();
            const format = await askFormat();
            if (!format) return;
            // The creator's match applies to both players; the server keeps the clock
            // (30 s turns for a best of 3, the timer chosen in Settings for a single game).
            socket.emit('createRoom', { format, timerMode: state.chosenTimer.mode, timerSeconds: state.chosenTimer.seconds });
        });
    }

    if (btnJoinRoom) {
        btnJoinRoom.addEventListener('pointerdown', (e) => {
            if (!socket) return void notify(t('online.unavailable'));
            const code = inputRoomCode.value.trim().toUpperCase();
            if (!/^[A-Z]{6}$/.test(code)) {
                e.preventDefault(); // The mouse press must not take the focus away from the field
                return showFieldError(inputRoomCode, t('menu.codeError'), { after: inputRoomCode.parentElement });
            }
            clearFieldError(inputRoomCode);
            enterFullscreen();
            socket.emit('joinRoom', code);
        });
    }

    setupNetwork(); // Socket.io handlers, see network.js
    // Same screen: both players agreed on a draw (online, the server ends the game).
    setupDraw(() => {
        fireConfetti([COLOR_HEX[state.playerColors[1]], COLOR_HEX[state.playerColors[2]]], 30);
        endGame(t('end.draw'), t('end.byAgreement'), 0, 'agreement');
    });
    
    ui.btnMainMenu.addEventListener('pointerdown', () => {
        if (state.currentRoomCode) {
            socket.emit('leaveRoom', { roomCode: state.currentRoomCode });
            state.currentRoomCode = null;
            forgetSeat('chessdown');
        }
        resetGame();
        endAllStar();
        endCareerMatch();
        state.gameState = 'mainMenu';
        hideScore();
        showScreen(ui.mainMenu);
        ui.statusBar.textContent = t('status.welcome');
    });

    const btnRestart = /** @type {HTMLButtonElement} */ (document.getElementById('btn-restart'));
    if (btnRestart) {
        btnRestart.addEventListener('pointerdown', () => {
            if (state.currentRoomCode) {
                socket.emit('playAgainRequest', { roomCode: state.currentRoomCode });
                btnRestart.textContent = t('end.waitingRematch');
                btnRestart.disabled = true;
            } else if (state.career && state.career.finished) {
                backToCareer();
            } else {
                // Local or bot: the next game of the series, or a new match once it is over.
                const series = state.series;
                resetGame();
                if (series.over) startSeries(series.format);
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
            if (state.removeMode) toggleRemoveMode();
            ui.shopItems.forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            state.selectedDraftPiece = {
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
            state.playerColors[state.currentPlayer] = swatch.dataset.color;
            updateShopColors();
            renderBoard(); // Update piece colors dynamically
            
            if (state.currentRoomCode) {
                socket.emit('colorSelected', { roomCode: state.currentRoomCode, player: state.myPlayerNumber, color: swatch.dataset.color });
            }
        });
    });

    ui.btnRemoveMode.addEventListener('pointerdown', toggleRemoveMode);
    ui.btnClearDraft.addEventListener('pointerdown', clearCurrentDraft);
    ui.btnValidateDraft.addEventListener('pointerdown', validateDraft);
}
