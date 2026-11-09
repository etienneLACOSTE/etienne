// @ts-check
// Screens: one is shown at a time. Showing one announces `screenShown`, so the screens
// that fill themselves when opened (player select, deck builder) and the focus
// (a11y.js) follow without this file knowing them.
import { emit } from './events.js';

export function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    const screen = document.getElementById(screenId);
    screen.classList.add('active');
    emit('screenShown', { screenId, screen });
}

/** Tabletop mode: full screen, landscape, the black side turned to face its player. */
export function toggleTabletopMode() {
    if (document.fullscreenElement) {
        document.exitFullscreen?.();
        return;
    }
    document.documentElement.requestFullscreen().then(() => {
        document.body.classList.add('tabletop-mode');
        const orientation = /** @type {any} */ (screen.orientation); // lock() is not in every browser
        if (orientation && orientation.lock) {
            orientation.lock('landscape').catch(e => console.warn('Orientation lock failed:', e));
        }
    }).catch(err => {
        alert(`Error attempting to enable fullscreen: ${err.message}`);
    });
}

/** Leaving full screen ends tabletop mode. */
export function watchFullscreenExit() {
    document.addEventListener('fullscreenchange', () => {
        if (document.fullscreenElement) return;
        document.body.classList.remove('tabletop-mode');
        if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
    });
}
