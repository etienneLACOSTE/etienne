// @ts-check
// Input wiring: menus, modals, draft shop, buttons and board squares (one listener).
import { COLOR_HEX, socket, state, ui } from './state.js';
import { enterFullscreen, renderBoard, showScreen } from './board-view.js';
import { clearCurrentDraft, draftHooks, handleDraftSquareClick, handleTransitionReady, startDraftPhase, toggleRemoveMode, updateShopColors, validateDraft } from './draft.js';
import { endGame, handleGameplaySquareClick, resetGame, startGameplay } from './gameplay.js';
import { loadBotProfileForDifficulty } from './bot.js';
import { setupNetwork } from './network.js';
import { choose, notify } from '../../../assets/js/dialog.js';
import { setupDraw } from './draw.js';
import { setupResign } from './resign.js';
import { fireConfetti } from '../confetti.js';
import { forgetSeat } from '../../../assets/js/seat.js';
import { clearFieldError, showFieldError } from '../../../assets/js/field-error.js';
import { language, t } from '../../../assets/js/i18n.js';
import { saveSettings, showSettings } from './settings.js';
import { askFormat, hideScore, startSeries } from './match.js';
import { loadClub } from './club-store.js';
import { loadCareer } from './career-store.js';
import { closeCareer, openCareer, showKnockedOut } from './career-view.js';
import { bracketProgress, scrollBracketToClub } from './bracket-view.js';
import { beginCareerMatch, careerKnockedOut, careerPuzzle, careerWord, endCareerMatch, setPuzzleBoard } from './career-match.js';
import { showClub } from './club-view.js';
import { startOnboarding, stopOnboarding } from './club-onboarding.js';
import { beginAllStar, endAllStar, setClubColors } from './all-star.js';
import { joinQueue, setupLadder } from './ladder-view.js';

/** Back to the menu from a game (online: the room is left, a forfeit while it is played). */
function leaveToMenu() {
    if (state.currentRoomCode) {
        socket.emit('leaveRoom', { roomCode: state.currentRoomCode });
        state.currentRoomCode = null;
        forgetSeat('chessdown');
    }
    state.ranked = null;
    resetGame();
    endAllStar();
    endCareerMatch();
    state.gameState = 'mainMenu';
    hideScore();
    showScreen(ui.mainMenu);
    ui.statusBar.textContent = t('status.welcome');
}

/** The club chosen for the next campaign match (All Star), until the campaign starts or is cancelled. */
let pendingClub = null;

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
export function openCareerPage(club, word = '', knockedOut = false, view = 'map') {
    showScreen(/** @type {HTMLElement} */ (document.getElementById('career-screen')));
    openCareer(club, {
        word,
        knockedOut,
        view,
        onClub: () => openClubPage(loadClub() || club, () => { showScreen(ui.mainMenu); document.getElementById('btn-all-star')?.focus(); }),
        onPlay: (spec) => startCareerMatch(loadClub() || club, spec),
    });
}

/**
 * A career match: the club against the rival's bot, with what the match asks (career-match.js).
 * A tournament match shows the tournament's progress first (bracket-view.js).
 */
function startCareerMatch(club, spec) {
    closeCareer();
    if (spec.kind === 'league' && !spec.ready) return showBracketBefore(club, spec);
    state.currentRoomCode = null;
    state.isBotMatch = true;
    beginAllStar(club);
    setClubColors(club);
    const format = beginCareerMatch(spec);
    loadBotProfileForDifficulty(state.career.opponent.difficulty);
    state.botArchetype = state.career.opponent.archetype;
    enterFullscreen();
    startSeries(format);
    const puzzle = careerPuzzle();
    if (!puzzle) return startDraftPhase(1);
    // A puzzle: no draft, its position on the board, player 1 to play
    setPuzzleBoard();
    state.playerColors[2] = state.playerColors[1] === 'black' ? 'white' : 'black';
    state.currentPlayer = 1;
    startGameplay(1, { coin: false, text: t('career.puzzle.start', { n: puzzle.moves }) });
}

/** Before a tournament match: where the club stands, then the draft (or back to the map). */
function showBracketBefore(club, spec) {
    const career = loadCareer();
    if (!career) return;
    const view = /** @type {HTMLElement} */ (document.getElementById('bracket-view'));
    view.innerHTML = bracketProgress(career, club);
    const screen = /** @type {HTMLElement} */ (document.getElementById('bracket-screen'));
    showScreen(screen);
    scrollBracketToClub(view); // The club's next match in view
    const start = /** @type {HTMLElement} */ (document.getElementById('bracket-start'));
    const back = /** @type {HTMLElement} */ (document.getElementById('bracket-back'));
    start.onclick = () => startCareerMatch(club, { ...spec, ready: true });
    back.onclick = () => openCareerPage(club);
    start.focus();
}

/** Leave a finished career match: the club as it is now, and whether it was knocked out. */
function leaveCareerMatch() {
    const club = state.allStar ? state.allStar.club : loadClub();
    const out = careerKnockedOut();
    resetGame();
    endCareerMatch();
    endAllStar();
    state.gameState = 'mainMenu';
    hideScore();
    return { club, out };
}

/** After a tournament match: the next one (its progress first), or the club's page. */
function nextTournamentMatch() {
    const { club } = leaveCareerMatch();
    if (club) startCareerMatch(club, { kind: 'league' });
}
function tournamentToClub() {
    const { club, out } = leaveCareerMatch();
    if (!club) return showScreen(ui.mainMenu);
    openClubPage(club, () => { showScreen(ui.mainMenu); document.getElementById('btn-all-star')?.focus(); });
    if (out) showKnockedOut(); // Knocked out: the black screen, over the club
}

/** The career match is over: back to the map, the club as it is now. */
function backToCareer() {
    const club = state.allStar ? state.allStar.club : loadClub();
    const word = careerWord(); // Gérard's comment on the match
    const out = careerKnockedOut(); // Knocked out: the black screen
    resetGame();
    endCareerMatch();
    endAllStar();
    state.gameState = 'mainMenu';
    hideScore();
    if (club) openCareerPage(club, word, out);
    else showScreen(ui.mainMenu);
}

function openClubPage(club, toMenu) {
    showScreen(/** @type {HTMLElement} */ (document.getElementById('club-screen')));
    showClub(/** @type {HTMLElement} */ (document.getElementById('club-view')), club, {
        onMenu: toMenu,
        onDeleted: openAllStar,
        onCareer: (playing, view) => openCareerPage(playing, '', false, view),
        onSettings: () => openSettings('club'),
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

/** Where the Settings screen was opened from ('menu' or 'club'): it goes back there. */
let settingsFrom = 'menu';
const REOPEN = 'pawnet.chessdown.reopen';

/** The Settings screen (language, timer), from the menu or the club's gear. */
function openSettings(from) {
    settingsFrom = from;
    showSettings(languageSelect);
    showScreen(ui.timerModal);
}

/** After the reload a new language brings: back on the club's page if Settings came from there. */
export function reopenAfterReload() {
    let page = null;
    try { page = sessionStorage.getItem(REOPEN); sessionStorage.removeItem(REOPEN); } catch { /* Nothing kept */ }
    if (page === 'club' && loadClub()) openAllStar();
}

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
                setClubColors(pendingClub);
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
        ui.btnShowTimer.addEventListener('pointerdown', () => openSettings('menu'));
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
            // Back where Settings was opened from: the menu, or the club's page (also after the
            // reload a new language brings: kept for this tab only)
            if (settingsFrom === 'club') {
                if (languageSelect.value !== language()) {
                    try { sessionStorage.setItem(REOPEN, 'club'); } catch { /* The menu after the reload */ }
                }
                openAllStar();
            } else {
                showScreen(ui.mainMenu);
            }
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
            // With a club, the room may be All Star: each side drafts its own club (the one
            // kept with the account, checked by the server).
            const mode = loadClub()
                ? await choose(t('online.modeQuestion'), [{ label: t('online.modeClassic'), value: 'classic' }, { label: t('online.modeAllStar'), value: 'allstar' }])
                : 'classic';
            if (!mode) return;
            const format = await askFormat();
            if (!format) return;
            // The creator's match applies to both players; the server keeps the clock
            // (30 s turns for a best of 3, the timer chosen in Settings for a single game).
            socket.emit('createRoom', { format, mode, timerMode: state.chosenTimer.mode, timerSeconds: state.chosenTimer.seconds });
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

    // Ranked: a ladder to queue for (All Star only with a club), and the leaderboards.
    setupLadder({
        onRanked: async () => {
            if (!socket) return void notify(t('online.unavailable'));
            endAllStar();
            const mode = loadClub()
                ? await choose(t('ladder.modeQuestion'), [{ label: t('online.modeClassic'), value: 'classic' }, { label: t('online.modeAllStar'), value: 'allstar' }])
                : 'classic';
            if (mode) joinQueue(mode);
        },
    });

    setupNetwork(); // Socket.io handlers, see network.js
    // Same screen: both players agreed on a draw (online, the server ends the game).
    setupDraw(() => {
        fireConfetti([COLOR_HEX[state.playerColors[1]], COLOR_HEX[state.playerColors[2]]], 30);
        endGame(t('end.draw'), t('end.byAgreement'), 0, 'agreement');
    });
    
    ui.btnMainMenu.addEventListener('pointerdown', leaveToMenu);
    document.getElementById('btn-to-club')?.addEventListener('click', tournamentToClub);

    // Resign (resign.js): this game, or the whole match. Online, the server decides: a game
    // resigned is given to the opponent; the match resigned is left (a forfeit).
    setupResign((what) => {
        if (state.currentRoomCode) {
            if (what === 'match') return leaveToMenu();
            socket.emit('resignGame', { roomCode: state.currentRoomCode });
            return;
        }
        // Against the bot, player 1 resigns; on the same screen, the player to move.
        const loser = state.isBotMatch ? 1 : state.currentPlayer;
        if (state.gameState.startsWith('draft')) { // During the draft: the draft goes away
            ui.draftHeader.classList.add('hidden');
            ui.draftFooter.classList.add('hidden');
            ui.gameContainer.classList.remove('draft-mode', 'rotate-180');
        }
        const winner = loser === 1 ? 2 : 1;
        const title = state.isBotMatch ? t('end.defeat') : t('end.victory');
        const reason = state.isBotMatch ? t('end.youResigned') : t('end.playerResigned', { n: loser });
        endGame(title, reason, winner, 'resign', { match: what === 'match' });
    });

    const btnRestart = /** @type {HTMLButtonElement} */ (document.getElementById('btn-restart'));
    if (btnRestart) {
        btnRestart.addEventListener('pointerdown', () => {
            if (state.currentRoomCode) {
                socket.emit('playAgainRequest', { roomCode: state.currentRoomCode });
                btnRestart.textContent = t('end.waitingRematch');
                btnRestart.disabled = true;
            } else if (state.career && state.career.finished) {
                // A tournament match: the next one; a quest: back to the map
                if (state.career.kind === 'league') nextTournamentMatch();
                else backToCareer();
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
