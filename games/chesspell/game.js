// @ts-check
// Ches'spell game logic: turns, moves and the 20 spells, without any DOM.
// Shared by the browser (js/game-engine.js adds display, timer and bot) and by the
// server, which referees online games with it. Move rules come from rules.js.
//
// Every function works on a `state` object (in the browser, the `engine` object
// itself) and returns what happened, so the caller decides how to show it.
(function (root, factory) {
    const api = factory(typeof module === 'object' && module.exports ? require('./rules.js') : root.ChesspellRules);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ChesspellGame = api;
})(/** @type {any} */ (typeof self !== 'undefined' ? self : this), function (Rules) {
    'use strict';

    const WALL = 'W';
    const other = (color) => (color === 'white' ? 'black' : 'white');
    const inBoard = (r, c) => r >= 0 && r <= 7 && c >= 0 && c <= 7;

    /** Text shown to the caster for each targeting step. */
    const INSTRUCTIONS = {
        select_cannibalism_piece: 'Select one of your pieces (except King) to destroy.',
        select_domi_reversi: 'Select an enemy piece (except King) to control it.',
        select_kamikaze_piece: 'Select one of your pieces (except King) to destroy it and everything around it.',
        select_own_piece_tp: 'Select a piece to teleport.',
        select_tp_target: 'Select an empty square on your starting rank.',
        select_empty_square: 'Select an empty square to place a wall.',
        select_enemy_freeze: 'Select an enemy piece to freeze for 1 turn.',
        select_own_piece_sac: 'Select one of your pieces (except King) to sacrifice.',
        select_own_pawn_sac: 'Now select one of your Pawns to promote to that piece.',
        select_tornado_center: 'Select the center square of a 3x3 area to shuffle the pieces inside.',
        select_swap_1: 'Select the FIRST of your own non-king pieces to swap.',
        select_swap_2: 'Now select the SECOND piece to swap with.',
        select_sidestep_from: 'Select one of your pieces to sidestep.',
        select_sidestep_to: 'Now select an adjacent empty square.',
        select_sniper_bishop: 'Select your Bishop.',
        select_sniper_target: 'Now select an enemy piece to destroy.',
        select_shield_piece: 'Select a piece to protect for 1 turn.',
        select_trap_square: 'Select an empty square to place a hidden trap.',
        select_revive_square: 'Select an empty square on your starting Pawn rank (Row 2 or 7) to revive your Pawn.',
        select_assassin_kill: 'Select an adjacent enemy piece to assassinate.',
    };

    /** Spells that only switch a flag on: they take effect on the caster's next move. */
    const INSTANT_FLAGS = { 5: 'ghostActive', 12: 'leapFrogActive', 19: 'assassinActive', 20: 'promotionActive' };

    /** First targeting step of each targeted spell. */
    const FIRST_STEP = {
        3: 'select_domi_reversi', 4: 'select_sidestep_from', 6: 'select_swap_1', 7: 'select_sniper_bishop',
        8: 'select_empty_square', 10: 'select_tornado_center', 11: 'select_shield_piece', 14: 'select_own_piece_sac',
        15: 'select_enemy_freeze', 16: 'select_trap_square', 17: 'select_own_piece_tp', 18: 'select_kamikaze_piece',
    };

    /** A fresh game, or `state` reset to one. */
    function newGame(state = {}) {
        return Object.assign(state, {
            board: Rules.initialBoard(),
            turn: 'white',
            frozenPieces: [],
            shieldedPieces: [],
            traps: [],
            leapFrogActive: false,
            promotionActive: false,
            assassinActive: false,
            ghostActive: false,
            cannibalismActive: false,
            history: [],
            doubleTroubleState: { active: false, extraTurnPlayer: null },
            domiReversiPiece: null,
            lastPlayedCardId: null,
            capturedByWhite: [],
            capturedByBlack: [],
            hasMoved: { whiteKing: false, whiteRookA: false, whiteRookH: false, blackKing: false, blackRookA: false, blackRookH: false },
            usedCards: { white: [], black: [] },
            winner: null,
            activeSpellId: null,
            spellCard: null,
            spellCaster: null,
            targetingState: null,
        });
    }

    /** Remove a piece from play; capturing a king ends the game. */
    function destroyPiece(state, p) {
        if (!p) return;
        if (Rules.getColor(p) === 'white') state.capturedByBlack.push(p);
        else state.capturedByWhite.push(p);
        if (p.toLowerCase() === 'k' && !state.winner) {
            state.winner = Rules.getColor(p) === 'white' ? 'Black' : 'White';
        }
    }

    /** End of a turn: promotions, one-turn spells expire, the turn passes. */
    function endTurn(state) {
        Rules.promotePawns(state.board);
        state.ghostActive = false;
        state.leapFrogActive = false;
        state.promotionActive = false;
        state.cannibalismActive = false;
        state.assassinActive = false;

        const domi = state.domiReversiPiece;
        if (domi && state.turn === domi.caster) {
            if (domi.activeTurn) {
                const { r, c, originalColor } = domi;
                if (state.board[r][c]) {
                    state.board[r][c] = originalColor === 'white' ? state.board[r][c].toUpperCase() : state.board[r][c].toLowerCase();
                }
                state.domiReversiPiece = null;
            } else {
                domi.activeTurn = true;
            }
        }

        const dt = state.doubleTroubleState;
        if (dt && dt.active) {
            dt.movesLeft--;
            if (dt.movesLeft <= 0) {
                if (dt.player === state.turn) {
                    state.turn = other(state.turn);
                    dt.movesLeft = 2;
                } else {
                    state.turn = other(state.turn);
                    dt.active = false;
                }
            }
        } else {
            state.turn = other(state.turn);
        }

        state.frozenPieces.forEach((fp) => fp.duration--);
        state.frozenPieces = state.frozenPieces.filter((fp) => fp.duration > 0);
        state.shieldedPieces.forEach((sp) => sp.duration--);
        state.shieldedPieces = state.shieldedPieces.filter((sp) => sp.duration > 0);
    }

    /** True if the player to move may play this move now (used by the server). */
    function isLegalMove(state, r1, c1, r2, c2) {
        if (state.winner || state.targetingState) return false;
        if (![r1, c1, r2, c2].every((n) => Number.isInteger(n) && n >= 0 && n <= 7)) return false;
        const p = state.board[r1][c1];
        if (!p || p === WALL || Rules.getColor(p) !== state.turn) return false;
        return Rules.getValidMoves(state, r1, c1).some((m) => m.r === r2 && m.c === c2);
    }

    /** Keep a copy of the position for undo (the last 5). */
    function saveHistory(state) {
        state.history.push({
            board: state.board.map((row) => [...row]),
            turn: state.turn,
            capturedByWhite: [...state.capturedByWhite],
            capturedByBlack: [...state.capturedByBlack],
            shieldedPieces: state.shieldedPieces.map((sp) => ({ ...sp })),
            traps: state.traps.map((t) => ({ ...t })),
            frozenPieces: state.frozenPieces.map((fp) => ({ ...fp })),
            doubleTroubleState: state.doubleTroubleState ? { ...state.doubleTroubleState } : null,
            domiReversiPiece: state.domiReversiPiece ? { ...state.domiReversiPiece } : null,
        });
        if (state.history.length > 5) state.history.shift();
    }

    /** The piece that lands: the mover, or, under Promotion, the captured type in the mover's colour. */
    function landingPiece(state, movingPiece, targetPiece) {
        if (!state.promotionActive || !targetPiece) return movingPiece;
        const newType = targetPiece.toLowerCase();
        return Rules.getColor(movingPiece) === 'white' ? newType.toUpperCase() : newType;
    }

    /** Castling right lost by each piece leaving a square. */
    const CASTLING_FLAGS = {
        K: { any: 'whiteKing' }, k: { any: 'blackKing' },
        R: { '7,0': 'whiteRookA', '7,7': 'whiteRookH' },
        r: { '0,0': 'blackRookA', '0,7': 'blackRookH' },
    };

    /** Castling: rights lost when the king or a corner rook moves; the rook follows a castling king. */
    function applyCastling(state, movingPiece, r1, c1, r2, c2) {
        const flags = CASTLING_FLAGS[movingPiece];
        const flag = flags && (flags.any || flags[`${r1},${c1}`]);
        if (state.hasMoved && flag) state.hasMoved[flag] = true;
        // A castling king stays on its row (a king jumping with Leap Frog may also cross two columns).
        if (movingPiece.toLowerCase() !== 'k' || r1 !== r2 || Math.abs(c2 - c1) !== 2) return;
        const [rookFrom, rookTo] = c2 > c1 ? [7, c2 - 1] : [0, c2 + 1];
        state.board[r2][rookTo] = state.board[r2][rookFrom];
        state.board[r2][rookFrom] = null;
    }

    /** An enemy trap on the landing square destroys the piece (never a king) and is spent. */
    function springTrap(state, r, c) {
        const trapIndex = state.traps.findIndex((t) => t.r === r && t.c === c && t.owner !== Rules.getColor(state.board[r][c]));
        if (trapIndex === -1) return;
        if (state.board[r][c].toLowerCase() !== 'k') {
            destroyPiece(state, state.board[r][c]);
            state.board[r][c] = null;
        }
        state.traps.splice(trapIndex, 1);
    }

    /** Assassin victims: enemy pieces next to (r, c), never a king or a wall. */
    function assassinTargets(state, r, c) {
        const targets = [];
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const nr = r + dr;
            const nc = c + dc;
            if (!inBoard(nr, nc)) continue;
            const t = state.board[nr][nc];
            if (t && t !== WALL && t.toLowerCase() !== 'k' && Rules.getColor(t) !== state.turn) targets.push({ r: nr, c: nc });
        }
        return targets;
    }

    /**
     * Play a move (legality is the caller's business). Returns:
     * - 'reverted': the move captured the Domi Reversi piece, which goes back to its owner instead;
     * - 'assassin_kill': Assassin is active, the player now picks an adjacent victim;
     * - 'endTurn': the move is done and the caller must end the turn.
     */
    function move(state, r1, c1, r2, c2) {
        saveHistory(state);

        let domi = state.domiReversiPiece;
        if (domi && !state.board[domi.r][domi.c]) {
            // The piece was destroyed by a spell (Sniper, Kamikaze...): nothing left to give back.
            state.domiReversiPiece = domi = null;
        }
        if (domi && r2 === domi.r && c2 === domi.c) {
            state.board[r2][c2] = domi.originalColor === 'white' ? state.board[r2][c2].toUpperCase() : state.board[r2][c2].toLowerCase();
            state.domiReversiPiece = null;
            return 'reverted';
        }

        const targetPiece = state.board[r2][c2];
        const movingPiece = state.board[r1][c1];
        if (targetPiece) destroyPiece(state, targetPiece);
        state.board[r2][c2] = landingPiece(state, movingPiece, targetPiece);
        state.board[r1][c1] = null;
        if (domi && r1 === domi.r && c1 === domi.c) {
            domi.r = r2;
            domi.c = c2;
        }

        applyCastling(state, movingPiece, r1, c1, r2, c2);
        springTrap(state, r2, c2);
        state.frozenPieces = state.frozenPieces.filter((fp) => fp.r !== r1 || fp.c !== c1);

        if (state.assassinActive) {
            const targets = assassinTargets(state, r2, c2);
            if (targets.length > 0) {
                state.targetingState = 'select_assassin_kill';
                state.assassinTargets = targets;
                return 'assassin_kill';
            }
            state.assassinActive = false;
        }
        return 'endTurn';
    }

    /** Close the active spell; the card that was played is now used. */
    function completeSpell(state) {
        if (state.spellCard !== null && state.spellCard !== undefined && state.usedCards && state.spellCaster) {
            state.usedCards[state.spellCaster].push(state.spellCard);
        }
        cancelSpell(state);
    }

    function cancelSpell(state) {
        state.activeSpellId = null;
        state.spellCard = null;
        state.spellCaster = null;
        state.targetingState = null;
    }

    /**
     * Cast a card for the player to move. Returns
     * { status: 'instant' }                 the spell took effect, the card is used;
     * { status: 'targeting', instruction }  the player now picks its target(s);
     * { status: 'refused', message }        nothing happens, the card stays in hand.
     */
    function activateSpell(state, cardId) {
        state.spellCard = cardId;
        state.spellCaster = state.turn;
        if (cardId === 1) { // Cannibalism: a global buff for this turn
            state.cannibalismActive = true;
            completeSpell(state);
            return { status: 'instant' };
        }
        if (cardId === 13) { // Mirror: plays the last card played
            if (!state.lastPlayedCardId) {
                cancelSpell(state);
                return { status: 'refused', message: 'No card has been played yet to mirror.' };
            }
            cardId = state.lastPlayedCardId;
        } else {
            state.lastPlayedCardId = cardId;
        }
        state.activeSpellId = cardId;

        if (cardId === 2) { // Double Trouble
            state.doubleTroubleState = { active: true, player: state.turn, movesLeft: 2 };
            completeSpell(state);
            return { status: 'instant' };
        }
        if (INSTANT_FLAGS[cardId]) {
            state[INSTANT_FLAGS[cardId]] = true;
            completeSpell(state);
            return { status: 'instant' };
        }
        if (cardId === 9) { // Revive
            const captured = state.turn === 'white' ? state.capturedByBlack : state.capturedByWhite;
            if (!captured.some((p) => p.toLowerCase() === 'p')) {
                cancelSpell(state);
                return { status: 'refused', message: 'You have no captured Pawns to revive.' };
            }
            state.targetingState = 'select_revive_square';
        } else if (FIRST_STEP[cardId]) {
            state.targetingState = FIRST_STEP[cardId];
            if (cardId === 6) state.swapPiece1 = null;
            if (cardId === 4) state.sidestepFrom = null;
            if (cardId === 7) state.sniperBishop = null;
        } else {
            cancelSpell(state);
            return { status: 'refused', message: 'Spell not implemented yet.' };
        }
        return { status: 'targeting', instruction: INSTRUCTIONS[state.targetingState] };
    }

    const ignored = { status: 'ignored' };
    const invalid = (message) => ({ status: 'invalid', message });
    const next = (state, targetingState) => {
        state.targetingState = targetingState;
        return { status: 'next', instruction: INSTRUCTIONS[targetingState] };
    };
    /** The spell is resolved: `endTurn` says whether it also ends the caster's turn. */
    const done = (endsTurn) => ({ status: 'done', endTurn: endsTurn });

    /**
     * A square picked while a spell is targeting. Returns
     * { status: 'ignored' }                     not a valid pick, nothing happens;
     * { status: 'invalid', message }            not a valid pick, tell the player why;
     * { status: 'next', instruction }           first target chosen, pick the next one;
     * { status: 'done', endTurn }               the spell is resolved. The caller ends the
     *                                           turn first when `endTurn`, then completes the spell.
     * `random` is used by Tornado (the server passes its own).
     */
    function clickSquare(state, r, c, random = Math.random) {
        if (!state.targetingState || !inBoard(r, c)) return ignored;
        const board = state.board;
        const p = board[r][c];
        const color = Rules.getColor(p);
        const ts = state.targetingState;
        const spell = state.activeSpellId;

        if (spell === 17 && ts === 'select_own_piece_tp') { // Teleport
            if (color !== state.turn) return ignored;
            state.tpSource = { r, c };
            return next(state, 'select_tp_target');
        }
        if (spell === 17 && ts === 'select_tp_target') {
            if (p || r !== (state.turn === 'white' ? 7 : 0)) return ignored;
            board[r][c] = board[state.tpSource.r][state.tpSource.c];
            board[state.tpSource.r][state.tpSource.c] = null;
            return done(true);
        }
        if (spell === 8 && ts === 'select_empty_square') { // Wall
            if (p) return ignored;
            board[r][c] = WALL;
            return done(true);
        }
        if (spell === 15 && ts === 'select_enemy_freeze') { // Freeze: a free action
            if (!p || color === state.turn || p === WALL) return ignored;
            if (p.toLowerCase() === 'k') return invalid('Cannot freeze the King.');
            state.frozenPieces.push({ r, c, duration: 2 }); // 2 half-turns
            return done(false);
        }
        if (spell === 14 && ts === 'select_own_piece_sac') { // Sacrifice
            if (!p || color !== state.turn || p.toLowerCase() === 'k') return ignored;
            state.sacrificePiece = { r, c, type: p };
            return next(state, 'select_own_pawn_sac');
        }
        if (spell === 14 && ts === 'select_own_pawn_sac') {
            if (!p || color !== state.turn || p.toLowerCase() !== 'p') return ignored;
            const sac = state.sacrificePiece;
            destroyPiece(state, board[sac.r][sac.c]);
            board[sac.r][sac.c] = null;
            board[r][c] = sac.type;
            return done(true);
        }
        if (ts === 'select_tornado_center') {
            const pieces = [];
            const squares = [];
            for (let i = r - 1; i <= r + 1; i++) {
                for (let j = c - 1; j <= c + 1; j++) {
                    if (inBoard(i, j) && board[i][j]) {
                        pieces.push(board[i][j]);
                        squares.push({ r: i, c: j });
                    }
                }
            }
            for (let i = pieces.length - 1; i > 0; i--) {
                const j = Math.floor(random() * (i + 1));
                [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
            }
            squares.forEach((sq, i) => { board[sq.r][sq.c] = pieces[i]; });
            return done(true);
        }
        if (ts === 'select_swap_1') {
            if (!p || color !== state.turn || p.toLowerCase() === 'k') return invalid('Select one of your non-king pieces.');
            state.swapPiece1 = { r, c, type: p };
            return next(state, 'select_swap_2');
        }
        if (ts === 'select_swap_2') {
            if (!p || color !== state.turn || p.toLowerCase() === 'k') return invalid('Select a valid second non-king piece.');
            if (state.swapPiece1.r === r && state.swapPiece1.c === c) return invalid('Must be a different piece.');
            board[state.swapPiece1.r][state.swapPiece1.c] = p;
            board[r][c] = state.swapPiece1.type;
            return done(true);
        }
        if (ts === 'select_sidestep_from') {
            if (!p || color !== state.turn) return invalid('Select your piece.');
            state.sidestepFrom = { r, c, type: p };
            return next(state, 'select_sidestep_to');
        }
        if (ts === 'select_sidestep_to') {
            if (p) return invalid('Square must be empty.');
            const dr = Math.abs(r - state.sidestepFrom.r);
            const dc = Math.abs(c - state.sidestepFrom.c);
            if (dr > 1 || dc > 1 || (dr === 0 && dc === 0)) return invalid('Must be an adjacent square.');
            board[r][c] = state.sidestepFrom.type;
            board[state.sidestepFrom.r][state.sidestepFrom.c] = null;
            return done(true);
        }
        if (ts === 'select_sniper_bishop') {
            if (!p || color !== state.turn || p.toLowerCase() !== 'b') return invalid('Select your Bishop.');
            state.sniperBishop = { r, c, type: p };
            return next(state, 'select_sniper_target');
        }
        if (ts === 'select_sniper_target') {
            if (!p || p === WALL || color === state.turn) return invalid('Must select an enemy piece.');
            if (p.toLowerCase() === 'k') return invalid('Cannot target the King.');
            const dr = r - state.sniperBishop.r;
            const dc = c - state.sniperBishop.c;
            if (Math.abs(dr) !== Math.abs(dc)) return invalid('Bishop can only snipe diagonally.');
            const stepR = dr > 0 ? 1 : -1;
            const stepC = dc > 0 ? 1 : -1;
            let cr = state.sniperBishop.r + stepR;
            let cc = state.sniperBishop.c + stepC;
            while (cr !== r && cc !== c) {
                if (board[cr][cc] !== null && board[cr][cc] !== WALL) return invalid('Line of sight is blocked by another piece.');
                cr += stepR;
                cc += stepC;
            }
            destroyPiece(state, p);
            board[r][c] = null; // The bishop does not move
            return done(true);
        }
        if (ts === 'select_shield_piece') { // A free action
            if (!p || color !== state.turn) return invalid('Select your piece.');
            state.shieldedPieces.push({ r, c, duration: 2 }); // 2 half-turns
            return done(false);
        }
        if (ts === 'select_trap_square') {
            if (p) return invalid('Square must be empty.');
            state.traps.push({ r, c, owner: state.turn });
            return done(true);
        }
        if (ts === 'select_revive_square') { // A free action
            if (r !== (state.turn === 'white' ? 6 : 1)) return invalid('Must be on your starting Pawn rank.');
            if (p) return invalid('Square must be empty.');
            const captured = state.turn === 'white' ? state.capturedByBlack : state.capturedByWhite;
            const pawnIdx = captured.findIndex((x) => x.toLowerCase() === 'p');
            board[r][c] = captured[pawnIdx];
            captured.splice(pawnIdx, 1);
            return done(false);
        }
        if (spell === 3 && ts === 'select_domi_reversi') {
            if (!p || p === WALL || color === state.turn || p.toLowerCase() === 'k') return invalid('Select an enemy piece (except King).');
            state.domiReversiPiece = { r, c, originalColor: color, caster: state.turn, activeTurn: false };
            board[r][c] = state.turn === 'white' ? p.toUpperCase() : p.toLowerCase();
            return done(true);
        }
        if (spell === 18 && ts === 'select_kamikaze_piece') {
            if (!p || color !== state.turn || p.toLowerCase() === 'k') return invalid('Select one of your pieces (except King).');
            for (let i = r - 1; i <= r + 1; i++) {
                for (let j = c - 1; j <= c + 1; j++) {
                    const tgt = inBoard(i, j) && board[i][j];
                    if (tgt && tgt !== WALL && tgt.toLowerCase() !== 'k') {
                        destroyPiece(state, tgt);
                        board[i][j] = null;
                    }
                }
            }
            return done(true);
        }
        if (ts === 'select_assassin_kill') {
            if (!state.assassinTargets.some((t) => t.r === r && t.c === c)) return invalid('Select one of the adjacent enemy pieces.');
            destroyPiece(state, p);
            board[r][c] = null;
            state.assassinActive = false;
            state.assassinTargets = null;
            return done(true);
        }
        return ignored;
    }

    /** Plain copy of the state for a player (traps are visible to both players). */
    function snapshot(state) {
        const copy = JSON.parse(JSON.stringify({
            board: state.board, turn: state.turn, frozenPieces: state.frozenPieces, shieldedPieces: state.shieldedPieces,
            traps: state.traps, leapFrogActive: state.leapFrogActive, promotionActive: state.promotionActive,
            assassinActive: state.assassinActive, ghostActive: state.ghostActive, cannibalismActive: state.cannibalismActive,
            doubleTroubleState: state.doubleTroubleState, domiReversiPiece: state.domiReversiPiece,
            lastPlayedCardId: state.lastPlayedCardId, capturedByWhite: state.capturedByWhite, capturedByBlack: state.capturedByBlack,
            hasMoved: state.hasMoved, usedCards: state.usedCards, winner: state.winner,
            activeSpellId: state.activeSpellId, targetingState: state.targetingState, assassinTargets: state.assassinTargets || null,
        }));
        return copy;
    }

    return {
        INSTRUCTIONS, newGame, destroyPiece, endTurn, isLegalMove, move, activateSpell, clickSquare,
        completeSpell, cancelSpell, snapshot,
    };
});
