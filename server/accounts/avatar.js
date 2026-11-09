// @ts-check
// The account picture: a small image sent by the player, shown to other players. Only
// what the account page makes is accepted: a base64 data URL of a JPEG, PNG or WebP
// image of 28 KB at most, whose bytes really are that kind of image.

const MAX_BYTES = 28_000; // As a data URL, under the 40 KB the game servers accept
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

/** The first bytes of each format. */
const SIGNATURES = {
    jpeg: (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF,
    png: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])),
    webp: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
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
    return null;
}

module.exports = { avatarProblem, MAX_BYTES };
