// @ts-check
// Gérard's tour of the career (docs/games/chessdown-career.md): Gérard, big on the screen,
// walks the coach through the game and its menus. The screen is dimmed but for what he
// speaks of; when he asks for a click (a place on the map), only that is open, and the
// click really opens it: the coach learns the menus by using them. It opens by itself the
// first time the career is opened (remembered in this browser), and again from the "Tour
// with Gérard" button. career-view.js gives it the screen it works on.
import { t } from '../../../assets/js/i18n.js';

const SEEN = 'pawnet.chessdown.tourSeen';
const PAD = 6; // Room around what is shown

/**
 * The steps. `target`: what is shown (a selector; none: the whole screen dimmed). `click`:
 * Gérard asks for a click on it, and the tour goes on once `ready` is true (the card of the
 * place reached). A step whose target is missing is left out.
 * @typedef {{ id: string, target?: string, click?: boolean, ready?: () => boolean }} Step
 */
/** @type {Step[]} */
const STEPS = [
    { id: 'welcome' },
    { id: 'game' },
    { id: 'club', target: '#career-gerard' },
    { id: 'home', target: '.career-marker[data-place="home"]', click: true, ready: () => cardIs('home') },
    { id: 'homeCard', target: '#career-card' },
    { id: 'stadium', target: '.career-marker.main', click: true, ready: () => cardIs('main') },
    { id: 'matchCard', target: '#career-card' },
    { id: 'quest', target: '.career-marker.side, .career-marker.boss', click: true, ready: () => cardIs('side') },
    { id: 'questCard', target: '#career-card' },
    { id: 'date', target: '#career-date' },
    { id: 'transport', target: '.career-marker.transport' },
    { id: 'clubMenu', target: '#career-back' },
    { id: 'end', target: '#career-tour-btn' },
];

const cardIs = (kind) => Boolean(document.querySelector(`#career-card.${kind}`));

/** The tour was seen in this browser (it then opens only from its button). */
export function tourSeen() {
    try { return localStorage.getItem(SEEN) === '1'; } catch { return true; }
}

/**
 * Start the tour on the career's screen.
 * @param {{ screen: HTMLElement, portrait: HTMLCanvasElement, done: () => void }} ui
 *   screen: the career's screen; portrait: Gérard's canvas (copied in big); done: it ended
 * @returns {{ stop: () => void }}
 */
export function startTour({ screen, portrait, done }) {
    const steps = STEPS.filter((s) => !s.target || document.querySelector(s.target));
    let step = 0;
    let waiting = false; // A click was made: the tour waits for its result (`ready`)
    let running = true;
    let frame = 0;

    const root = document.createElement('div');
    root.className = 'tour';
    root.innerHTML = `
        <div class="tour-block" data-side="top"></div><div class="tour-block" data-side="bottom"></div>
        <div class="tour-block" data-side="left"></div><div class="tour-block" data-side="right"></div>
        <div class="tour-hole" aria-hidden="true"></div>
        <section class="tour-panel" role="dialog" aria-modal="false" aria-labelledby="tour-title" aria-describedby="tour-text">
          <canvas class="tour-gerard" width="56" height="56" aria-hidden="true"></canvas>
          <div class="tour-bubble">
            <h2 class="tour-speaker" id="tour-title"></h2>
            <p class="tour-text" id="tour-text" aria-live="polite"></p>
            <p class="tour-do" id="tour-do"></p>
            <div class="tour-actions">
              <button type="button" class="btn-primary" data-tour="next"></button>
              <button type="button" class="btn-ghost" data-tour="skip"></button>
            </div>
          </div>
        </section>`;
    screen.appendChild(root);
    const $ = (sel) => /** @type {HTMLElement} */ (root.querySelector(sel));
    const blocks = /** @type {HTMLElement[]} */ ([...root.querySelectorAll('.tour-block')]);
    const hole = $('.tour-hole');
    const panel = $('.tour-panel');
    const next = /** @type {HTMLButtonElement} */ ($('[data-tour="next"]'));
    const skip = /** @type {HTMLButtonElement} */ ($('[data-tour="skip"]'));
    const big = /** @type {HTMLCanvasElement} */ ($('.tour-gerard'));
    const bigG = /** @type {CanvasRenderingContext2D} */ (big.getContext('2d'));
    bigG.imageSmoothingEnabled = false;
    skip.textContent = t('tour.skip');

    const target = () => {
        const s = steps[step];
        return s && s.target ? /** @type {HTMLElement | null} */ (document.querySelector(s.target)) : null;
    };

    /** Dim all but the target (four blocks around a hole), Gérard's panel away from it. */
    function layout() {
        const el = target();
        const vw = innerWidth, vh = innerHeight;
        if (!el) {
            root.classList.add('no-target');
            Object.assign(blocks[0].style, { left: '0px', top: '0px', width: `${vw}px`, height: `${vh}px` });
            for (const b of blocks.slice(1)) b.style.width = '0px';
            hole.style.display = 'none';
            panel.dataset.at = 'middle';
            return;
        }
        root.classList.remove('no-target');
        const r = el.getBoundingClientRect();
        const x = Math.max(0, r.left - PAD), y = Math.max(0, r.top - PAD);
        const w = Math.min(vw - x, r.width + 2 * PAD), h = Math.min(vh - y, r.height + 2 * PAD);
        Object.assign(hole.style, { display: 'block', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
        Object.assign(blocks[0].style, { left: '0px', top: '0px', width: `${vw}px`, height: `${y}px` });
        Object.assign(blocks[1].style, { left: '0px', top: `${y + h}px`, width: `${vw}px`, height: `${Math.max(0, vh - y - h)}px` });
        Object.assign(blocks[2].style, { left: '0px', top: `${y}px`, width: `${x}px`, height: `${h}px` });
        Object.assign(blocks[3].style, { left: `${x + w}px`, top: `${y}px`, width: `${Math.max(0, vw - x - w)}px`, height: `${h}px` });
        // Gérard away from what he shows: below it if it is in the top half, above otherwise
        panel.dataset.at = r.top + r.height / 2 < vh / 2 ? 'bottom' : 'top';
    }

    function loop() {
        if (!running) return;
        layout();
        bigG.clearRect(0, 0, 56, 56);
        bigG.drawImage(portrait, 0, 0); // Gérard as drawn beside his bubble (he blinks, he talks)
        if (waiting && steps[step].ready && steps[step].ready()) { waiting = false; go(step + 1); }
        frame = requestAnimationFrame(loop);
    }

    /** The target was clicked (it really opens what it opens): wait for it, then go on. */
    const onTargetClick = () => {
        if (!steps[step].click) return;
        waiting = true;
        $('#tour-do').textContent = t('tour.wait');
    };

    function show() {
        const s = steps[step];
        const last = step === steps.length - 1;
        $('#tour-title').textContent = t('tour.speaker', { n: step + 1, total: steps.length });
        $('#tour-text').textContent = t(`tour.${s.id}.text`);
        $('#tour-do').textContent = s.click ? t(`tour.${s.id}.do`) : '';
        next.hidden = Boolean(s.click);
        next.textContent = t(last ? 'tour.done' : 'tour.next');
        layout();
        const el = target();
        if (s.click && el) {
            el.addEventListener('click', onTargetClick, { once: true });
            el.focus();
        } else {
            next.focus();
        }
    }

    function go(index) {
        const before = target();
        before?.removeEventListener('click', onTargetClick);
        if (index >= steps.length) return end();
        step = index;
        show();
    }

    function end() {
        stop();
        try { localStorage.setItem(SEEN, '1'); } catch { /* Not kept: it opens again next time */ }
        done();
    }

    function stop() {
        if (!running) return;
        running = false;
        cancelAnimationFrame(frame);
        target()?.removeEventListener('click', onTargetClick);
        document.removeEventListener('keydown', onKey, true);
        root.remove();
    }

    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); end(); } };
    next.addEventListener('click', () => go(step + 1));
    skip.addEventListener('click', end);
    document.addEventListener('keydown', onKey, true);
    show();
    frame = requestAnimationFrame(loop);
    return { stop };
}
