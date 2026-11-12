// @ts-check
// The chat of an online game (assets/js/game-chat.js), with the game screen's Chat button.
import { session, socket } from './state.js';
import { createChat } from '../../../assets/js/game-chat.js';

const button = /** @type {HTMLButtonElement | null} */ (document.getElementById('btn-chat'));
export const chat = socket && button ? createChat(socket, {
    button,
    roomCode: () => session.currentRoomCode,
    me: () => session.myPlayerNumber,
}) : null;
