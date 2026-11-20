// @ts-check
// Online play: create or join a room, then show the game the server referees.
import { clock, match, session, socket } from './state.js';
import { engine } from './game-engine.js';
import { ProfileManager } from './profiles.js';
import { setupPlayerBanner } from './profiles-view.js';
import { showScreen } from './screens.js';
import { renderInGameDeck } from './cards-view.js';
import { renderChessboard } from './board-view.js';
import { startTimer } from './clock.js';
import { leaveGame } from './match.js';
import { refreshInvites } from './invites.js';
import { watchConnection } from '../../../assets/js/connection-notice.js';
import { notify } from '../../../assets/js/dialog.js';
import { chat } from './chat.js';
import { forgetSeat, keepSeat, RESUME_FAILED } from '../../../assets/js/seat.js';
import { clearFieldError, showFieldError } from '../../../assets/js/field-error.js';

/**
 * The profile chosen to play online, with its deck of three cards; else null, and the
 * player is told under the list.
 */
function chosenProfile() {
    const select = /** @type {HTMLSelectElement} */ (document.getElementById('online-p1-select'));
    const profile = ProfileManager.find(select.value);
    if (!profile || !profile.deck || profile.deck.length !== 3) {
        showFieldError(select, 'Choose a profile with a deck of three cards (build it in the Deck Builder).');
        return null;
    }
    clearFieldError(select);
    return profile;
}

/** The online buttons and the server's messages. */
export function setupOnline() {
    if (!socket) return;
    
    document.getElementById('btn-create-room')?.addEventListener('click', () => {
        const profile = chosenProfile();
        if (!profile) return;
        match.p1Profile = profile;
        match.p1Deck = [...profile.deck];
        // The creator's timer applies to both players; the server keeps the clock.
        const minutes = parseInt(/** @type {HTMLInputElement} */ (document.getElementById('timer-min')).value) || 0;
        const seconds = parseInt(/** @type {HTMLInputElement} */ (document.getElementById('timer-sec')).value) || 0;
        socket.emit('createRoom', {
            deck: match.p1Deck, profile: match.p1Profile,
            timerMode: clock.mode, timerSeconds: minutes * 60 + seconds,
        });
    });
    
    document.getElementById('btn-join-room')?.addEventListener('click', () => {
        const profile = chosenProfile();
        if (!profile) return;
        const input = /** @type {HTMLInputElement} */ (document.getElementById('room-code-input'));
        const code = input.value.trim().toUpperCase();
        if (!/^[A-Z]{6}$/.test(code)) return showFieldError(input, 'Enter the 6-letter code of the room.');
        clearFieldError(input);
        match.p2Profile = profile; // Locally, we are p2 joining
        match.p2Deck = [...profile.deck];
        socket.emit('joinRoom', { roomCode: code, deck: match.p2Deck, profile: match.p2Profile });
    });
    
    document.getElementById('btn-leave-room')?.addEventListener('click', () => {
        if (session.currentRoomCode) {
            socket.emit('leaveRoom', { roomCode: session.currentRoomCode });
            session.currentRoomCode = null;
        }
        forgetSeat('chesspell');
        showScreen('main-menu');
    });

    socket.on('roomCreated', (code) => {
        session.currentRoomCode = code;
        session.myPlayerNumber = 1;
        session.myPlayerColor = 'white';
        session.isOnline = true;
        document.getElementById('waiting-room-code').textContent = code;
        showScreen('waiting-screen');
        refreshInvites();
    });

    socket.on('roomJoined', (data) => {
        session.currentRoomCode = data.roomCode;
        session.myPlayerNumber = data.playerNumber;
        session.myPlayerColor = 'black';
        session.isOnline = true;
    });

    socket.on('gameStarted', (data) => {
        // Our own profile and deck are set; the opponent's come from the room.
        if (session.myPlayerNumber === 1) {
            match.p2Profile = data.roomState.profiles[2];
            match.p2Deck = data.roomState.decks[2];
        } else {
            match.p1Profile = data.roomState.profiles[1];
            match.p1Deck = data.roomState.decks[1];
        }
        showOnlineGame(data.roomState);
        renderChessboard();
        startTimer();
    });

    // A reloaded page comes back to its game (assets/js/seat.js).
    keepSeat(socket, 'chesspell', {
        idle: () => !session.currentRoomCode && !document.querySelector('#game-board.active, #draft-phase.active'),
        onResumed: resumeOnlineGame,
        onFailed: (reason) => notify(RESUME_FAILED[reason]),
    });

    // The server referees the game: after every action it sends the new state.
    socket.on('gameState', ({ state, action }) => {
        engine.applyServerState(state, action);
    });

    socket.on('opponentLeft', () => {
        session.currentRoomCode = null;
        if (engine.winner) return; // The game is over: the end screen stays up
        session.isOnline = false;
        showScreen('main-menu');
        notify('Your opponent left the game.');
    });

    // The server closed an idle room (see server/socket-utils.js).
    socket.on('roomClosed', (reason) => {
        leaveGame();
        notify(reason);
    });

    socket.on('errorMsg', (msg) => {
        notify(msg);
    });

    // A dropped connection: the server keeps the seat a while (see connection-notice.js).
    watchConnection(socket, {
        inRoom: () => Boolean(session.isOnline && session.currentRoomCode),
        onLost: () => {
            session.currentRoomCode = null; // The room is gone: nothing to leave
            if (engine.winner) return; // The game is over: the end screen stays up
            leaveGame();
            notify('Connection lost: the game could not be resumed.');
        },
    });
}

/**
 * The game screen of an online game: banners, the room's timer, a fresh board and both
 * hands. The profiles and decks are in `match` already.
 * @param {any} roomState server/chesspell.js getChesspellPublicRoomState
 */
function showOnlineGame(roomState) {
    match.isBotGame = false; // Even after a campaign game on this page
    setupPlayerBanner('player1-banner', match.p1Profile);
    setupPlayerBanner('player2-banner', match.p2Profile);

    // Both players use the room's timer (chosen by its creator).
    const timer = roomState.timer || { mode: 'turn', seconds: 10 };
    clock.mode = timer.mode;
    clock.minutes = Math.floor(timer.seconds / 60);
    clock.seconds = timer.seconds % 60;
    clock.leftP1 = timer.seconds;
    clock.leftP2 = timer.seconds;

    engine.init();
    showScreen('game-board');
    chat?.start(); // Both players are in the room

    renderInGameDeck(match.p1Deck, 'player1-cards', 'white');
    renderInGameDeck(match.p2Deck, 'player2-cards', 'black');
}

/**
 * Show the game the server sent back to a reloaded page: the waiting room, or the game
 * in progress with the time left. Our own profile is this page's when it has it (its
 * stats are kept here), else the copy the room holds.
 * @param {any} data server/chesspell.js 'seatResumed'
 */
function resumeOnlineGame(data) {
    const { roomState } = data;
    const mine = (/** @type {any} */ profile) => (profile && ProfileManager.find(profile.id)) || profile;
    document.getElementById('game-over-modal').classList.add('hidden');
    session.currentRoomCode = data.roomCode;
    session.myPlayerNumber = data.playerNumber;
    session.myPlayerColor = data.playerNumber === 1 ? 'white' : 'black';
    session.isOnline = true;
    match.p1Profile = data.playerNumber === 1 ? mine(roomState.profiles[1]) : roomState.profiles[1];
    match.p2Profile = data.playerNumber === 2 ? mine(roomState.profiles[2]) : roomState.profiles[2];
    match.p1Deck = roomState.decks[1];
    match.p2Deck = roomState.decks[2];
    if (roomState.gameState === 'waiting' || !data.state) {
        document.getElementById('waiting-room-code').textContent = data.roomCode;
        showScreen('waiting-screen');
        refreshInvites();
        return;
    }
    showOnlineGame(roomState);
    engine.applyServerState(data.state, null);
    clock.leftP1 = Math.ceil(data.timeLeft.white / 1000);
    clock.leftP2 = Math.ceil(data.timeLeft.black / 1000);
    startTimer({ keep: true });
}

/**
 * Join a room from an invitation: the online screen, the code filled in, and the
 * account (its deck) as the profile. Without a deck of three cards, the player is told
 * to build one first.
 */
export function joinFromInvite(roomCode) {
    // Leave the room or game this page is in first (a game in progress counts as left).
    if (session.currentRoomCode || document.querySelector('#game-board.active, #draft-phase.active')) leaveGame();
    showScreen('online-screen');
    /** @type {HTMLInputElement} */ (document.getElementById('room-code-input')).value = roomCode;
    const select = /** @type {HTMLSelectElement} */ (document.getElementById('online-p1-select'));
    if (ProfileManager.account) select.value = ProfileManager.account.id;
    const profile = ProfileManager.find(select.value);
    if (!profile || !profile.deck || profile.deck.length !== 3) {
        notify('Build your deck of three cards first (Deck Builder), then join with this code.');
        return;
    }
    document.getElementById('btn-join-room').click();
}
