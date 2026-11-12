// @ts-check
// In-page dialogs, instead of the browser's alert() and confirm(): they wear the page's
// style (DESIGN.md) and do not freeze the page. Built on <dialog> + showModal(): the
// browser keeps the focus inside, closes it with Escape and gives the focus back to
// where it was. One dialog at a time: the next one waits for the current one to close.
// Buttons: `.btn` and `.btn-primary`, styled by each page (hub, Chessdown, Ches'spell).

/** @type {Promise<unknown>} */
let queue = Promise.resolve();

/**
 * Show `message` and wait for an answer.
 * @param {string} message
 * @param {{ label: string, value: string, primary?: boolean, focus?: boolean }[]} buttons
 * @returns {Promise<string>} the value of the button pressed ('' for Escape)
 */
function open(message, buttons) {
    const shown = queue.then(() => new Promise((resolve) => {
        const dialog = document.createElement('dialog');
        dialog.className = 'app-dialog';
        dialog.setAttribute('role', 'alertdialog');
        const text = Object.assign(document.createElement('p'), {
            className: 'app-dialog-message',
            id: `app-dialog-${Date.now()}`,
            textContent: String(message), // Some messages come from the server: text only
        });
        dialog.setAttribute('aria-labelledby', text.id);
        const form = Object.assign(document.createElement('form'), { method: 'dialog', className: 'app-dialog-actions' });
        for (const b of buttons) {
            const button = Object.assign(document.createElement('button'), {
                type: 'submit',
                value: b.value,
                textContent: b.label,
                className: b.primary ? 'btn btn-primary' : 'btn btn-secondary',
            });
            if (b.focus) button.autofocus = true;
            form.append(button);
        }
        dialog.append(text, form);
        dialog.addEventListener('close', () => {
            dialog.remove();
            resolve(dialog.returnValue);
        }, { once: true });
        document.body.append(dialog);
        dialog.showModal();
    }));
    queue = shown;
    return /** @type {Promise<string>} */ (shown);
}

/**
 * A message with an OK button.
 * @param {string} message
 * @returns {Promise<void>} once the player has closed it
 */
export async function notify(message) {
    await open(message, [{ label: 'OK', value: 'ok', primary: true, focus: true }]);
}

/**
 * A question with two answers. The focus starts on "cancel": Enter never confirms by mistake.
 * @param {string} message
 * @param {{ confirm?: string, cancel?: string }} [labels]
 * @returns {Promise<boolean>} true when confirmed (false for cancel and Escape)
 */
export async function ask(message, { confirm = 'OK', cancel = 'Cancel' } = {}) {
    const answer = await open(message, [
        { label: cancel, value: 'cancel', focus: true },
        { label: confirm, value: 'confirm', primary: true },
    ]);
    return answer === 'confirm';
}
