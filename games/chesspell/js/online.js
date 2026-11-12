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

/** The online buttons and the server's messages. */
export function setupOnline() {
    if (!socket) return;
    
    document.getElementById('btn-create-room')?.addEventListener('click', () => {
        const p1Id = /** @type {HTMLSelectElement} */ (document.getElementById('online-p1-select')).value;
        const profile = ProfileManager.find(p1Id);
        if (!profile || !profile.deck || profile.deck.length !== 3) {
            return alert("You must select a profile with a valid 3-card deck.");
        }
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
        const p1Id = /** @type {HTMLSelectElement} */ (document.getElementById('online-p1-select')).value;
        const profile = ProfileManager.find(p1Id);
        if (!profile || !profile.deck || profile.deck.length !== 3) {
            return alert("You must select a profile with a valid 3-card deck.");
        }
        const code = /** @type {HTMLInputElement} */ (document.getElementById('room-code-input')).value.trim().toUpperCase();
        if (code.length === 6) {
            match.p2Profile = profile; // Locally, we are p2 joining
            match.p2Deck = [...profile.deck];
            socket.emit('joinRoom', { roomCode: code, deck: match.p2Deck, profile: match.p2Profile });
        } else {
            alert("Please enter a valid 6-letter code.");
        }
    });
    
    document.getElementById('btn-leave-room')?.addEventListener('click', () => {
        if (session.currentRoomCode) {
            socket.emit('leaveRoom', { roomCode: session.currentRoomCode });
            session.currentRoomCode = null;
        }
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
        const state = data.roomState;
        match.isBotGame = false; // Even after a campaign game on this page
        // Our own profile and deck are set; the opponent's come from the room.
        if (session.myPlayerNumber === 1) {
            match.p2Profile = state.profiles[2];
            match.p2Deck = state.decks[2];
        } else {
            match.p1Profile = state.profiles[1];
            match.p1Deck = state.decks[1];
        }
        
        setupPlayerBanner('player1-banner', match.p1Profile);
        setupPlayerBanner('player2-banner', match.p2Profile);
        
        // Both players use the room's timer (chosen by its creator).
        const timer = state.timer || { mode: 'turn', seconds: 10 };
        clock.mode = timer.mode;
        clock.minutes = Math.floor(timer.seconds / 60);
        clock.seconds = timer.seconds % 60;
        clock.leftP1 = timer.seconds;
        clock.leftP2 = timer.seconds;

        engine.init();
        showScreen('game-board');
        
        renderInGameDeck(match.p1Deck, 'player1-cards', 'white');
        renderInGameDeck(match.p2Deck, 'player2-cards', 'black');
        
        renderChessboard();
        startTimer();
    });

    // The server referees the game: after every action it sends the new state.
    socket.on('gameState', ({ state, action }) => {
        engine.applyServerState(state, action);
    });

    socket.on('opponentLeft', () => {
        session.currentRoomCode = null;
        if (engine.winner) return; // The game is over: the end screen stays up
        alert("Your opponent left the game.");
        session.isOnline = false;
        showScreen('main-menu');
    });

    // The server closed an idle room (see server/socket-utils.js).
    socket.on('roomClosed', (reason) => {
        alert(reason);
        leaveGame();
    });

    socket.on('errorMsg', (msg) => {
        alert(msg);
    });

    // A dropped connection: the server keeps the seat a while (see connection-notice.js).
    watchConnection(socket, {
        inRoom: () => Boolean(session.isOnline && session.currentRoomCode),
        onLost: () => {
            session.currentRoomCode = null; // The room is gone: nothing to leave
            if (engine.winner) return; // The game is over: the end screen stays up
            alert('Connection lost: the game could not be resumed.');
            leaveGame();
        },
    });
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
        alert('Build your deck of three cards first (Deck Builder), then join with this code.');
        return;
    }
    document.getElementById('btn-join-room').click();
}
