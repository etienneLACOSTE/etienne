// @ts-check
// A form error shown under its field, not in a dialog: the field is marked invalid, the
// message is tied to it (aria-describedby) and read out (role="alert"), and the focus
// goes back into the field. The message goes away as soon as the field is changed.

/**
 * @param {HTMLInputElement | HTMLSelectElement} input the field (it needs an id)
 * @param {string} message
 * @param {{ after?: Element }} [options] after: where the message goes (default: the field)
 */
export function showFieldError(input, message, { after = input } = {}) {
    const id = `${input.id}-error`;
    let box = document.getElementById(id);
    if (!box) {
        box = Object.assign(document.createElement('p'), { id, className: 'field-error' });
        box.setAttribute('role', 'alert');
        after.insertAdjacentElement('afterend', box);
    }
    box.textContent = message;
    input.setAttribute('aria-invalid', 'true');
    const described = (input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
    if (!described.includes(id)) input.setAttribute('aria-describedby', [...described, id].join(' '));
    input.focus();
    input.addEventListener(input instanceof HTMLSelectElement ? 'change' : 'input', () => clearFieldError(input), { once: true });
}

/** @param {HTMLInputElement | HTMLSelectElement} input */
export function clearFieldError(input) {
    const id = `${input.id}-error`;
    document.getElementById(id)?.remove();
    input.removeAttribute('aria-invalid');
    const described = (input.getAttribute('aria-describedby') || '').split(' ').filter((d) => d && d !== id);
    if (described.length) input.setAttribute('aria-describedby', described.join(' '));
    else input.removeAttribute('aria-describedby');
}
