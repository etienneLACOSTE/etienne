// @ts-check
// Chat between the two players of an online game (server/chat.js). The game's header has
// a "Chat" button; it opens a panel with the messages, a field to write, and a switch to
// turn the chat off (remembered on this device). The chat exists only between two
// accounts: a guest is asked to sign in. Messages are shown as text, never as HTML.

const OFF_KEY = 'pawnet.chatOff';
const MAX_LENGTH = 200; // As on the server

const NOTES = {
    'you-guest': 'Sign in to chat with your opponent.',
    'opponent-guest': 'Your opponent is playing as a guest: no chat.',
    unavailable: 'Chat is not available in this game.',
};

function readOff() {
    try { return localStorage.getItem(OFF_KEY) === '1'; } catch { return false; }
}
function saveOff(off) {
    try { if (off) localStorage.setItem(OFF_KEY, '1'); else localStorage.removeItem(OFF_KEY); } catch { /* Not kept */ }
}

/**
 * @param {any} socket the game's Socket.io connection
 * @param {{ button: HTMLButtonElement, roomCode: () => string | null, me: () => number }} game
 *   button: the header's Chat button; me: this page's player number (1 or 2)
 */
export function createChat(socket, { button, roomCode, me }) {
    let off = readOff();
    let open = false;
    let unread = 0;
    let startedFor = ''; // The room the chat was started for (a rematch keeps its messages)
    /** @type {{ available: boolean, reason: string | null, opponentMuted: boolean }} */
    let state = { available: false, reason: null, opponentMuted: false };

    const panel = document.createElement('section');
    panel.className = 'game-chat';
    panel.id = 'game-chat';
    panel.hidden = true;
    panel.setAttribute('aria-labelledby', 'game-chat-title');
    panel.innerHTML = `
        <div class="chat-head">
            <h2 class="chat-title" id="game-chat-title">Chat</h2>
            <button type="button" class="chat-switch btn btn-secondary">Turn chat off</button>
            <button type="button" class="chat-close btn btn-secondary" aria-label="Close the chat">×</button>
        </div>
        <div class="chat-log" role="log" aria-live="polite" aria-label="Messages"></div>
        <p class="chat-note"></p>
        <form class="chat-form">
            <label class="chat-label" for="chat-input">Message</label>
            <input id="chat-input" class="chat-input" type="text" maxlength="${MAX_LENGTH}" autocomplete="off" required>
            <button type="submit" class="btn btn-primary">Send</button>
        </form>`;
    document.body.append(panel);
    const log = /** @type {HTMLElement} */ (panel.querySelector('.chat-log'));
    const note = /** @type {HTMLElement} */ (panel.querySelector('.chat-note'));
    const form = /** @type {HTMLFormElement} */ (panel.querySelector('.chat-form'));
    const input = /** @type {HTMLInputElement} */ (panel.querySelector('.chat-input'));
    const toggle = /** @type {HTMLButtonElement} */ (panel.querySelector('.chat-switch'));
    button.setAttribute('aria-controls', panel.id);
    button.setAttribute('aria-expanded', 'false');

    function render() {
        const canWrite = state.available && !off && !state.opponentMuted;
        button.textContent = off ? 'Chat off' : unread ? `Chat (${unread})` : 'Chat';
        button.setAttribute('aria-label', unread && !off ? `Chat, ${unread} unread` : button.textContent);
        button.setAttribute('aria-expanded', String(open));
        panel.hidden = !open;
        toggle.hidden = !state.available;
        toggle.textContent = off ? 'Turn chat on' : 'Turn chat off';
        log.hidden = !state.available || off;
        form.hidden = !canWrite;
        let text = '';
        if (!state.available) text = NOTES[state.reason] || NOTES.unavailable;
        else if (off) text = 'Chat is off: you do not get messages.';
        else if (state.opponentMuted) text = 'Your opponent turned the chat off.';
        note.replaceChildren(text);
        note.hidden = !text;
        if (state.reason === 'you-guest') {
            const link = Object.assign(document.createElement('a'), {
                href: `/account/?next=${encodeURIComponent(location.pathname)}`, textContent: 'Sign in',
            });
            note.replaceChildren(link, ' to chat with your opponent.');
        }
    }

    function show(isOpen) {
        open = isOpen;
        if (open) unread = 0;
        render();
        if (!open) return button.focus();
        const close = /** @type {HTMLButtonElement} */ (panel.querySelector('.chat-close'));
        (!form.hidden ? input : !toggle.hidden ? toggle : close).focus();
    }

    button.addEventListener('click', () => show(!open));
    panel.querySelector('.chat-close')?.addEventListener('click', () => show(false));
    panel.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); show(false); }
    });
    toggle.addEventListener('click', () => {
        off = !off;
        saveOff(off);
        if (off) log.replaceChildren();
        const code = roomCode();
        if (code) socket.emit('chatMuted', { roomCode: code, muted: off });
        render();
    });
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = input.value.trim();
        const code = roomCode();
        if (!text || !code) return;
        socket.emit('chatMessage', { roomCode: code, text: text.slice(0, MAX_LENGTH) });
        input.value = '';
    });

    socket.on('chatState', (/** @type {any} */ data) => {
        state = {
            available: Boolean(data && data.available),
            reason: data && typeof data.reason === 'string' ? data.reason : null,
            opponentMuted: Boolean(data && data.opponentMuted),
        };
        render();
    });
    socket.on('chatMessage', (/** @type {any} */ data) => {
        if (off || !startedFor || !data || typeof data.text !== 'string') return; // Not in a game any more
        const mine = data.from === me();
        const item = document.createElement('p');
        item.className = mine ? 'chat-message mine' : 'chat-message';
        const name = Object.assign(document.createElement('span'), {
            className: 'chat-name', textContent: mine ? 'You' : String(data.name || 'Opponent'),
        });
        item.append(name, ': ', String(data.text));
        log.append(item);
        while (log.children.length > 100) log.firstElementChild?.remove(); // Only the last 100
        log.scrollTop = log.scrollHeight;
        if (!open && !mine) unread++;
        render();
    });
    socket.on('chatNotice', (/** @type {any} */ data) => {
        if (data && data.reason === 'rate') {
            note.hidden = false;
            note.textContent = 'You are sending messages too fast. Wait a few seconds.';
        }
    });

    return {
        /** An online game starts (both players are in the room): show the Chat button. */
        start() {
            const code = roomCode();
            if (!code) return;
            if (code !== startedFor) {
                log.replaceChildren();
                unread = 0;
                state = { available: false, reason: null, opponentMuted: false };
            }
            startedFor = code;
            button.hidden = false;
            render();
            socket.emit('chatJoin', { roomCode: code, muted: off });
        },
        /** The game is over and left: no chat any more, and nothing kept on screen. */
        stop() {
            startedFor = '';
            log.replaceChildren();
            unread = 0;
            open = false;
            button.hidden = true;
            render();
        },
    };
}
