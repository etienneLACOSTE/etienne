const cardsData = [
    { id: 1, name: "Cannibalism", icon: "💀", effect: "Eat one of your own pieces.", unlock: "Unlocked by default.", isLocked: false,
      details: { timing: "Play instead of your normal move.", conditions: "You must have at least one piece to destroy.", inputs: "Click on one of your own pieces." } },
    { id: 2, name: "Double Trouble", icon: "⚡", effect: "Play 2 moves in a row, but your opponent does the same on their next turn.", unlock: "Play 5 games.", isLocked: true,
      details: { timing: "Play before your normal move.", conditions: "None.", inputs: "None. You simply get two consecutive turns." } },
    { id: 3, name: "Objection!", icon: "🛑", effect: "Force opponent to change their last move.", unlock: "Win a game with a forced mate.", isLocked: true,
      details: { timing: "Play immediately at the start of your turn.", conditions: "Opponent must have had more than 1 legal move.", inputs: "None. Opponent must choose a different move." } },
    { id: 4, name: "Sidestep", icon: "👣", effect: "Move a piece exactly one square.", unlock: "Move a king 10 times in one game.", isLocked: true,
      details: { timing: "Play instead of your normal move.", conditions: "None.", inputs: "Click your piece, then click an adjacent empty square." } },
    { id: 5, name: "Ghost", icon: "👻", effect: "For this turn, your moved piece passes through other pieces (cannot capture King).", unlock: "Unlocked by default.", isLocked: false,
      details: { timing: "Anytime on your turn.", conditions: "None.", inputs: "Activate, then move your piece." } },
    { id: 6, name: "Swap", icon: "🔄", effect: "Swap the positions of two of your own non-king pieces.", unlock: "Capture a queen with a pawn.", isLocked: true,
      details: { timing: "Play instead of your normal move.", conditions: "You must have at least two non-king pieces.", inputs: "Click the first piece, then click the second piece." } },
    { id: 7, name: "Sniper", icon: "🎯", effect: "Your Bishop can capture a piece without moving to its square.", unlock: "Win 3 games.", isLocked: true,
      details: { timing: "Play instead of your normal move.", conditions: "Your Bishop must have a clear line of sight to an enemy.", inputs: "Click your Bishop, then click the enemy piece to destroy it." } },
    { id: 8, name: "Wall", icon: "🧱", effect: "Place a temporary obstacle on an empty square for 2 turns.", unlock: "Unlocked by default.", isLocked: false,
      details: { timing: "Play instead of your normal move.", conditions: "None.", inputs: "Click on any empty square to place the Wall." } },
    { id: 9, name: "Revive", icon: "✨", effect: "Bring back your last captured pawn on its starting square.", unlock: "Lose 10 pawns.", isLocked: true,
      details: { timing: "Play instead of your normal move.", conditions: "You must have lost a pawn, and its starting square must be empty.", inputs: "None." } },
    { id: 10, name: "Tornado", icon: "🌪️", effect: "Randomize the positions of all pieces in a selected 3x3 area.", unlock: "Play 20 games.", isLocked: true,
      details: { timing: "Play instead of your normal move.", conditions: "None.", inputs: "Click the center square of the 3x3 area you want to scramble." } },
    { id: 11, name: "Shield", icon: "🛡️", effect: "Protect a chosen piece from being captured for one turn.", unlock: "Castle 5 times.", isLocked: true,
      details: { timing: "Play instead of your normal move.", conditions: "None.", inputs: "Click on one of your own pieces." } },
    { id: 12, name: "Leap Frog", icon: "🐸", effect: "Any chosen piece can move like a Knight for one turn.", unlock: "Unlocked by default.", isLocked: false,
      details: { timing: "Play before your normal move.", conditions: "None.", inputs: "None. The effect modifies your next move." } },
    { id: 13, name: "Mirror", icon: "🪞", effect: "Copy the effect of the last card your opponent played.", unlock: "Win against 3 different decks.", isLocked: true,
      details: { timing: "Depends on the copied card.", conditions: "Opponent must have played a card previously.", inputs: "Depends on the copied card." } },
    { id: 14, name: "Sacrifice", icon: "🩸", effect: "Destroy any of your pieces (except King) to promote a Pawn to that piece.", unlock: "Unlocked by default.", isLocked: false,
      details: { timing: "Anytime on your turn", conditions: "Must have a piece to sacrifice and a Pawn.", inputs: "Select the piece to sacrifice, then select the Pawn." } },
    { id: 15, name: "Freeze", icon: "🧊", effect: "Freeze an enemy piece for 1 turn. (Free action: you can move a piece afterwards)", unlock: "Unlocked by default.", isLocked: false,
      details: { timing: "Anytime on your turn", conditions: "Target an enemy piece.", inputs: "Select the enemy piece." } },
    { id: 16, name: "Trap", icon: "🕸️", effect: "Select an empty square; the first enemy piece to land there is destroyed.", unlock: "Win in under 20 moves.", isLocked: true,
      details: { timing: "Play instead of your normal move.", conditions: "None.", inputs: "Click on an empty square to place the hidden trap." } },
    { id: 17, name: "Teleport", icon: "🌀", effect: "Move a piece to any empty square on your starting rank.", unlock: "Unlocked by default.", isLocked: false,
      details: { timing: "Play instead of your normal move.", conditions: "You must have an empty square on your back rank.", inputs: "Click your piece, then click the destination square on your back rank." } },
    { id: 18, name: "Time Rewind", icon: "⏳", effect: "Undo the last full turn.", unlock: "Play 50 games.", isLocked: true,
      details: { timing: "Play immediately at the start of your turn.", conditions: "At least one turn must have been played.", inputs: "None." } },
    { id: 19, name: "Assassin", icon: "🗡️", effect: "A Knight can capture two adjacent pieces in one single move.", unlock: "Capture 20 pieces with Knights.", isLocked: true,
      details: { timing: "Play before your normal move.", conditions: "You must have a Knight in position to double-capture.", inputs: "None. Simply make your Knight move." } },
    { id: 20, name: "Promotion", icon: "👑", effect: "Promote a piece to the rank of the piece it just captured.", unlock: "Unlocked by default.", isLocked: false,
      details: { timing: "Play after capturing a piece.", conditions: "You must have just captured an enemy piece.", inputs: "None." } }
];

const PIECE_MAP = {
    'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚', 'p': '♟',
    'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔', 'P': '♙',
    'W': '🧱'
};

const engine = {
    board: [],
    turn: 'white',
    activeCardEl: null,
    activeSpellId: null,
    targetingState: null,
    tpSource: null,
    sacrificeRook: null,
    frozenPieces: [],
    capturedByWhite: [],
    capturedByBlack: [],
    
    init() {
        this.board = [
            ['r','n','b','q','k','b','n','r'],
            ['p','p','p','p','p','p','p','p'],
            [null,null,null,null,null,null,null,null],
            [null,null,null,null,null,null,null,null],
            [null,null,null,null,null,null,null,null],
            [null,null,null,null,null,null,null,null],
            ['P','P','P','P','P','P','P','P'],
            ['R','N','B','Q','K','B','N','R']
        ];
        this.turn = 'white';
        this.frozenPieces = [];
        this.capturedByWhite = [];
        this.capturedByBlack = [];
        this.cancelSpell();
    },
    
    destroyPiece(p) {
        if (!p) return;
        if (this.getColor(p) === 'white') {
            this.capturedByBlack.push(p);
        } else {
            this.capturedByWhite.push(p);
        }
    },
    
    getColor(p) {
        if (!p || p === 'W') return null;
        return p === p.toUpperCase() ? 'white' : 'black';
    },
    
    getValidMoves(r, c) {
        if (this.frozenPieces.some(fp => fp.r === r && fp.c === c)) return [];
        
        const p = this.board[r][c];
        if (!p) return [];
        const color = this.getColor(p);
        const type = p.toLowerCase();
        const moves = [];
        
        const addIfValid = (nr, nc, captureOnly = false, moveOnly = false) => {
            if (nr < 0 || nr > 7 || nc < 0 || nc > 7) return false;
            const target = this.board[nr][nc];
            
            if (this.ghostActive) {
                if (target) {
                    if (this.getColor(target) !== color && target !== 'W' && !moveOnly && target.toLowerCase() !== 'k') {
                        moves.push({r: nr, c: nc, capture: true});
                    }
                    return true;
                } else {
                    if (!captureOnly) moves.push({r: nr, c: nc, capture: false});
                    return true;
                }
            } else {
                if (target) {
                    if (moveOnly) return false;
                    if (this.getColor(target) !== color && target !== 'W') moves.push({r: nr, c: nc, capture: true});
                    return false;
                } else {
                    if (!captureOnly) moves.push({r: nr, c: nc, capture: false});
                    return true;
                }
            }
        };

        if (type === 'p') {
            const dir = color === 'white' ? -1 : 1;
            const startRow = color === 'white' ? 6 : 1;
            if (addIfValid(r + dir, c, false, true) && r === startRow) {
                addIfValid(r + dir * 2, c, false, true);
            }
            addIfValid(r + dir, c - 1, true, false);
            addIfValid(r + dir, c + 1, true, false);
        } else if (type === 'n') {
            const jumps = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
            jumps.forEach(j => addIfValid(r + j[0], c + j[1]));
        } else if (type === 'b' || type === 'r' || type === 'q') {
            const dirs = [];
            if (type === 'b' || type === 'q') dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
            if (type === 'r' || type === 'q') dirs.push([-1,0],[1,0],[0,-1],[0,1]);
            dirs.forEach(d => {
                let nr = r + d[0], nc = c + d[1];
                while(addIfValid(nr, nc)) { nr += d[0]; nc += d[1]; }
            });
        } else if (type === 'k') {
            const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
            dirs.forEach(d => addIfValid(r + d[0], c + d[1]));
        }
        return moves;
    },
    
    move(r1, c1, r2, c2) {
        const targetPiece = this.board[r2][c2];
        if (targetPiece) this.destroyPiece(targetPiece);
        
        this.board[r2][c2] = this.board[r1][c1];
        this.board[r1][c1] = null;
        
        this.frozenPieces = this.frozenPieces.filter(fp => fp.r !== r1 || fp.c !== c1);
        this.ghostActive = false;
        this.turn = this.turn === 'white' ? 'black' : 'white';
        
        this.frozenPieces.forEach(fp => fp.duration--);
        this.frozenPieces = this.frozenPieces.filter(fp => fp.duration > 0);
        
        app.renderChessboard();
    },

    activateSpell(cardId, cardEl) {
        this.activeSpellId = cardId;
        this.activeCardEl = cardEl;
        const instr = document.getElementById('spell-instruction');
        
        if (cardId === 1) { // Cannibalism
            this.targetingState = 'select_own_piece';
            instr.textContent = "Select one of your own pieces to destroy.";
        } else if (cardId === 17) { // Teleport
            this.targetingState = 'select_own_piece_tp';
            instr.textContent = "Select a piece to teleport.";
        } else if (cardId === 8) { // Wall
            this.targetingState = 'select_empty_square';
            instr.textContent = "Select an empty square to place a wall.";
        } else if (cardId === 15) { // Freeze
            this.targetingState = 'select_enemy_freeze';
            instr.textContent = "Select an enemy piece to freeze for 1 turn.";
        } else if (cardId === 14) { // Sacrifice
            this.targetingState = 'select_own_piece_sac';
            instr.textContent = "Select one of your pieces (except King) to sacrifice.";
        } else if (cardId === 5) { // Ghost
            this.ghostActive = true;
            this.completeSpell();
            return;
        } else {
            instr.textContent = "Spell not implemented yet.";
            setTimeout(() => this.cancelSpell(), 2000);
            return;
        }
        instr.classList.remove('hidden');
        app.renderChessboard(); // Re-render to disable drags
    },

    cancelSpell() {
        this.activeSpellId = null;
        this.activeCardEl = null;
        this.targetingState = null;
        document.getElementById('spell-instruction').classList.add('hidden');
    },

    handleSquareClick(r, c) {
        if (!this.targetingState) return;
        
        const p = this.board[r][c];
        const color = this.getColor(p);
        
        if (this.activeSpellId === 1 && this.targetingState === 'select_own_piece') {
            if (color === this.turn) {
                this.destroyPiece(p);
                this.board[r][c] = null;
                this.completeSpell();
            }
        } else if (this.activeSpellId === 17 && this.targetingState === 'select_own_piece_tp') {
            if (color === this.turn) {
                this.tpSource = {r, c};
                this.targetingState = 'select_tp_target';
                document.getElementById('spell-instruction').textContent = "Select an empty square on your starting rank.";
            }
        } else if (this.activeSpellId === 17 && this.targetingState === 'select_tp_target') {
            const targetRank = this.turn === 'white' ? 7 : 0;
            if (!p && r === targetRank) {
                this.board[r][c] = this.board[this.tpSource.r][this.tpSource.c];
                this.board[this.tpSource.r][this.tpSource.c] = null;
                this.completeSpell();
            }
        } else if (this.activeSpellId === 8 && this.targetingState === 'select_empty_square') {
            if (!p) {
                this.board[r][c] = 'W';
                this.completeSpell();
            }
        } else if (this.activeSpellId === 15 && this.targetingState === 'select_enemy_freeze') {
            if (p && color !== this.turn && p !== 'W') {
                this.frozenPieces.push({r, c, duration: 2}); // 2 half-turns
                this.completeSpell();
            }
        } else if (this.activeSpellId === 14 && this.targetingState === 'select_own_piece_sac') {
            if (p && color === this.turn && p.toLowerCase() !== 'k') {
                this.sacrificePiece = {r, c, type: p};
                this.targetingState = 'select_own_pawn_sac';
                document.getElementById('spell-instruction').textContent = "Now select one of your Pawns to promote to that piece.";
            }
        } else if (this.activeSpellId === 14 && this.targetingState === 'select_own_pawn_sac') {
            if (p && color === this.turn && p.toLowerCase() === 'p') {
                this.destroyPiece(this.board[this.sacrificePiece.r][this.sacrificePiece.c]);
                this.board[this.sacrificePiece.r][this.sacrificePiece.c] = null;
                this.board[r][c] = this.sacrificePiece.type;
                this.completeSpell();
            }
        }
    },

    completeSpell() {
        this.activeCardEl.classList.add('used');
        this.cancelSpell();
        app.renderChessboard();
    }
};

const ProfileManager = {
    profiles: [],
    editingProfileId: null,
    
    loadProfiles() {
        const stored = localStorage.getItem('spellChessProfiles');
        if (stored) {
            this.profiles = JSON.parse(stored);
            // Ensure old profiles have a deck array
            this.profiles.forEach(p => { if (!p.deck) p.deck = []; });
        } else {
            this.profiles = [
                { id: 'guest1', name: 'Guest 1', avatar: '', stats: { played: 0, wins: 0 }, deck: [] },
                { id: 'guest2', name: 'Guest 2', avatar: '', stats: { played: 0, wins: 0 }, deck: [] }
            ];
            this.saveProfiles();
        }
    },
    
    saveProfiles() {
        localStorage.setItem('spellChessProfiles', JSON.stringify(this.profiles));
    },
    
    submitProfile() {
        const nameInput = document.getElementById('new-profile-name');
        const fileInput = document.getElementById('new-profile-avatar');
        const name = nameInput.value.trim();
        
        if (!name) return alert("Please enter a username.");
        
        const processAvatar = (callback) => {
            if (fileInput.files && fileInput.files[0]) {
                const file = fileInput.files[0];
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = 150;
                        canvas.height = 150;
                        const ctx = canvas.getContext('2d');
                        
                        const size = Math.min(img.width, img.height);
                        const sx = (img.width - size) / 2;
                        const sy = (img.height - size) / 2;
                        
                        ctx.drawImage(img, sx, sy, size, size, 0, 0, canvas.width, canvas.height);
                        
                        callback(canvas.toDataURL('image/jpeg', 0.8));
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            } else {
                callback(null);
            }
        };

        processAvatar((avatarData) => {
            if (this.editingProfileId) {
                const p = this.profiles.find(p => p.id === this.editingProfileId);
                if (p) {
                    p.name = name;
                    if (avatarData) p.avatar = avatarData;
                }
                this.cancelEdit();
            } else {
                this.addProfile(name, avatarData || '');
                nameInput.value = '';
                fileInput.value = '';
            }
            this.saveProfiles();
            this.renderProfilesList();
            app.updatePlayerSelects();
        });
    },
    
    editProfile(id) {
        const p = this.profiles.find(p => p.id === id);
        if (!p) return;
        this.editingProfileId = id;
        document.getElementById('new-profile-name').value = p.name;
        document.getElementById('profile-form-title').textContent = "Edit Profile";
        document.getElementById('profile-submit-btn').textContent = "Save Changes";
        document.getElementById('profile-cancel-btn').style.display = 'inline-block';
        window.scrollTo({top: 0, behavior: 'smooth'});
    },

    cancelEdit() {
        this.editingProfileId = null;
        document.getElementById('new-profile-name').value = '';
        document.getElementById('new-profile-avatar').value = '';
        document.getElementById('profile-form-title').textContent = "Create New Profile";
        document.getElementById('profile-submit-btn').textContent = "Create";
        document.getElementById('profile-cancel-btn').style.display = 'none';
    },

    deleteProfile(id) {
        if (confirm("Are you sure you want to delete this profile?")) {
            this.profiles = this.profiles.filter(p => p.id !== id);
            this.saveProfiles();
            this.renderProfilesList();
            app.updatePlayerSelects();
        }
    },

    addProfile(name, avatar) {
        this.profiles.push({
            id: 'p_' + Date.now(),
            name: name,
            avatar: avatar,
            stats: { played: 0, wins: 0 },
            deck: []
        });
    },
    
    renderProfilesList() {
        const container = document.getElementById('profiles-list');
        container.innerHTML = '';
        this.profiles.forEach(p => {
            const el = document.createElement('div');
            el.className = 'profile-card';
            const imgHtml = p.avatar ? `<img src="${p.avatar}" class="player-avatar">` : `<div class="player-avatar" style="background:#333"></div>`;
            const isDeckValid = p.deck && p.deck.length === 3;
            el.innerHTML = `
                ${imgHtml}
                <div class="player-info">
                    <span class="player-name">${p.name}</span>
                    <span class="player-stats">Games: ${p.stats.played} | Wins: ${p.stats.wins} | Deck: ${isDeckValid ? 'Ready' : 'Incomplete'}</span>
                </div>
                <div class="profile-actions">
                    <button class="btn btn-secondary" onclick="app.buildDeckForProfile('${p.id}')">Build Deck</button>
                    <button class="btn" onclick="ProfileManager.editProfile('${p.id}')">Edit</button>
                    <button class="btn" style="border-color: #ef4444; color: #ef4444;" onclick="ProfileManager.deleteProfile('${p.id}')">Delete</button>
                </div>
            `;
            container.appendChild(el);
        });
    }
};

const app = {
    selectedCards: new Set(),
    maxCards: 3,
    selectedPiece: null,
    p1Profile: null,
    p2Profile: null,
    editingDeckForProfileId: null,

    init() {
        ProfileManager.loadProfiles();
        ProfileManager.renderProfilesList();
        this.updatePlayerSelects();
        
        this.renderCards('index-grid', false);
        this.renderCards('deck-grid', true);
        this.updateSelectionUI();
    },
    
    updatePlayerSelects() {
        const p1Select = document.getElementById('p1-select');
        const p2Select = document.getElementById('p2-select');
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
    },

    buildDeckForProfile(profileId) {
        this.editingDeckForProfileId = profileId;
        const profile = ProfileManager.profiles.find(p => p.id === profileId);
        this.selectedCards = new Set(profile.deck || []);
        this.showScreen('deck-builder');
        this.renderCards('deck-grid', true);
        this.updateSelectionUI();
    },

    saveDeckForProfile() {
        if (!this.editingDeckForProfileId) return;
        const profile = ProfileManager.profiles.find(p => p.id === this.editingDeckForProfileId);
        if (profile) {
            profile.deck = Array.from(this.selectedCards);
            ProfileManager.saveProfiles();
            ProfileManager.renderProfilesList();
            alert(`Deck saved for ${profile.name}!`);
            this.showScreen('profiles-screen');
        }
    },

    toggleTabletopMode() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().then(() => {
                document.body.classList.add('tabletop-mode');
                if (screen.orientation && screen.orientation.lock) {
                    screen.orientation.lock('landscape').catch(e => console.warn('Orientation lock failed:', e));
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
        if (screenId !== 'deck-builder') {
            this.editingDeckForProfileId = null; // Clear context if leaving deck builder
        }
    },

    startGame(skipDraft) {
        const p1Id = document.getElementById('p1-select').value;
        const p2Id = document.getElementById('p2-select').value;
        
        if (p1Id === p2Id) {
            return alert("Please select different profiles for Player 1 and Player 2.");
        }
        
        this.p1Profile = ProfileManager.profiles.find(p => p.id === p1Id);
        this.p2Profile = ProfileManager.profiles.find(p => p.id === p2Id);
        
        // Setup Banners for the game board
        this.setupPlayerBanner('player1-banner', this.p1Profile);
        this.setupPlayerBanner('player2-banner', this.p2Profile);
        
        if (skipDraft) {
            const p1HasDeck = this.p1Profile.deck && this.p1Profile.deck.length === 3;
            const p2HasDeck = this.p2Profile.deck && this.p2Profile.deck.length === 3;
            if (!p1HasDeck || !p2HasDeck) {
                return alert("Both players must have a saved deck (3 cards) to play Campaign Mode. Go to 'Manage Profiles' to build decks.");
            }
            this.p1Deck = [...this.p1Profile.deck];
            this.p2Deck = [...this.p2Profile.deck];
            this.initGame();
        } else {
            this.p1Deck = [];
            this.p2Deck = [];
            this.draftSequence = [1, 2, 2, 1, 1, 2];
            this.currentDraftIndex = 0;
            
            this.showScreen('draft-phase');
            this.renderDraftCards();
            this.updateDraftUI();
        }
    },
    
    setupPlayerBanner(containerId, profile) {
        const container = document.getElementById(containerId);
        const imgHtml = profile.avatar ? `<img src="${profile.avatar}" class="player-avatar">` : `<div class="player-avatar" style="background:#333"></div>`;
        container.innerHTML = `
            ${imgHtml}
            <div class="player-info">
                <span class="player-name">${profile.name}</span>
                <span class="player-stats">Games: ${profile.stats.played} | Wins: ${profile.stats.wins}</span>
            </div>
        `;
    },

    renderDraftCards() {
        const container = document.getElementById('draft-grid');
        container.innerHTML = '';
        cardsData.forEach(card => {
            const cardEl = document.createElement('div');
            // FIX: All cards are unlocked in 2-player local mode
            cardEl.className = 'spell-card';
            cardEl.dataset.id = card.id;

            cardEl.innerHTML = `
                <div class="card-header">
                    <span class="card-title">${card.icon} ${card.name}</span>
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <button class="btn-info" title="More Info">ℹ️</button>
                        <span class="card-id">#${card.id}</span>
                    </div>
                </div>
                <div class="card-effect">${card.effect}</div>
            `;
            
            cardEl.querySelector('.btn-info').addEventListener('click', (e) => {
                e.stopPropagation();
                this.showInfoModal(card);
            });

            cardEl.addEventListener('click', () => this.showDraftModal(card));
            container.appendChild(cardEl);
        });
    },

    showDraftModal(card) {
        const modal = document.getElementById('card-modal');
        document.getElementById('modal-icon').textContent = card.icon;
        document.getElementById('modal-title').textContent = card.name;
        document.getElementById('modal-effect').textContent = card.effect;
        
        const playerTurn = this.draftSequence[this.currentDraftIndex];
        const content = modal.querySelector('.modal-content');
        
        if (playerTurn === 2 && document.body.classList.contains('tabletop-mode')) {
            content.classList.add('rotated-180');
        } else {
            content.classList.remove('rotated-180');
        }
        
        modal.classList.remove('hidden');
        
        const confirmBtn = document.getElementById('modal-confirm');
        const cancelBtn = document.getElementById('modal-cancel');
        
        const newConfirm = confirmBtn.cloneNode(true);
        const newCancel = cancelBtn.cloneNode(true);
        confirmBtn.replaceWith(newConfirm);
        cancelBtn.replaceWith(newCancel);
        
        newConfirm.textContent = 'Confirm Pick';
        newCancel.textContent = 'Back';
        
        newConfirm.addEventListener('click', () => {
            modal.classList.add('hidden');
            this.confirmDraftCard(card.id);
        });
        
        newCancel.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    },

    confirmDraftCard(cardId) {
        const playerTurn = this.draftSequence[this.currentDraftIndex];
        if (playerTurn === 1) {
            this.p1Deck.push(cardId);
        } else {
            this.p2Deck.push(cardId);
        }
        
        // Mark card as picked
        const cardEl = document.querySelector(`#draft-grid .spell-card[data-id="${cardId}"]`);
        if (cardEl) {
            cardEl.style.opacity = '0.3';
            cardEl.style.pointerEvents = 'none';
        }
        
        this.currentDraftIndex++;
        if (this.currentDraftIndex >= this.draftSequence.length) {
            this.initGame();
        } else {
            this.updateDraftUI();
        }
    },

    updateDraftUI() {
        const playerTurn = this.draftSequence[this.currentDraftIndex];
        const indicator = document.getElementById('draft-turn-indicator');
        const draftPhase = document.getElementById('draft-phase');
        
        const profile = playerTurn === 1 ? this.p1Profile : this.p2Profile;
        this.setupPlayerBanner('draft-turn-indicator', profile);
        
        // Add a visual cue about drafting
        indicator.innerHTML += `<div style="margin-left: auto; color: var(--accent-color); font-weight: bold;">Your Turn to Pick!</div>`;
        
        if (playerTurn === 2 && document.body.classList.contains('tabletop-mode')) {
            draftPhase.classList.add('rotated-180');
        } else {
            draftPhase.classList.remove('rotated-180');
        }
    },

    initGame() {
        engine.init();
        this.showScreen('game-board');
        this.renderInGameDeck(this.p1Deck, 'player1-cards', 'white');
        this.renderInGameDeck(this.p2Deck, 'player2-cards', 'black');
        this.renderChessboard();
    },

    renderInGameDeck(deckIds, containerId, playerColor) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        deckIds.forEach((cardId) => {
            const card = cardsData.find(c => c.id === cardId);
            const cardEl = document.createElement('div');
            cardEl.className = 'in-game-card';
            cardEl.dataset.cardId = cardId;
            cardEl.innerHTML = `
                <div class="card-icon-large">${card.icon}</div>
                <div class="card-info">
                    <div class="card-title">${card.name}</div>
                    <div class="card-effect">${card.effect}</div>
                </div>
                <button class="btn-info" title="More Info">ℹ️</button>
            `;
            
            cardEl.querySelector('.btn-info').addEventListener('click', (e) => {
                e.stopPropagation();
                this.showInfoModal(card);
            });
            
            cardEl.addEventListener('click', () => {
                if (!cardEl.classList.contains('used') && engine.turn === playerColor && !engine.targetingState) {
                    this.showCardModal(card, cardEl);
                } else if (engine.turn !== playerColor) {
                    alert("Not your turn!");
                }
            });
            container.appendChild(cardEl);
        });
    },

    showCardModal(card, cardEl, playerColor) {
        const modal = document.getElementById('card-modal');
        document.getElementById('modal-icon').textContent = card.icon;
        document.getElementById('modal-title').textContent = card.name;
        document.getElementById('modal-effect').textContent = card.effect;
        
        const content = modal.querySelector('.modal-content');
        if (playerColor === 'black' && document.body.classList.contains('tabletop-mode')) {
            content.classList.add('rotated-180');
        } else {
            content.classList.remove('rotated-180');
        }
        
        modal.classList.remove('hidden');
        
        const confirmBtn = document.getElementById('modal-confirm');
        const cancelBtn = document.getElementById('modal-cancel');
        
        // Remove old listeners
        const newConfirm = confirmBtn.cloneNode(true);
        const newCancel = cancelBtn.cloneNode(true);
        confirmBtn.replaceWith(newConfirm);
        cancelBtn.replaceWith(newCancel);
        
        newConfirm.textContent = 'Play Card';
        newCancel.textContent = 'Cancel';
        
        newConfirm.addEventListener('click', () => {
            modal.classList.add('hidden');
            engine.activateSpell(card.id, cardEl);
        });
        
        newCancel.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    },

    showInfoModal(card) {
        const modal = document.getElementById('info-modal');
        document.getElementById('info-modal-title').textContent = `${card.icon} ${card.name}`;
        document.getElementById('info-modal-effect').textContent = card.effect;
        document.getElementById('info-modal-timing').textContent = card.details.timing;
        document.getElementById('info-modal-conditions').textContent = card.details.conditions;
        document.getElementById('info-modal-inputs').textContent = card.details.inputs;
        
        modal.classList.remove('hidden');
        
        const closeBtn = document.getElementById('info-modal-close');
        const newClose = closeBtn.cloneNode(true);
        closeBtn.replaceWith(newClose);
        
        newClose.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    },

    renderChessboard() {
        const board = document.getElementById('chessboard');
        board.innerHTML = '';
        
        // Render squares
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const square = document.createElement('div');
                const isLight = (r + c) % 2 === 0;
                square.className = `square ${isLight ? 'light' : 'dark'}`;
                square.dataset.r = r;
                square.dataset.c = c;
                
                square.addEventListener('click', () => {
                    if (engine.targetingState) {
                        engine.handleSquareClick(r, c);
                    } else if (app.selectedPiece) {
                        const isValid = app.selectedPiece.validMoves.some(m => m.r === r && m.c === c);
                        if (isValid) {
                            engine.move(app.selectedPiece.r, app.selectedPiece.c, r, c);
                        }
                        app.selectedPiece = null;
                        app.renderChessboard(); // clear highlights
                    }
                });
                
                board.appendChild(square);
            }
        }

        // Render pieces
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = engine.board[r][c];
                if (p) {
                    const pieceEl = document.createElement('div');
                    pieceEl.className = `chess-piece ${engine.getColor(p)}`;
                    pieceEl.textContent = PIECE_MAP[p];
                    pieceEl.style.top = `${r * 12.5}%`;
                    pieceEl.style.left = `${c * 12.5}%`;
                    
                    if (engine.frozenPieces.some(fp => fp.r === r && fp.c === c)) {
                        pieceEl.classList.add('frozen');
                    }
                    
                    pieceEl.addEventListener('click', (e) => {
                        if (engine.targetingState) {
                            e.stopPropagation();
                            engine.handleSquareClick(r, c);
                        } else if (app.selectedPiece) {
                            const isValid = app.selectedPiece.validMoves.some(m => m.r === r && m.c === c);
                            if (isValid) {
                                e.stopPropagation();
                                engine.move(app.selectedPiece.r, app.selectedPiece.c, r, c);
                                app.selectedPiece = null;
                                app.renderChessboard();
                            }
                        }
                    });

                    if (engine.getColor(p) === engine.turn && !engine.targetingState) {
                        this.setupDrag(pieceEl, r, c);
                    }
                    board.appendChild(pieceEl);
                }
            }
        }
        this.renderGraveyards();
    },

    renderGraveyards() {
        const powerMap = { 'q': 9, 'r': 5, 'b': 3, 'n': 3, 'p': 1, 'W': 0 };
        const sortPieces = (pieces) => [...pieces].sort((a, b) => (powerMap[b.toLowerCase()] || 0) - (powerMap[a.toLowerCase()] || 0));
        
        const renderGY = (containerId, pieces) => {
            const container = document.getElementById(containerId);
            if (!container) return;
            container.innerHTML = '';
            sortPieces(pieces).forEach(p => {
                const el = document.createElement('div');
                el.className = `graveyard-piece ${engine.getColor(p)}`;
                el.textContent = PIECE_MAP[p];
                container.appendChild(el);
            });
        };
        
        renderGY('player1-graveyard', engine.capturedByWhite); // Black pieces captured by white, shown on White's side
        renderGY('player2-graveyard', engine.capturedByBlack); // White pieces captured by black, shown on Black's side
    },

    setupDrag(pieceEl, startR, startC) {
        let isDragging = false;
        let hasMoved = false;
        let lastClientX, lastClientY;
        let currentX, currentY;
        let validMoves = [];
        let highlightSquares = [];

        pieceEl.addEventListener('pointerdown', (e) => {
            if (engine.targetingState) return;
            isDragging = true;
            hasMoved = false;
            pieceEl.classList.add('dragging');
            pieceEl.setPointerCapture(e.pointerId);
            
            lastClientX = e.clientX;
            lastClientY = e.clientY;
            
            const boardWidth = document.getElementById('chessboard').offsetWidth;
            currentX = startC * (boardWidth / 8);
            currentY = startR * (boardWidth / 8);
            
            validMoves = engine.getValidMoves(startR, startC);
            const board = document.getElementById('chessboard');
            validMoves.forEach(m => {
                const sqIndex = m.r * 8 + m.c;
                const sqEl = board.children[sqIndex];
                sqEl.classList.add(m.capture ? 'valid-capture' : 'valid-move');
                highlightSquares.push(sqEl);
            });
        });

        pieceEl.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            const deltaX = e.clientX - lastClientX;
            const deltaY = e.clientY - lastClientY;
            if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) hasMoved = true;
            
            lastClientX = e.clientX;
            lastClientY = e.clientY;
            
            const isRotated = document.body.classList.contains('tabletop-mode');
            if (isRotated) {
                currentX += deltaY;
                currentY -= deltaX;
            } else {
                currentX += deltaX;
                currentY += deltaY;
            }
            
            const boardWidth = document.getElementById('chessboard').offsetWidth;
            pieceEl.style.left = `${(currentX / boardWidth) * 100}%`;
            pieceEl.style.top = `${(currentY / boardWidth) * 100}%`;
        });

        pieceEl.addEventListener('pointerup', (e) => {
            if (!isDragging) return;
            isDragging = false;
            pieceEl.classList.remove('dragging');
            pieceEl.releasePointerCapture(e.pointerId);
            
            if (!hasMoved) {
                // It was a click!
                // Clear previous selection if any
                if (this.selectedPiece) {
                    this.renderChessboard(); // re-renders to clear highlights
                }
                this.selectedPiece = {r: startR, c: startC, validMoves};
                pieceEl.style.top = `${startR * 12.5}%`;
                pieceEl.style.left = `${startC * 12.5}%`;
                return;
            }
            
            highlightSquares.forEach(sq => {
                sq.classList.remove('valid-move');
                sq.classList.remove('valid-capture');
            });
            
            const boardWidth = document.getElementById('chessboard').offsetWidth;
            const centerX = currentX + (boardWidth / 16);
            const centerY = currentY + (boardWidth / 16);
            
            const targetC = Math.floor(centerX / (boardWidth / 8));
            const targetR = Math.floor(centerY / (boardWidth / 8));
            
            const isValid = validMoves.some(m => m.r === targetR && m.c === targetC);
            
            if (isValid) {
                engine.move(startR, startC, targetR, targetC);
            } else {
                pieceEl.style.top = `${startR * 12.5}%`;
                pieceEl.style.left = `${startC * 12.5}%`;
            }
        });
    },

    renderCards(containerId, isDeckBuilder) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';

        cardsData.forEach(card => {
            const cardEl = document.createElement('div');
            const lockedClass = card.isLocked && isDeckBuilder ? 'locked' : '';
            cardEl.className = `spell-card ${lockedClass}`;
            cardEl.dataset.id = card.id;

            cardEl.innerHTML = `
                <div class="card-header">
                    <span class="card-title">${card.icon} ${card.name}</span>
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <button class="btn-info" title="More Info">ℹ️</button>
                        <span class="card-id">#${card.id}</span>
                    </div>
                </div>
                <div class="card-effect">${card.effect}</div>
                <div class="card-unlock">
                    ${card.isLocked && isDeckBuilder ? '🔒 Unlock: ' : '🔓 '}${card.unlock}
                </div>
            `;
            
            cardEl.querySelector('.btn-info').addEventListener('click', (e) => {
                e.stopPropagation();
                this.showInfoModal(card);
            });

            if (isDeckBuilder) {
                cardEl.addEventListener('click', () => this.toggleCardSelection(card.id, cardEl, card.isLocked));
            }

            container.appendChild(cardEl);
        });
    },

    toggleCardSelection(cardId, cardElement, isLocked) {
        if (isLocked) {
            alert("This card is locked! Complete the objective to unlock it.");
            return;
        }

        if (this.selectedCards.has(cardId)) {
            this.selectedCards.delete(cardId);
            cardElement.classList.remove('selected');
        } else {
            if (this.selectedCards.size >= this.maxCards) {
                alert(`You can only select up to ${this.maxCards} cards.`);
                return;
            }
            this.selectedCards.add(cardId);
            cardElement.classList.add('selected');
        }
        
        this.updateSelectionUI();
    },

    updateSelectionUI() {
        const countEl = document.getElementById('selection-count');
        countEl.textContent = `${this.selectedCards.size}/${this.maxCards} Cards Selected`;
        countEl.style.color = this.selectedCards.size === this.maxCards ? 'var(--accent-color)' : 'white';
        
        const saveBtn = document.getElementById('save-deck-btn');
        if (saveBtn) {
            if (this.editingDeckForProfileId && this.selectedCards.size === this.maxCards) {
                saveBtn.style.display = 'inline-block';
            } else {
                saveBtn.style.display = 'none';
            }
        }
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        document.body.classList.remove('tabletop-mode');
        if (screen.orientation && screen.orientation.unlock) {
            screen.orientation.unlock();
        }
    }
});
