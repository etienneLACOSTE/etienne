// @ts-check
// Ches'spell client state: socket, online session, card catalogue, piece glyphs, Zobrist keys.
// Socket.io client (absent when the page is opened without the server).
export const socket = typeof io !== 'undefined' ? io('/chesspell') : null;

/** Online play: set when a room is created or joined. */
export const session = {
    isOnline: false,
    /** @type {string|null} */
    currentRoomCode: null,
    /** @type {'white'|'black'|null} */
    myPlayerColor: null,
    /** @type {number|null} */
    myPlayerNumber: null,
};

export const cardsData = [
    { id: 1, name: "Cannibalism", icon: "💀", effect: "Eat one of your own pieces.", unlock: "Unlocked by default.", isLocked: false,
      details: { timing: "Play instead of your normal move.", conditions: "You must have at least one piece to destroy.", inputs: "Click on one of your own pieces." } },
    { id: 2, name: "Double Trouble", icon: "⚡", effect: "Play 2 moves in a row, but your opponent does the same on their next turn.", unlock: "Play 5 games.", isLocked: true,
      details: { timing: "Play before your normal move.", conditions: "None.", inputs: "None. You simply get two consecutive turns." } },
    { id: 3, name: "Domi Reversi", icon: "🧠", effect: "For the next turn, an opponent's piece of your choice (except King) becomes yours.", unlock: "Win a game with a forced mate.", isLocked: true,
      details: { timing: "Play instead of your normal move.", conditions: "Target an enemy piece. If the opponent attacks it, it reverts immediately as a free action.", inputs: "Click on an enemy piece." } },
    { id: 4, name: "Sidestep", icon: "👣", effect: "Move a piece exactly one square.", unlock: "Move a king 10 times in one game.", isLocked: true,
      details: { timing: "Play instead of your normal move.", conditions: "None.", inputs: "Click your piece, then click an adjacent empty square." } },
    { id: 5, name: "Ghost", icon: "👻", effect: "For this turn, your moved piece passes through other pieces (cannot capture King).", unlock: "Unlocked by default.", isLocked: false,
      details: { timing: "Anytime on your turn.", conditions: "None.", inputs: "Activate, then move your piece." } },
    { id: 6, name: "Swap", icon: "🔄", effect: "Swap the positions of two of your own non-king pieces.", unlock: "Capture a queen with a pawn.", isLocked: true,
      details: { timing: "Play instead of your normal move.", conditions: "You must have at least two non-king pieces.", inputs: "Click the first piece, then click the second piece." } },
    { id: 7, name: "Sniper", icon: "🎯", effect: "Your Bishop can capture a piece without moving to its square.", unlock: "Win 3 games.", isLocked: true,
      details: { timing: "Play instead of your normal move.", conditions: "Your Bishop must have a clear line of sight to an enemy.", inputs: "Click your Bishop, then click the enemy piece to destroy it." } },
    { id: 8, name: "Wall", icon: "🧱", effect: "Place a temporary obstacle on an empty square for 2 turns.", unlock: "Unlocked by default.", isLocked: false,
      details: { timing: "Play instead of your normal move.", conditions: "None.", inputs: "Click on any empty square to place the Wall." } },
    { id: 9, name: "Revive", icon: "✨", effect: "Bring back your last captured pawn on its starting square.", unlock: "Lose 10 pawns.", isLocked: true,
      details: { timing: "Play instead of your normal move.", conditions: "You must have lost a pawn, and its starting square must be empty.", inputs: "None." } },
    { id: 10, name: "Tornado", icon: "🌪️", effect: "Randomize the positions of all pieces in a selected 3x3 area.", unlock: "Play 20 games.", isLocked: true,
      details: { timing: "Play instead of your normal move.", conditions: "None.", inputs: "Click the center square of the 3x3 area you want to scramble." } },
    { id: 11, name: "Shield", icon: "🛡️", effect: "Protect a chosen piece from being captured for one turn.", unlock: "Castle 5 times.", isLocked: true,
      details: { timing: "Play instead of your normal move.", conditions: "None.", inputs: "Click on one of your own pieces." } },
    { id: 12, name: "Leap Frog", icon: "🐸", effect: "Any chosen piece can move like a Knight for one turn.", unlock: "Unlocked by default.", isLocked: false,
      details: { timing: "Play before your normal move.", conditions: "None.", inputs: "None. The effect modifies your next move." } },
    { id: 13, name: "Mirror", icon: "🪞", effect: "Copy the effect of the last card your opponent played.", unlock: "Win against 3 different decks.", isLocked: true,
      details: { timing: "Depends on the copied card.", conditions: "Opponent must have played a card previously.", inputs: "Depends on the copied card." } },
    { id: 14, name: "Sacrifice", icon: "🩸", effect: "Destroy any of your pieces (except King) to promote a Pawn to that piece.", unlock: "Unlocked by default.", isLocked: false,
      details: { timing: "Anytime on your turn", conditions: "Must have a piece to sacrifice and a Pawn.", inputs: "Select the piece to sacrifice, then select the Pawn." } },
    { id: 15, name: "Freeze", icon: "🧊", effect: "Freeze an enemy piece for 1 turn. (Free action: you can move a piece afterwards)", unlock: "Unlocked by default.", isLocked: false,
      details: { timing: "Anytime on your turn", conditions: "Target an enemy piece.", inputs: "Select the enemy piece." } },
    { id: 16, name: "Trap", icon: "🕸️", effect: "Select an empty square; the first enemy piece to land there is destroyed.", unlock: "Win in under 20 moves.", isLocked: true,
      details: { timing: "Play instead of your normal move.", conditions: "None.", inputs: "Click on an empty square to place the hidden trap." } },
    { id: 17, name: "Teleport", icon: "🌀", effect: "Move a piece to any empty square on your starting rank.", unlock: "Unlocked by default.", isLocked: false,
      details: { timing: "Play instead of your normal move.", conditions: "You must have an empty square on your back rank.", inputs: "Click your piece, then click the destination square on your back rank." } },
    { id: 18, name: "Kamikaze", icon: "💥", effect: "Destroy one of your pieces and all pieces in the 9 squares around it (except Kings).", unlock: "Play 50 games.", isLocked: true,
      details: { timing: "Play instead of your normal move.", conditions: "Target one of your pieces.", inputs: "Click your piece." } },
    { id: 19, name: "Assassin", icon: "🗡️", effect: "After your next move, destroy an enemy piece on an adjacent square.", unlock: "Capture 20 pieces with Knights.", isLocked: true,
      details: { timing: "Play before your normal move.", conditions: "You must end your move next to an enemy piece (except King).", inputs: "None. You will be prompted after your move." } },
    { id: 20, name: "Promotion", icon: "👑", effect: "Promote a piece to the rank of the piece it just captured.", unlock: "Unlocked by default.", isLocked: false,
      details: { timing: "Play before capturing a piece.", conditions: "Your next move must be a capture of an enemy piece.", inputs: "None." } }
];

export const PIECE_MAP = {
    'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚', 'p': '♟',
    // Same filled glyphs for both sides: the CSS colours them (see DESIGN.md).
    'R': '♜', 'N': '♞', 'B': '♝', 'Q': '♛', 'K': '♚', 'P': '♟',
    'W': '🧱'
};

