// @ts-check
// Profiles on screen: the Manage Profiles screen (form and list), the player lists of the
// menus, and the avatar and name blocks shown in banners.
// Player data (names, avatars) may come from another player: it is only ever written
// with textContent or as an image src, never as HTML.
import { ProfileManager } from './profiles.js';
import { buildDeckForProfile } from './deck-builder.js';
import { ask, notify } from '../../../assets/js/dialog.js';

export const AVATAR_DATA_URL = /^data:image\/(png|jpeg|webp);base64,/;

/** Size of the stored avatar, in pixels (square). */
const AVATAR_SIZE = 150;

/** The profile being edited in the form, or null when the form creates one. */
let editingProfileId = null;

export function createAvatarElement(avatar) {
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

export function createPlayerInfoElement(name, statsText) {
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

/** A player's avatar, name and record, in a banner (game board, draft). */
export function setupPlayerBanner(containerId, profile) {
    document.getElementById(containerId).replaceChildren(
        createAvatarElement(profile.avatar),
        createPlayerInfoElement(profile.name, `Games: ${profile.stats.played} | Wins: ${profile.stats.wins}`),
    );
}

/** Fill the player lists of the menus (local game, online) with the profiles. */
/**
 * Fill the player lists of the menus. Signed in, player 1 is the account (first and
 * chosen); player 2 on the same screen is always a guest profile.
 */
export function updatePlayerSelects() {
    const label = (p) => (p === ProfileManager.account ? `${p.name} (you)` : p.name);
    const options = (profiles) => profiles.map((p) => new Option(label(p), p.id));
    const p1Select = /** @type {HTMLSelectElement} */ (document.getElementById('p1-select'));
    const p2Select = /** @type {HTMLSelectElement} */ (document.getElementById('p2-select'));
    p1Select.replaceChildren(...options(ProfileManager.all()));
    p2Select.replaceChildren(...options(ProfileManager.profiles));
    const guests = ProfileManager.profiles;
    if (!ProfileManager.account && guests.length > 1) p2Select.value = guests[1].id;
    document.getElementById('online-p1-select')?.replaceChildren(...options(ProfileManager.all()));
}

export function renderProfilesList() {
    const container = document.getElementById('profiles-list');
    container.replaceChildren(...ProfileManager.profiles.map((p) => {
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
        };
        addButton('Build Deck', 'btn btn-secondary', () => buildDeckForProfile(p.id));
        addButton('Edit', 'btn', () => editProfile(p.id));
        addButton('Delete', 'btn btn-danger', () => deleteProfile(p.id));

        el.append(createAvatarElement(p.avatar), createPlayerInfoElement(p.name, statsText), actions);
        return el;
    }));
}

/** The chosen image, cropped to a centred square and stored as a small JPEG. */
function readAvatar(file, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = AVATAR_SIZE;
            canvas.height = AVATAR_SIZE;
            const size = Math.min(img.width, img.height);
            const sx = (img.width - size) / 2;
            const sy = (img.height - size) / 2;
            canvas.getContext('2d').drawImage(img, sx, sy, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
            callback(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.src = /** @type {string} */ (e.target.result); // readAsDataURL gives a string
    };
    reader.readAsDataURL(file);
}

/** The form's button: create a profile, or save the one being edited. */
export function submitProfile() {
    const nameInput = /** @type {HTMLInputElement} */ (document.getElementById('new-profile-name'));
    const fileInput = /** @type {HTMLInputElement} */ (document.getElementById('new-profile-avatar'));
    const name = nameInput.value.trim();
    if (!name) return void notify("Please enter a username.");

    const save = (avatar) => {
        if (editingProfileId) {
            ProfileManager.updateProfile(editingProfileId, name, avatar);
            cancelEdit();
        } else {
            ProfileManager.addProfile(name, avatar || '');
            nameInput.value = '';
            fileInput.value = '';
        }
    };
    if (fileInput.files && fileInput.files[0]) readAvatar(fileInput.files[0], save);
    else save(null);
}

export function editProfile(id) {
    const p = ProfileManager.find(id);
    if (!p) return;
    editingProfileId = id;
    /** @type {HTMLInputElement} */ (document.getElementById('new-profile-name')).value = p.name;
    document.getElementById('profile-form-title').textContent = "Edit Profile";
    document.getElementById('profile-submit-btn').textContent = "Save Changes";
    document.getElementById('profile-cancel-btn').style.display = 'inline-block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function cancelEdit() {
    editingProfileId = null;
    /** @type {HTMLInputElement} */ (document.getElementById('new-profile-name')).value = '';
    /** @type {HTMLInputElement} */ (document.getElementById('new-profile-avatar')).value = '';
    document.getElementById('profile-form-title').textContent = "Create New Profile";
    document.getElementById('profile-submit-btn').textContent = "Create";
    document.getElementById('profile-cancel-btn').style.display = 'none';
}

async function deleteProfile(id) {
    if (await ask('Are you sure you want to delete this profile?', { confirm: 'Delete' })) ProfileManager.deleteProfile(id);
}
