// Player profiles stored in localStorage.

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
