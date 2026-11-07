// Online play: Socket.io handlers, added to `app`.
Object.assign(app, {
    setupOnlineListeners() {
        if (!socket) return;
        
        document.getElementById('btn-create-room')?.addEventListener('click', () => {
            const p1Id = document.getElementById('online-p1-select').value;
            const profile = ProfileManager.profiles.find(p => p.id === p1Id);
            if (!profile || !profile.deck || profile.deck.length !== 3) {
                return alert("You must select a profile with a valid 3-card deck.");
            }
            this.p1Profile = profile;
            this.p1Deck = [...profile.deck];
            socket.emit('createRoom', { deck: this.p1Deck, profile: this.p1Profile });
        });
        
        document.getElementById('btn-join-room')?.addEventListener('click', () => {
            const p1Id = document.getElementById('online-p1-select').value;
            const profile = ProfileManager.profiles.find(p => p.id === p1Id);
            if (!profile || !profile.deck || profile.deck.length !== 3) {
                return alert("You must select a profile with a valid 3-card deck.");
            }
            const code = document.getElementById('room-code-input').value.trim().toUpperCase();
            if (code.length === 6) {
                this.p2Profile = profile; // Locally, we are p2 joining
                this.p2Deck = [...profile.deck];
                socket.emit('joinRoom', { roomCode: code, deck: this.p2Deck, profile: this.p2Profile });
            } else {
                alert("Please enter a valid 6-letter code.");
            }
        });
        
        document.getElementById('btn-leave-room')?.addEventListener('click', () => {
            if (currentRoomCode) {
                socket.emit('leaveRoom', { roomCode: currentRoomCode });
                currentRoomCode = null;
            }
            this.showScreen('main-menu');
        });

        socket.on('roomCreated', (code) => {
            currentRoomCode = code;
            myPlayerNumber = 1;
            myPlayerColor = 'white';
            isOnline = true;
            document.getElementById('waiting-room-code').textContent = code;
            this.showScreen('waiting-screen');
        });

        socket.on('roomJoined', (data) => {
            currentRoomCode = data.roomCode;
            myPlayerNumber = data.playerNumber;
            myPlayerColor = 'black';
            isOnline = true;
        });

        socket.on('gameStarted', (data) => {
            const state = data.roomState;
            // When game starts, we need to map profiles and decks correctly
            if (myPlayerNumber === 1) {
                this.p2Profile = state.profiles[2];
                this.p2Deck = state.decks[2];
            } else {
                this.p1Profile = state.profiles[1];
                this.p1Deck = state.decks[1];
            }
            
            this.setupPlayerBanner('player1-banner', this.p1Profile);
            this.setupPlayerBanner('player2-banner', this.p2Profile);
            
            engine.init();
            this.showScreen('game-board');
            
            this.renderInGameDeck(this.p1Deck, 'player1-cards', 'white');
            this.renderInGameDeck(this.p2Deck, 'player2-cards', 'black');
            
            this.renderChessboard();
        });

        socket.on('moveMade', (data) => {
            const { from, to } = data;
            engine.move(from.r, from.c, to.r, to.c, true);
        });

        socket.on('spellActivated', (data) => {
            // Find the card element to animate it or mark it
            const containerId = engine.turn === 'white' ? 'player1-cards' : 'player2-cards';
            const cardEl = document.querySelector(`#${containerId} .in-game-card[data-card-id="${data.cardId}"]`);
            if (cardEl) {
                engine.activateSpell(data.cardId, cardEl, true);
            }
        });

        socket.on('spellSquareClicked', (data) => {
            engine.handleSquareClick(data.r, data.c, true);
        });

        socket.on('opponentLeft', () => {
            alert("Your opponent left the game.");
            currentRoomCode = null;
            isOnline = false;
            this.showScreen('main-menu');
        });

        socket.on('errorMsg', (msg) => {
            alert(msg);
        });
    },
});
