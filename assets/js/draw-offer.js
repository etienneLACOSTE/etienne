// @ts-check
// Online games: draw offers (server/socket-utils.js drawOffers). A player offers a draw
// with the game's "Offer draw" button; the opponent sees a bar with Accept and Decline.
// The server keeps the rules: one offer at a time, one per turn played, and the offer
// ends when the opponent plays a turn. The bar does not take the focus (the opponent
// may be in the middle of a move): it is announced, and reachable with Tab.

/**
 * @param {any} socket the game's Socket.io connection
 * @param {{ button: HTMLButtonElement, me: () => number, roomCode: () => string | null,
 *   playing: () => boolean }} game me: this page's player number (1 or 2); playing: an
 *   online game is in progress
 */
export function watchDrawOffers(socket, { button, me, roomCode, playing }) {
    let pending = 0; // Who offered the draw in progress (0: none)
    let offeredThisTurn = false;
    /** @type {HTMLElement | null} */
    let bar = null;
    let hideTimer = 0;

    function refresh() {
        button.disabled = !playing() || Boolean(pending) || offeredThisTurn;
        button.textContent = pending === me() ? 'Draw offered' : 'Offer draw';
    }

    function hideBar() {
        clearTimeout(hideTimer);
        bar?.remove();
        bar = null;
    }

    /** The bar at the bottom of the screen: a sentence, and buttons when given. */
    function showBar(text, buttons = []) {
        hideBar();
        const box = document.createElement('div');
        box.className = 'draw-offer';
        box.setAttribute('role', 'group');
        box.setAttribute('aria-label', 'Draw offer');
        const status = document.createElement('p');
        status.className = 'draw-offer-text';
        status.setAttribute('role', 'status');
        box.append(status);
        if (buttons.length) {
            const actions = document.createElement('div');
            actions.className = 'draw-offer-actions';
            for (const [label, primary, onClick] of buttons) {
                const b = Object.assign(document.createElement('button'), {
                    type: 'button', textContent: label, className: primary ? 'btn btn-primary' : 'btn btn-secondary',
                });
                b.addEventListener('click', onClick);
                actions.append(b);
            }
            box.append(actions);
        }
        document.body.append(box);
        bar = box;
        // Filled once the region exists, so screen readers announce it.
        requestAnimationFrame(() => { if (bar === box) status.textContent = text; });
        return box;
    }

    const answer = (accept) => {
        const code = roomCode();
        if (code) socket.emit('answerDraw', { roomCode: code, accept });
        hideBar();
    };

    socket.on('drawOffered', (/** @type {{ by?: number }} */ data) => {
        pending = Number(data && data.by) || 0;
        if (pending === me()) {
            offeredThisTurn = true;
            showBar('Draw offered. Waiting for your opponent…');
        } else if (pending) {
            showBar('Your opponent offers a draw.', [
                ['Accept', true, () => answer(true)],
                ['Decline', false, () => answer(false)],
            ]);
        }
        refresh();
    });

    socket.on('drawOfferEnded', (/** @type {{ reason?: string }} */ data) => {
        const mine = pending === me();
        pending = 0;
        hideBar();
        if (mine && data && data.reason === 'declined') {
            const shown = showBar('Your opponent declined the draw.');
            hideTimer = window.setTimeout(() => { if (bar === shown) hideBar(); }, 4000);
        }
        refresh();
    });

    return {
        /** The button was pressed: offer a draw to the opponent. */
        offer() {
            const code = roomCode();
            if (!code || button.disabled) return;
            offeredThisTurn = true;
            refresh();
            socket.emit('offerDraw', { roomCode: code });
        },
        /** A turn was played: a new offer is allowed (the server ends the pending one). */
        turnPlayed() {
            offeredThisTurn = false;
            refresh();
        },
        /** The game ended, or a new one starts: no offer any more. */
        reset() {
            pending = 0;
            offeredThisTurn = false;
            hideBar();
            refresh();
        },
        refresh,
    };
}
