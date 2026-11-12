// @ts-check
// A match from start to finish: choose the players, draft or bring the decks, play,
// then the end screen with a rematch or the way back to the menu.
import { PIECE_MAP, botSettings, clock, match, session, socket } from './state.js';
import { engine } from './game-engine.js';
import { emit } from './events.js';
import { ProfileManager } from './profiles.js';
import { setupPlayerBanner } from './profiles-view.js';
import { showScreen } from './screens.js';
import { renderInGameDeck } from './cards-view.js';
import { renderChessboard } from './board-view.js';
import { resetClock, startTimer, stopTimer } from './clock.js';
import { startDraft } from './draft.js';
import { generateBotDeck, loadBotProfile } from './bot-player.js';
import { reportResult } from '../../../assets/js/session.js';
import { notify } from '../../../assets/js/dialog.js';

/** How long the last move stays on screen before the end screen comes up. */
const END_SCREEN_DELAY_MS = 700;

const selectedValue = (id) => /** @type {HTMLSelectElement} */ (document.getElementById(id)).value;

/** Local game, from the player select screen: a draft, or the saved decks (campaign). */
export function startGame(skipDraft) {
    const p1Id = selectedValue('p1-select');
    const p2Id = selectedValue('p2-select');
    if (p1Id === p2Id && !match.isBotGame) {
        return void notify("Please select different profiles for Player 1 and Player 2.");
    }
    match.p1Profile = ProfileManager.find(p1Id);
    if (!match.isBotGame) match.p2Profile = ProfileManager.find(p2Id);

    clock.minutes = parseInt(/** @type {HTMLInputElement} */ (document.getElementById('timer-min')).value) || 0;
    clock.seconds = parseInt(/** @type {HTMLInputElement} */ (document.getElementById('timer-sec')).value) || 0;
    if (clock.mode === 'overall') resetClock();

    setupPlayerBanner('player1-banner', match.p1Profile);
    setupPlayerBanner('player2-banner', match.p2Profile);

    if (!skipDraft) {
        match.isBotGame = false;
        startDraft(initGame);
        return;
    }
    const hasDeck = (profile) => profile.deck && profile.deck.length === 3;
    if (!hasDeck(match.p1Profile) || (!match.isBotGame && !hasDeck(match.p2Profile))) {
        return void notify("Both players must have a saved deck (3 cards) to play Campaign Mode. Go to 'Manage Profiles' to build decks.");
    }
    match.p1Deck = [...match.p1Profile.deck];
    match.p2Deck = match.isBotGame ? generateBotDeck() : [...match.p2Profile.deck];
    initGame();
}

/** Against the bot, at the ELO chosen on the slider, with player 1's saved deck. */
export function startCampaign() {
    match.isBotGame = true;
    botSettings.elo = parseInt(/** @type {HTMLInputElement} */ (document.getElementById('bot-elo-slider')).value) || 1500;
    match.p2Profile = { name: `Bot (${botSettings.elo} ELO)`, avatar: '', stats: { played: 0, wins: 0 } };
    loadBotProfile();
    startGame(true);
}

/** A fresh board with the chosen decks; the clock starts. */
export function initGame() {
    match.startedAt = Date.now();
    engine.init();
    showScreen('game-board');
    renderInGameDeck(match.p1Deck, 'player1-cards', 'white');
    renderInGameDeck(match.p2Deck, 'player2-cards', 'black');
    renderChessboard();
    startTimer();
    emit('matchStarted');
}

/** Same players, same decks, a fresh board. */
export function rematch() {
    if (clock.mode === 'overall') resetClock();
    initGame();
}

/** From the end screen back to the menu (online, the room is left). */
export function leaveGame() {
    document.getElementById('game-over-modal').classList.add('hidden');
    stopTimer();
    if (session.isOnline && socket) {
        if (session.currentRoomCode) socket.emit('leaveRoom', { roomCode: session.currentRoomCode });
        session.currentRoomCode = null;
        session.isOnline = false;
    }
    showScreen('main-menu');
}

/**
 * A king fell, a player ran out of time or both agreed on a draw: the clock stops, the
 * profiles keep the result, and the end screen comes up once the last move has been seen.
 * @param {{ winner: 'white' | 'black' | 'draw', reason: 'king' | 'time' | 'agreement' }} result
 */
export function endGame({ winner, reason }) {
    stopTimer();
    ProfileManager.recordResult([['white', match.p1Profile], ['black', match.p2Profile]], winner);
    recordAccountResult(winner, reason);
    setTimeout(() => {
        // Still the same finished game (not a rematch started meanwhile).
        if (engine.winner && engine.winner.toLowerCase() === winner && engine.gameOverShown) showEndScreen(winner, reason);
    }, END_SCREEN_DELAY_MS);
}

/**
 * Against the bot or on the same screen, the game counts in the account's stats when the
 * account plays (online, the game server records it).
 */
function recordAccountResult(winner, reason) {
    const account = ProfileManager.account;
    if (session.isOnline || !account) return;
    const color = match.p1Profile === account ? 'white' : match.p2Profile === account ? 'black' : null;
    if (!color) return;
    const opponent = color === 'white' ? match.p2Profile : match.p1Profile;
    reportResult({
        game: 'chesspell',
        mode: match.isBotGame ? 'bot' : 'local',
        result: winner === 'draw' ? 'draw' : winner === color ? 'win' : 'loss',
        reason,
        opponent: (opponent && opponent.name) || 'Opponent',
        startedAt: match.startedAt,
    });
    account.stats.played++;
    if (winner === color) account.stats.wins++;
}

/**
 * The end of the game, over the final board: who won and how, then a rematch or the menu.
 * Facing the bot or online, from the player's side (Victory or Defeat).
 * @param {'white' | 'black' | 'draw'} winner
 * @param {'king' | 'time' | 'agreement'} reason
 */
function showEndScreen(winner, reason) {
    if (winner === 'draw') return showDrawScreen();
    const loser = winner === 'white' ? 'black' : 'white';
    const names = { white: match.p1Profile?.name || 'White', black: match.p2Profile?.name || 'Black' };
    const me = session.isOnline ? session.myPlayerColor : match.isBotGame ? 'white' : null;
    const title = me ? (me === winner ? 'Victory' : 'Defeat') : `${names[winner]} wins`;
    const how = reason === 'time' ? `${names[loser]} ran out of time.` : `The ${loser} king has fallen.`;
    const sign = document.createElement('span');
    sign.className = reason === 'time' ? 'end-sign' : 'end-sign fallen';
    sign.textContent = reason === 'time' ? '⌛' : PIECE_MAP[loser === 'white' ? 'K' : 'k'];
    document.getElementById('game-over-icon').replaceChildren(sign);
    document.getElementById('game-over-title').textContent = title;
    document.getElementById('game-over-reason').textContent =
        me ? `${how} ${names[winner]} defeats ${names[loser]}.` : how;
    document.getElementById('game-over-rematch').classList.toggle('hidden', session.isOnline);
    const modal = document.getElementById('game-over-modal');
    modal.classList.toggle('end-defeat', Boolean(me) && me !== winner);
    modal.classList.remove('hidden');
}

/** Both players agreed on a draw: no winner, no fallen king. */
function showDrawScreen() {
    const sign = Object.assign(document.createElement('span'), { className: 'end-sign', textContent: '½' });
    document.getElementById('game-over-icon').replaceChildren(sign);
    document.getElementById('game-over-title').textContent = 'Draw';
    document.getElementById('game-over-reason').textContent = 'Both players agreed to a draw.';
    document.getElementById('game-over-rematch').classList.toggle('hidden', session.isOnline);
    const modal = document.getElementById('game-over-modal');
    modal.classList.remove('end-defeat');
    modal.classList.remove('hidden');
}
