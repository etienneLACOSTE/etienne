// @ts-check
// App shell: state, menus, screens, game setup and timer. Other app-*.js files add methods.
import { session, socket } from './state.js';
import { engine } from './game-engine.js';
import { ProfileManager } from './profiles.js';

/** The application: its methods are spread over app*.js, so `this` is the whole app. */
export const app = /** @type {any} */ ({
    selectedCards: new Set(),
    maxCards: 3,
    selectedPiece: null,
    p1Profile: null,
    p2Profile: null,
    editingDeckForProfileId: null,
    // Timer state
    timerMode: 'turn',
    timerMinutes: 0,
    timerSeconds: 10,
    timeLeftP1: 10,
    timeLeftP2: 10,
    timerInterval: null,
    // Bot state
    isBotGame: false,
    botDifficulty: 'novice',
    botDeckType: 'random',

    init() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('demo') === 'true') {
            this.startDemo();
            return;
        }

        ProfileManager.loadProfiles();
        ProfileManager.renderProfilesList();
        this.updatePlayerSelects();
        
        this.renderCards('index-grid', false);
        this.renderCards('deck-grid', true);
        document.getElementById('deck-profile-select').addEventListener('change', (e) => {
            this.loadDeck(/** @type {HTMLSelectElement} */ (e.target).value);
        });
        this.setupOnlineListeners();
    },

    updatePlayerSelects() {
        const p1Select = /** @type {HTMLSelectElement} */ (document.getElementById('p1-select'));
        const p2Select = /** @type {HTMLSelectElement} */ (document.getElementById('p2-select'));
        p1Select.innerHTML = '';
        p2Select.innerHTML = '';
        
        ProfileManager.profiles.forEach(p => {
            const opt1 = document.createElement('option');
            opt1.value = p.id; opt1.textContent = p.name;
            const opt2 = document.createElement('option');
            opt2.value = p.id; opt2.textContent = p.name;
            p1Select.appendChild(opt1);
            p2Select.appendChild(opt2);
        });
        
        if (ProfileManager.profiles.length > 1) {
            p2Select.value = ProfileManager.profiles[1].id;
        }
        
        const onlineP1Select = document.getElementById('online-p1-select');
        if (onlineP1Select) {
            onlineP1Select.innerHTML = '';
            ProfileManager.profiles.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id; opt.textContent = p.name;
                onlineP1Select.appendChild(opt);
            });
        }
    },

    /** The deck builder, opened on a profile's deck (from its card in Manage Profiles). */
    buildDeckForProfile(profileId) {
        this.editingDeckForProfileId = profileId;
        this.showScreen('deck-builder');
    },

    /** Fill the profile list and show the deck of the profile being edited (or the first). */
    openDeckBuilder() {
        const select = /** @type {HTMLSelectElement} */ (document.getElementById('deck-profile-select'));
        select.replaceChildren(...ProfileManager.profiles.map((p) => new Option(p.name, p.id)));
        const known = ProfileManager.profiles.some((p) => p.id === this.editingDeckForProfileId);
        this.loadDeck(known ? this.editingDeckForProfileId : ProfileManager.profiles[0]?.id);
    },

    /** Show a profile's saved deck, ready to change. */
    loadDeck(profileId) {
        const profile = ProfileManager.profiles.find((p) => p.id === profileId);
        this.editingDeckForProfileId = profile ? profile.id : null;
        this.selectedCards = new Set(profile ? profile.deck : []);
        if (profile) /** @type {HTMLSelectElement} */ (document.getElementById('deck-profile-select')).value = profile.id;
        this.deckMessage(profile
            ? 'Click a card to add it to the deck or take it out. A deck holds three cards.'
            : 'Create a profile first (Manage Profiles): each profile keeps its own deck.');
        this.updateSelectionUI();
    },

    saveDeckForProfile() {
        const profile = ProfileManager.profiles.find(p => p.id === this.editingDeckForProfileId);
        if (!profile || this.selectedCards.size !== this.maxCards) return;
        profile.deck = Array.from(this.selectedCards);
        ProfileManager.saveProfiles();
        ProfileManager.renderProfilesList();
        this.deckMessage(`Deck saved for ${profile.name}.`);
    },

    /** A finished game counts in the players' profiles (not the bot's, not the opponent's online). */
    recordResult(winner) {
        let changed = false;
        for (const [color, profile] of [['white', this.p1Profile], ['black', this.p2Profile]]) {
            if (!ProfileManager.profiles.includes(profile)) continue;
            profile.stats.played++;
            if (color === winner) profile.stats.wins++;
            changed = true;
        }
        if (!changed) return;
        ProfileManager.saveProfiles();
        ProfileManager.renderProfilesList();
    },

    /** Same players, same decks, a fresh board. */
    rematch() {
        if (this.timerMode === 'overall') {
            this.timeLeftP1 = this.timerMinutes * 60 + this.timerSeconds;
            this.timeLeftP2 = this.timeLeftP1;
        }
        this.initGame();
    },

    /** From the end screen back to the menu (online, the room is left). */
    leaveGame() {
        document.getElementById('game-over-modal').classList.add('hidden');
        clearInterval(this.timerInterval);
        if (session.isOnline && socket) {
            if (session.currentRoomCode) socket.emit('leaveRoom', { roomCode: session.currentRoomCode });
            session.currentRoomCode = null;
            session.isOnline = false;
        }
        this.showScreen('main-menu');
    },

    toggleTabletopMode() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().then(() => {
                document.body.classList.add('tabletop-mode');
                const orientation = /** @type {any} */ (screen.orientation); // lock() is not in every browser
                if (orientation && orientation.lock) {
                    orientation.lock('landscape').catch(e => console.warn('Orientation lock failed:', e));
                }
            }).catch(err => {
                alert(`Error attempting to enable fullscreen: ${err.message}`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    },

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
        if (screenId === 'player-select-screen') {
            this.updatePlayerSelects();
        }
        if (screenId === 'deck-builder') this.openDeckBuilder();
    },

    startGame(skipDraft) {
        const p1Id = /** @type {HTMLSelectElement} */ (document.getElementById('p1-select')).value;
        const p2Id = /** @type {HTMLSelectElement} */ (document.getElementById('p2-select')).value;
        
        if (p1Id === p2Id) {
            return alert("Please select different profiles for Player 1 and Player 2.");
        }
        
        this.p1Profile = ProfileManager.profiles.find(p => p.id === p1Id);
        this.p2Profile = ProfileManager.profiles.find(p => p.id === p2Id);
        
        this.timerMinutes = parseInt(/** @type {HTMLInputElement} */ (document.getElementById('timer-min')).value) || 0;
        this.timerSeconds = parseInt(/** @type {HTMLInputElement} */ (document.getElementById('timer-sec')).value) || 0;
        
        if (this.timerMode === 'overall') {
            this.timeLeftP1 = this.timerMinutes * 60 + this.timerSeconds;
            this.timeLeftP2 = this.timeLeftP1;
        }
        
        // Setup Banners for the game board
        this.setupPlayerBanner('player1-banner', this.p1Profile);
        this.setupPlayerBanner('player2-banner', this.p2Profile);
        
        if (skipDraft) {
            const p1HasDeck = this.p1Profile.deck && this.p1Profile.deck.length === 3;
            const p2HasDeck = this.p2Profile.deck && this.p2Profile.deck.length === 3;
            if (!p1HasDeck || (!this.isBotGame && !p2HasDeck)) {
                return alert("Both players must have a saved deck (3 cards) to play Campaign Mode. Go to 'Manage Profiles' to build decks.");
            }
            this.p1Deck = [...this.p1Profile.deck];
            this.p2Deck = this.isBotGame ? this.generateBotDeck() : [...this.p2Profile.deck];
            this.initGame();
        } else {
            this.isBotGame = false;
            this.p1Deck = [];
            this.p2Deck = [];
            this.draftSequence = [1, 2, 2, 1, 1, 2];
            this.currentDraftIndex = 0;
            
            this.showScreen('draft-phase');
            this.renderDraftCards();
            this.updateDraftUI();
        }
    },

    // Timer Functions
    setTimerMode(mode) {
        this.timerMode = mode;
        document.querySelectorAll('.timer-toggle-btn').forEach(btn => btn.classList.remove('selected', 'btn-primary'));
        const btn = document.getElementById(mode === 'turn' ? 'btn-timer-turn' : 'btn-timer-overall');
        btn.classList.add('selected');
        
        document.getElementById('timer-desc-turn').classList.toggle('hidden', mode !== 'turn');
        document.getElementById('timer-desc-overall').classList.toggle('hidden', mode !== 'overall');
    },

    startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        if (this.timerMode === 'turn') {
            this.timeLeftP1 = this.timerMinutes * 60 + this.timerSeconds;
            this.timeLeftP2 = this.timeLeftP1;
        }
        document.getElementById('side-status').classList.remove('hidden');
        
        this.timerInterval = setInterval(() => {
            if (engine.turn === 'white') {
                this.timeLeftP1--;
                if (this.timeLeftP1 <= 0) this.handleTimeout('white');
            } else {
                if (this.isBotGame) return; // Bot doesn't have a timer or it plays instantly
                this.timeLeftP2--;
                if (this.timeLeftP2 <= 0) this.handleTimeout('black');
            }
            this.updateTimerVisuals();
        }, 1000);
        this.updateTimerVisuals();
    },

    updateTimerVisuals() {
        const time = engine.turn === 'white' ? this.timeLeftP1 : this.timeLeftP2;
        const total = this.timerMinutes * 60 + this.timerSeconds;
        
        let pct = 100;
        if (total > 0) {
            pct = Math.max(0, (time / total) * 100);
        }
        
        const bar = document.getElementById('timer-bar');
        bar.style.height = `${pct}%`;
        
        bar.classList.toggle('timer-low', pct < 20);
        
        const m = Math.floor(time / 60);
        const s = time % 60;
        document.getElementById('timer-text-overlay').textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    },

    handleTimeout(player) {
        clearInterval(this.timerInterval);
        if (session.isOnline) return; // Online, the server keeps the clock and decides
        if (this.timerMode === 'overall') {
            engine.winner = player === 'white' ? 'Black' : 'White';
            engine.showGameOver('time');
        } else {
            // Skip turn
            engine.endTurn();
            this.renderChessboard();
        }
    },
});
