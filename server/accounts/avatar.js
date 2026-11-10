// @ts-check
// Pictures sent by players and shown to other players: the account picture, and the
// picture of a Ches'spell guest profile. Only what the pages make is accepted: a base64
// data URL of a JPEG, PNG or WebP image of 28 KB at most, whose bytes really are that
// kind of image, of 512 x 512 pixels at most (the pages make 150 x 150). A tiny file
// can declare a huge image, which would take a lot of memory to show: refused.

const MAX_BYTES = 28_000; // As a data URL, under the 40 KB the game servers accept
const MAX_SIDE = 512;
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

/** The first bytes of each format. */
const SIGNATURES = {
    jpeg: (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF,
    png: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])),
    webp: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};

/** JPEG: the size is in the frame header (a SOFn marker), after other segments. */
function jpegSize(b) {
    let i = 2;
    while (i + 9 < b.length) {
        if (b[i] !== 0xFF) return null;
        const marker = b[i + 1];
        if (marker === 0xFF) { i++; continue; } // Fill byte
        if (marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD7) || marker === 0x01) { i += 2; continue; }
        const isFrame = marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC;
        if (isFrame) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
        if (marker === 0xD9 || marker === 0xDA) return null; // End, or image data before any frame header
        i += 2 + b.readUInt16BE(i + 2);
    }
    return null;
}

/** WebP: lossy (VP8), lossless (VP8L) or extended (VP8X) header. */
function webpSize(b) {
    if (b.length < 30) return null;
    const chunk = b.subarray(12, 16).toString('latin1');
    if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3FFF, height: b.readUInt16LE(28) & 0x3FFF };
    if (chunk === 'VP8L') {
        const bits = b.readUInt32LE(21);
        return { width: (bits & 0x3FFF) + 1, height: ((bits >>> 14) & 0x3FFF) + 1 };
    }
    if (chunk === 'VP8X') return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
    return null;
}

/** The size the image declares, in pixels, or null if it cannot be read. */
const SIZES = {
    png: (b) => (b.length >= 24 ? { width: b.readUInt32BE(16), height: b.readUInt32BE(20) } : null),
    jpeg: jpegSize,
    webp: webpSize,
};

/** @returns {string | null} what is wrong with the picture, or null */
function avatarProblem(dataUrl) {
    if (typeof dataUrl !== 'string' || dataUrl.length > 40_000) return 'The picture is too large.';
    const match = DATA_URL.exec(dataUrl);
    if (!match) return 'Send a JPEG, PNG or WebP picture.';
    const [, type, base64] = match;
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.toString('base64') !== base64) return 'Send a JPEG, PNG or WebP picture.';
    if (bytes.length > MAX_BYTES) return 'The picture is too large.';
    if (bytes.length < 12 || !SIGNATURES[type](bytes)) return 'Send a JPEG, PNG or WebP picture.';
    const size = SIZES[type](bytes);
    if (!size || !size.width || !size.height) return 'Send a JPEG, PNG or WebP picture.';
    if (size.width > MAX_SIDE || size.height > MAX_SIDE) return `The picture is too large: ${MAX_SIDE} x ${MAX_SIDE} pixels at most.`;
    return null;
}

module.exports = { avatarProblem, MAX_BYTES, MAX_SIDE };
