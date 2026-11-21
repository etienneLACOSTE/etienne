// @ts-check
// Gérard Mallet, commissioner of the Chessdown League: a pixel-art bust (56 x 56 pixels on
// a canvas, scaled up by CSS) who breathes, blinks and moves his lips while he talks, and
// his speech bubble (typewriter text, read once by screen readers). His scarf wears the
// colours the page gives him. Used by the club's creation (club-onboarding.js), and later
// by the career's lessons.

const W = 56;
const H = 56;
const C = {
    skin: '#e8b48c', skinShade: '#c98e66', skinDeep: '#a8704e', hair: '#9b9b9b', hairDark: '#6d6d6d', hairLight: '#cfcfcf',
    eye: '#161616', brow: '#5c5c5c', stache: '#808080', stacheDark: '#5e5e5e', mouth: '#5a2421', tongue: '#b5524b',
    suit: '#1f2a3a', suitShade: '#141c27', suitLight: '#2d3c52', shirt: '#f3f3f3', tie: '#7a1f1f', ink: '#000000',
};
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * @param {{ canvas: HTMLCanvasElement, typed: HTMLElement, said: HTMLElement, bubble: HTMLElement,
 *   scarf: () => [string, string] }} parts typed: the visible text (aria-hidden); said: a
 *   status region that gets the whole line at once; scarf: the two colours of his scarf
 */
export function createCommissioner({ canvas, typed, said, bubble, scarf }) {
    const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    /** @type {(string | null)[][]} */
    let buf = [];
    let speaking = false;
    let typingTimer = 0;
    let fullText = '';
    /** @type {(() => void) | null} */
    let onDone = null;
    let running = false;
    let lastFrame = -1;

    const px = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) buf[y][x] = c; };
    const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c); };
    const ellipse = (cx, cy, rx, ry, c, test = null) => {
        for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
            for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
                if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 && (!test || test(x, y))) px(x, y, c);
            }
        }
    };

    function draw(time) {
        buf = Array.from({ length: H }, () => Array(W).fill(null));
        const still = reducedMotion();
        const breath = still ? 0 : Math.floor(time / 900) % 2; // Shoulders rise by one pixel
        const blink = !still && time % 3400 < 140;
        const talking = speaking && !still && Math.floor(time / 110) % 2 === 0;
        const [sA, sB] = scarf();

        // Shoulders and jacket
        ellipse(28, 60 - breath, 25, 17, C.suit);
        ellipse(36, 61 - breath, 14, 13, C.suitShade, (x) => x > 34);
        rect(9, 52 - breath, 4, 4, C.suitLight);
        // Neck, shirt collar and tie
        rect(23, 33, 10, 10 - breath, C.skin);
        rect(29, 33, 4, 10 - breath, C.skinShade);
        for (let i = 0; i < 8; i++) rect(22 + i, 43 - breath + i, 12 - 2 * i, 1, C.shirt);
        rect(27, 45 - breath, 3, 9, C.tie);
        // His scarf in the club's colours: a band round the neck, two ends hanging
        for (let x = 18; x <= 38; x++) for (let y = 40 - breath; y <= 43 - breath; y++) px(x, y, Math.floor(x / 2) % 2 ? sA : sB);
        for (const [x0, len] of [[18, 13], [34, 11]]) {
            for (let y = 44 - breath; y < 44 - breath + len; y++) for (let x = x0; x < x0 + 4; x++) px(x, y, Math.floor(y / 2) % 2 ? sA : sB);
        }
        // Ears and head
        ellipse(16.5, 23, 2.2, 3.2, C.skinShade);
        ellipse(39.5, 23, 2.2, 3.2, C.skinShade);
        ellipse(28, 21, 11, 13.2, C.skin);
        ellipse(33, 24, 6.5, 10, C.skinShade, (x, y) => x >= 34 && y > 14);
        rect(21, 32, 14, 1, C.skinShade);
        // Hair: receding, grey at the temples, a few strands on top
        ellipse(28, 10.5, 9.5, 4, C.hair, (x, y) => y <= 11 && (x < 22 || x > 33 || y <= 8));
        rect(16, 11, 3, 10, C.hair); rect(37, 11, 3, 10, C.hair);
        rect(17, 12, 1, 6, C.hairLight); rect(38, 12, 1, 6, C.hairDark);
        for (const x of [24, 27, 30, 33]) px(x, 8, C.hairLight);
        rect(22, 7, 12, 1, C.hair);
        // Lines of a man of fifty: forehead, crow's feet
        rect(23, 13, 10, 1, C.skinShade); rect(24, 15, 8, 1, C.skinShade);
        px(19, 21, C.skinShade); px(19, 22, C.skinShade); px(37, 21, C.skinDeep); px(37, 22, C.skinDeep);
        // Bushy eyebrows, eyes (closed when he blinks)
        rect(20, 17, 5, 2, C.brow); rect(31, 17, 5, 2, C.brow);
        px(20, 16, C.hairDark); px(35, 16, C.hairDark);
        if (blink) {
            rect(21, 21, 4, 1, C.eye); rect(31, 21, 4, 1, C.eye);
        } else {
            rect(21, 20, 4, 2, C.shirt); rect(31, 20, 4, 2, C.shirt);
            rect(22, 20, 2, 2, C.eye); rect(32, 20, 2, 2, C.eye);
            rect(21, 22, 4, 1, C.skinShade); rect(31, 22, 4, 1, C.skinShade);
        }
        // Nose, moustache, mouth (open while he talks)
        rect(27, 21, 2, 5, C.skinShade); rect(26, 25, 4, 1, C.skinDeep);
        rect(23, 27, 10, 2, C.stache); rect(23, 28, 2, 1, C.stacheDark); rect(31, 28, 2, 1, C.stacheDark);
        if (talking) { rect(25, 29, 6, 3, C.mouth); rect(26, 31, 4, 1, C.tongue); } else rect(25, 29, 6, 1, C.mouth);
        rect(24, 33, 8, 1, C.skinShade);

        // An ink outline round every drawn pixel
        g.clearRect(0, 0, W, H);
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                let c = buf[y][x];
                if (!c && ((buf[y - 1] && buf[y - 1][x]) || (buf[y + 1] && buf[y + 1][x]) || buf[y][x - 1] || buf[y][x + 1])) c = C.ink;
                if (c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); }
            }
        }
    }

    function loop(time) {
        if (!running) return;
        const frame = Math.floor(time / 55);
        if (frame !== lastFrame && !document.hidden) { lastFrame = frame; draw(time); }
        requestAnimationFrame(loop);
    }

    function finish() {
        clearInterval(typingTimer);
        speaking = false;
        typed.textContent = fullText;
        if (onDone) { const done = onDone; onDone = null; done(); }
    }
    const skip = () => { if (speaking) finish(); };
    bubble.addEventListener('click', skip);
    bubble.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); skip(); }
    });

    return {
        /** Start drawing him (when his screen shows). */
        start() {
            if (running) return;
            running = true;
            requestAnimationFrame(loop);
        },
        /** Stop drawing him (his screen is left). */
        stop() {
            running = false;
            clearInterval(typingTimer);
            speaking = false;
        },
        /** He says `text` (typed out); `done` runs once it is all shown. */
        say(text, done = null) {
            clearInterval(typingTimer);
            fullText = text;
            onDone = done;
            said.textContent = text;
            if (reducedMotion()) { typed.textContent = text; finish(); return; }
            speaking = true;
            typed.textContent = '';
            let i = 0;
            typingTimer = window.setInterval(() => {
                i += 1;
                typed.textContent = text.slice(0, i);
                if (i >= text.length) finish();
            }, 24);
        },
        /** Redraw now (e.g. his scarf changed colours). */
        redraw() { draw(performance.now()); },
    };
}
