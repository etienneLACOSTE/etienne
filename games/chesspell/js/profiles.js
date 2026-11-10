// @ts-check
// Player profiles: data only. The signed-in player's account is a profile of its own
// (deck saved on the server, /api/account); guest profiles are kept in localStorage, for
// playing without an account and for player 2 on the same screen. Every change
// announces `profilesChanged`; the profile screen and the player lists
// (profiles-view.js) redraw themselves on it.
import { emit } from './events.js';
import { api } from '../../../assets/js/session.js';

const STORAGE_KEY = 'spellChessProfiles';
/** The account's profile id (guest ids are 'guest1', 'p_<time>'...). */
export const ACCOUNT_ID = 'account';

/** Both guests, on a first visit. */
const GUESTS = [
    { id: 'guest1', name: 'Guest 1', avatar: '', stats: { played: 0, wins: 0 }, deck: [] },
    { id: 'guest2', name: 'Guest 2', avatar: '', stats: { played: 0, wins: 0 }, deck: [] },
];

/** @typedef {{ id: string, name: string, avatar: string, stats: { played: number, wins: number }, deck: number[] }} Profile */

/** Send JSON to the account API; throws its error message (in words, also offline). */
const accountApi = api;

export const ProfileManager = {
    /** Guest profiles, on this device. @type {Profile[]} */
    profiles: [],
    /** The signed-in player's profile, or null. @type {Profile | null} */
    account: null,

    /** The account first (when signed in), then the guests. */
    all() {
        return this.account ? [this.account, ...this.profiles] : [...this.profiles];
    },

    /** Signed in: the account becomes a profile, with its picture and saved deck. */
    async loadAccount(user) {
        // The account and its deck are needed; the stats only fill the profile's counters.
        const [{ account }, { deck }, stats] = await Promise.all([
            accountApi('GET', '/api/account'),
            accountApi('GET', '/api/account/decks/chesspell'),
            accountApi('GET', '/api/account/stats').catch(() => null),
        ]);
        const results = stats ? Object.values(stats.games.chesspell.modes) : [];
        this.account = {
            id: ACCOUNT_ID, name: user.username, avatar: account.avatar || '',
            stats: {
                played: results.reduce((n, m) => n + m.wins + m.losses + m.draws, 0),
                wins: results.reduce((n, m) => n + m.wins, 0),
            },
            deck: deck || [],
        };
        emit('profilesChanged');
    },

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
        return this.all().find((p) => p.id === id);
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

    /**
     * Save a profile's deck: on the server for the account, on this device for a guest.
     * @param {string} id @param {Iterable<number>} deck
     */
    async saveDeck(id, deck) {
        deck = [...deck]; // A copy: what is saved does not change while it is on its way
        const p = this.find(id);
        if (!p) return null;
        if (p === this.account) {
            await accountApi('PUT', '/api/account/decks/chesspell', { deck: [...deck] });
            p.deck = [...deck];
            emit('profilesChanged');
            return p;
        }
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
