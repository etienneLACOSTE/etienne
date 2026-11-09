// @ts-check
// Online play: Socket.io handlers, added to `app`.
import { session, socket } from './state.js';
import { engine } from './game-engine.js';
import { ProfileManager } from './profiles.js';
import { app } from './app.js';

Object.assign(app, /** @type {ThisType<any>} */ ({
    setupOnlineListeners() {
        if (!socket) return;
        
        document.getElementById('btn-create-room')?.addEventListener('click', () => {
            const p1Id = /** @type {HTMLSelectElement} */ (document.getElementById('online-p1-select')).value;
            const profile = ProfileManager.profiles.find(p => p.id === p1Id);
            if (!profile || !profile.deck || profile.deck.length !== 3) {
                return alert("You must select a profile with a valid 3-card deck.");
            }
            this.p1Profile = profile;
            this.p1Deck = [...profile.deck];
            // The creator's timer applies to both players; the server keeps the clock.
            const minutes = parseInt(/** @type {HTMLInputElement} */ (document.getElementById('timer-min')).value) || 0;
            const seconds = parseInt(/** @type {HTMLInputElement} */ (document.getElementById('timer-sec')).value) || 0;
            socket.emit('createRoom', {
                deck: this.p1Deck, profile: this.p1Profile,
                timerMode: this.timerMode, timerSeconds: minutes * 60 + seconds,
            });
        });
        
        document.getElementById('btn-join-room')?.addEventListener('click', () => {
            const p1Id = /** @type {HTMLSelectElement} */ (document.getElementById('online-p1-select')).value;
            const profile = ProfileManager.profiles.find(p => p.id === p1Id);
            if (!profile || !profile.deck || profile.deck.length !== 3) {
                return alert("You must select a profile with a valid 3-card deck.");
            }
            const code = /** @type {HTMLInputElement} */ (document.getElementById('room-code-input')).value.trim().toUpperCase();
            if (code.length === 6) {
                this.p2Profile = profile; // Locally, we are p2 joining
                this.p2Deck = [...profile.deck];
                socket.emit('joinRoom', { roomCode: code, deck: this.p2Deck, profile: this.p2Profile });
            } else {
                alert("Please enter a valid 6-letter code.");
            }
        });
        
        document.getElementById('btn-leave-room')?.addEventListener('click', () => {
            if (session.currentRoomCode) {
                socket.emit('leaveRoom', { roomCode: session.currentRoomCode });
                session.currentRoomCode = null;
            }
            this.showScreen('main-menu');
        });

        socket.on('roomCreated', (code) => {
            session.currentRoomCode = code;
            session.myPlayerNumber = 1;
            session.myPlayerColor = 'white';
            session.isOnline = true;
            document.getElementById('waiting-room-code').textContent = code;
            this.showScreen('waiting-screen');
        });

        socket.on('roomJoined', (data) => {
            session.currentRoomCode = data.roomCode;
            session.myPlayerNumber = data.playerNumber;
            session.myPlayerColor = 'black';
            session.isOnline = true;
        });

        socket.on('gameStarted', (data) => {
            const state = data.roomState;
            // When game starts, we need to map profiles and decks correctly
            if (session.myPlayerNumber === 1) {
                this.p2Profile = state.profiles[2];
                this.p2Deck = state.decks[2];
            } else {
                this.p1Profile = state.profiles[1];
                this.p1Deck = state.decks[1];
            }
            
            this.setupPlayerBanner('player1-banner', this.p1Profile);
            this.setupPlayerBanner('player2-banner', this.p2Profile);
            
            // Both players use the room's timer (chosen by its creator).
            const timer = state.timer || { mode: 'turn', seconds: 10 };
            this.timerMode = timer.mode;
            this.timerMinutes = Math.floor(timer.seconds / 60);
            this.timerSeconds = timer.seconds % 60;
            this.timeLeftP1 = timer.seconds;
            this.timeLeftP2 = timer.seconds;

            engine.init();
            this.showScreen('game-board');
            
            this.renderInGameDeck(this.p1Deck, 'player1-cards', 'white');
            this.renderInGameDeck(this.p2Deck, 'player2-cards', 'black');
            
            this.renderChessboard();
            this.startTimer();
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
            this.showScreen('main-menu');
        });

        // The server closed an idle room (see server/socket-utils.js).
        socket.on('roomClosed', (reason) => {
            alert(reason);
            this.leaveGame();
        });

        socket.on('errorMsg', (msg) => {
            alert(msg);
        });
    },
}));
