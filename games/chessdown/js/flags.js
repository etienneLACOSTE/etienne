// @ts-check
// Pixel-art flags of the page's languages (the main menu's language button, js/language-menu.js):
// small SVG grids drawn square by square, crisp at any size. Decorative: the language's name is
// always written beside them. Their colours are the flags' own.

const W = 15;
const H = 9;

/** The colour of each square of a flag, row by row. @type {Record<string, (x: number, y: number) => string>} */
const FLAGS = {
    fr: (x) => (x < 5 ? '#0055a4' : x < 10 ? '#ffffff' : '#ef4135'),
    it: (x) => (x < 5 ? '#009246' : x < 10 ? '#ffffff' : '#ce2b37'),
    de: (x, y) => (y < 3 ? '#000000' : y < 6 ? '#dd0000' : '#ffce00'),
    es: (x, y) => (y < 2 || y > 6 ? '#aa151b' : '#f1bf00'),
    // The Union Jack: white diagonals over blue, the red cross edged with white
    en: (x, y) => {
        const cx = (W - 1) / 2, cy = (H - 1) / 2;
        if (Math.abs(x - cx) < 1 || Math.abs(y - cy) < 1) return '#c8102e';
        if (Math.abs(x - cx) < 2 || Math.abs(y - cy) < 2) return '#ffffff';
        const d1 = Math.abs(y * (W - 1) - x * (H - 1)) / (W - 1);
        const d2 = Math.abs(y * (W - 1) - (W - 1 - x) * (H - 1)) / (W - 1);
        if (d1 < 0.4 || d2 < 0.4) return '#c8102e';
        if (d1 < 0.9 || d2 < 0.9) return '#ffffff';
        return '#012169';
    },
};

/** A language's flag, as SVG (decorative). @param {string} code a language of LANGUAGES */
export function flagSVG(code) {
    const colour = FLAGS[code] || FLAGS.en;
    let squares = '';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) squares += `<rect x="${x}" y="${y}" width="1" height="1" fill="${colour(x, y)}"/>`;
    return `<svg class="pixel-flag" viewBox="-0.5 -0.5 ${W + 1} ${H + 1}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">
        <rect x="-0.5" y="-0.5" width="${W + 1}" height="${H + 1}" fill="#000000"/>${squares}</svg>`;
}
