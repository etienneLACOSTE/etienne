// @ts-check
// Player profiles: data only, kept in localStorage. Saving announces `profilesChanged`;
// the profile screen and the player lists (profiles-view.js) redraw themselves on it.
import { emit } from './events.js';

const STORAGE_KEY = 'spellChessProfiles';

/** Both guests, on a first visit. */
const GUESTS = [
    { id: 'guest1', name: 'Guest 1', avatar: '', stats: { played: 0, wins: 0 }, deck: [] },
    { id: 'guest2', name: 'Guest 2', avatar: '', stats: { played: 0, wins: 0 }, deck: [] },
];

export const ProfileManager = {
    /** @type {{ id: string, name: string, avatar: string, stats: { played: number, wins: number }, deck: number[] }[]} */
    profiles: [],

    loadProfiles() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            this.profiles = JSON.parse(stored);
            this.profiles.forEach(p => { if (!p.deck) p.deck = []; }); // Old profiles had no deck
        } else {
            this.profiles = GUESTS.map((p) => ({ ...p, stats: { ...p.stats }, deck: [] }));
            this.saveProfiles();
        }
    },

    saveProfiles() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profiles));
        emit('profilesChanged');
    },

    find(id) {
        return this.profiles.find((p) => p.id === id);
    },

    addProfile(name, avatar) {
        this.profiles.push({ id: 'p_' + Date.now(), name, avatar, stats: { played: 0, wins: 0 }, deck: [] });
        this.saveProfiles();
    },

    /** A new name, and a new avatar when one is given. */
    updateProfile(id, name, avatar) {
        const p = this.find(id);
        if (!p) return;
        p.name = name;
        if (avatar) p.avatar = avatar;
        this.saveProfiles();
    },

    deleteProfile(id) {
        this.profiles = this.profiles.filter((p) => p.id !== id);
        this.saveProfiles();
    },

    saveDeck(id, deck) {
        const p = this.find(id);
        if (!p) return null;
        p.deck = [...deck];
        this.saveProfiles();
        return p;
    },

    /**
     * A finished game counts in the players' own profiles (not the bot's, not the
     * opponent's online, which are not in this list).
     * @param {[string, any][]} players [color, profile] pairs
     * @param {string} winner 'white' or 'black'
     */
    recordResult(players, winner) {
        const mine = players.filter(([, profile]) => this.profiles.includes(profile));
        for (const [color, profile] of mine) {
            profile.stats.played++;
            if (color === winner) profile.stats.wins++;
        }
        if (mine.length) this.saveProfiles();
    },
};
