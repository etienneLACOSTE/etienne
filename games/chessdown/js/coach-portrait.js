// @ts-check
// The rival coaches' portraits (career-coaches.js): a 32 x 32 pixel-art bust drawn from the
// coach's look (skin, hair and cut, beard, glasses, hat, top, one detail), on the turf, with
// an ink outline. They blink, each at its own moment (not with reduced motion).

const S = 32;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A colour darker or lighter by `f` (0.8: 20 % darker). */
function shade(hex, f) {
    return '#' + [1, 3, 5].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * f))).toString(16).padStart(2, '0')).join('');
}

/**
 * Draw `look` on `canvas` (32 x 32, scaled up by CSS) at time `now` (ms).
 * @param {HTMLCanvasElement} canvas
 * @param {import('../career-coaches.js').COACHES[number]['look']} look
 */
export function drawCoach(canvas, look, now = 0) {
    const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    /** @type {(string | null)[][]} */
    const buf = Array.from({ length: S }, () => Array(S).fill(null));
    const px = (x, y, c) => { if (x >= 0 && y >= 0 && x < S && y < S) buf[y][x] = c; };
    const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c); };
    const ell = (cx, cy, rx, ry, c, test = null) => {
        for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
            for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
                if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 && (!test || test(x, y))) px(x, y, c);
            }
        }
    };
    const blink = !reducedMotion() && (now + look.skin.charCodeAt(2) * 97) % 3800 < 150;
    const sk = look.skin, skS = shade(sk, 0.85), hr = look.hair;

    if (look.cut === 'long') rect(7, 8, 18, 22, hr); // Hair falling behind the shoulders
    ell(16, 35, 15, 10, look.top);
    ell(21, 36, 8, 8, shade(look.top, 0.8), (x) => x > 20);
    rect(13, 20, 6, 6, sk);
    rect(16, 20, 3, 6, skS);
    if (look.extra === 'tie') rect(15, 26, 2, 6, '#7a1f1f');
    if (look.extra === 'pearls') for (let x = 11; x <= 21; x += 2) px(x, x === 11 || x === 21 ? 25 : 26, '#f4f4f4');
    if (look.extra === 'whistle') { rect(14, 26, 1, 4, '#d0d0d0'); rect(13, 30, 3, 2, '#c0c0c0'); }
    if (look.extra === 'scarf') { rect(10, 24, 12, 3, '#f4f4f4'); rect(18, 27, 3, 5, '#f4f4f4'); }
    // Ears and head
    ell(9.5, 14, 1.5, 2.2, skS);
    ell(22.5, 14, 1.5, 2.2, skS);
    ell(16, 13, 6.5, 8, sk);
    ell(19, 15, 3.5, 6, skS, (x, y) => x >= 20 && y > 9);
    // Hair
    if (look.cut === 'short') { ell(16, 7, 6.5, 3, hr, (x, y) => y <= 7); rect(9, 7, 2, 4, hr); rect(21, 7, 2, 4, hr); }
    if (look.cut === 'bald') { rect(9, 9, 2, 5, hr); rect(21, 9, 2, 5, hr); }
    if (look.cut === 'bun') { ell(16, 6.5, 7, 3.5, hr, (x, y) => y <= 7); rect(9, 7, 2, 6, hr); rect(21, 7, 2, 6, hr); ell(16, 2.5, 3, 2.5, hr); px(15, 2, shade(hr, 1.15)); }
    if (look.cut === 'long') { ell(16, 6.5, 7.5, 3.5, hr, (x, y) => y <= 8); rect(8, 7, 3, 14, hr); rect(21, 7, 3, 14, hr); rect(10, 7, 6, 2, hr); }
    if (look.cut === 'curly') for (const [x, y] of [[10, 6], [13, 4], [16, 4], [19, 4], [22, 6], [9, 9], [23, 9], [11, 5], [21, 5]]) ell(x, y, 2, 2, hr);
    if (look.hat === 'beret') { ell(16, 5, 8, 2.6, look.hatColor); px(16, 2, look.hatColor); }
    if (look.hat === 'cap') { ell(16, 6, 7.2, 3, look.hatColor, (x, y) => y <= 7); rect(16, 7, 9, 2, shade(look.hatColor, 0.75)); rect(14, 4, 4, 2, '#ffffff'); }
    // Brows, eyes, glasses, nose
    rect(11, 10, 3, 1, shade(hr, 0.8));
    rect(18, 10, 3, 1, shade(hr, 0.8));
    if (blink) { rect(11, 12, 3, 1, '#161616'); rect(18, 12, 3, 1, '#161616'); }
    else { rect(11, 12, 3, 2, '#ffffff'); rect(18, 12, 3, 2, '#ffffff'); rect(12, 12, 1, 2, '#161616'); rect(19, 12, 1, 2, '#161616'); }
    if (look.glasses === 'round') {
        for (const cx of [12, 19]) { px(cx - 2, 12, '#222'); px(cx + 2, 12, '#222'); px(cx - 1, 11, '#222'); px(cx + 1, 11, '#222'); px(cx - 1, 14, '#222'); px(cx + 1, 14, '#222'); }
        rect(14, 12, 3, 1, '#222');
    }
    if (look.glasses === 'square') {
        rect(10, 11, 5, 1, '#222'); rect(17, 11, 5, 1, '#222'); rect(10, 14, 5, 1, '#222'); rect(17, 14, 5, 1, '#222');
        px(10, 12, '#222'); px(10, 13, '#222'); px(21, 12, '#222'); px(21, 13, '#222'); rect(15, 12, 2, 1, '#222');
    }
    rect(15, 13, 2, 3, skS);
    // Beard and mouth
    if (look.beard === 'stache') rect(12, 17, 8, 2, hr);
    if (look.beard === 'stubble') {
        for (let y = 16; y <= 20; y++) for (let x = 11; x <= 21; x++) if ((x + y) % 2 === 0 && ((x - 16) / 6) ** 2 + ((y - 13) / 8) ** 2 <= 1) px(x, y, shade(sk, 0.62));
    }
    if (look.beard === 'goatee') { rect(13, 17, 6, 1, hr); rect(15, 19, 3, 3, hr); }
    if (look.beard === 'full') ell(16, 18, 6, 4, hr, (x, y) => y >= 16);
    rect(14, 18, 4, 1, look.extra === 'lips' ? '#b0203a' : '#6a2a24');
    if (look.extra === 'lips') rect(14, 17, 4, 1, '#c8304a');

    // Ink outline round the bust, then the turf behind it
    const out = buf.map((row) => row.slice());
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        if (buf[y][x]) continue;
        if ((buf[y - 1] && buf[y - 1][x]) || (buf[y + 1] && buf[y + 1][x]) || buf[y][x - 1] || buf[y][x + 1]) out[y][x] = '#000000';
    }
    g.fillStyle = '#0B6E3F';
    g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const c = out[y][x];
        if (c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); }
    }
}
