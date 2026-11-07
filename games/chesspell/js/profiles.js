// Player profiles stored in localStorage.

// Player data (names, avatars) may come from another player: it is only ever
// written with textContent or as an image src, never as HTML.
const AVATAR_DATA_URL = /^data:image\/(png|jpeg|webp);base64,/;

function createAvatarElement(avatar) {
    if (typeof avatar === 'string' && AVATAR_DATA_URL.test(avatar)) {
        const img = document.createElement('img');
        img.src = avatar;
        img.alt = '';
        img.className = 'player-avatar';
        return img;
    }
    const placeholder = document.createElement('div');
    placeholder.className = 'player-avatar';
    return placeholder;
}

function createPlayerInfoElement(name, statsText) {
    const info = document.createElement('div');
    info.className = 'player-info';
    const nameEl = document.createElement('span');
    nameEl.className = 'player-name';
    nameEl.textContent = name;
    const statsEl = document.createElement('span');
    statsEl.className = 'player-stats';
    statsEl.textContent = statsText;
    info.append(nameEl, statsEl);
    return info;
}

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
        container.replaceChildren();
        this.profiles.forEach(p => {
            const el = document.createElement('div');
            el.className = 'profile-card';
            const isDeckValid = p.deck && p.deck.length === 3;
            const statsText = `Games: ${p.stats.played} | Wins: ${p.stats.wins} | Deck: ${isDeckValid ? 'Ready' : 'Incomplete'}`;

            const actions = document.createElement('div');
            actions.className = 'profile-actions';
            const addButton = (label, className, onClick) => {
                const btn = document.createElement('button');
                btn.className = className;
                btn.textContent = label;
                btn.addEventListener('click', onClick);
                actions.appendChild(btn);
                return btn;
            };
            addButton('Build Deck', 'btn btn-secondary', () => app.buildDeckForProfile(p.id));
            addButton('Edit', 'btn', () => ProfileManager.editProfile(p.id));
            addButton('Delete', 'btn btn-danger', () => ProfileManager.deleteProfile(p.id));

            el.append(createAvatarElement(p.avatar), createPlayerInfoElement(p.name, statsText), actions);
            container.appendChild(el);
        });
    }
};
