// @ts-check
// The chat of an online game (assets/js/game-chat.js), with the header's Chat button.
import { socket, state } from './state.js';
import { createChat } from '../../../assets/js/game-chat.js';

const button = /** @type {HTMLButtonElement | null} */ (document.getElementById('btn-chat'));
export const chat = socket && button ? createChat(socket, {
    button,
    roomCode: () => state.currentRoomCode,
    me: () => state.myPlayerNumber,
}) : null;
