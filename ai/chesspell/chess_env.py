import chess
import numpy as np
import random

# Universal Spell Action Space Mapping
SPELL_TYPES = {
    1: 1, 2: 0, 3: 1, 4: 2, 5: 0, 6: 2, 7: 2, 8: 1, 9: 0, 10: 1,
    11: 1, 12: 0, 13: 0, 14: 2, 15: 1, 16: 1, 17: 2, 18: 1, 19: 0, 20: 0
}

SPELL_OFFSETS = {}
current_offset = 4096

for spell_id, target_type in SPELL_TYPES.items():
    SPELL_OFFSETS[spell_id] = current_offset
    if target_type == 0:
        current_offset += 1
    elif target_type == 1:
        current_offset += 64
    elif target_type == 2:
        current_offset += 4096

TOTAL_ACTION_SPACE = current_offset

class SpellAction:
    def __init__(self, spell_id, target1=None, target2=None):
        self.spell_id = spell_id
        self.target1 = target1
        self.target2 = target2
        
    def __eq__(self, other):
        if not isinstance(other, SpellAction): return False
        return self.spell_id == other.spell_id and self.target1 == other.target1 and self.target2 == other.target2
        
    def __hash__(self):
        return hash((self.spell_id, self.target1, self.target2))
        
    def __repr__(self):
        t1 = chess.square_name(self.target1) if self.target1 is not None else "None"
        t2 = chess.square_name(self.target2) if self.target2 is not None else "None"
        return f"Spell({self.spell_id}, {t1}, {t2})"

def move_to_int(action):
    if isinstance(action, chess.Move):
        return action.from_square * 64 + action.to_square
    elif isinstance(action, SpellAction):
        offset = SPELL_OFFSETS[action.spell_id]
        t_type = SPELL_TYPES[action.spell_id]
        if t_type == 0:
            return offset
        elif t_type == 1:
            return offset + action.target1
        elif t_type == 2:
            return offset + (action.target1 * 64 + action.target2)
    return 0

class ChesspellEnv:
    def __init__(self):
        self.board = chess.Board()
        # All 20 Spells Available!
        self.spells = {
            chess.WHITE: {i: 1 for i in range(1, 21)},
            chess.BLACK: {i: 1 for i in range(1, 21)}
        }
        self.reset_state_modifiers()
        
    def reset_state_modifiers(self):
        self.frozen_square = None
        self.shielded_square = None
        self.trap_square = {chess.WHITE: None, chess.BLACK: None}
        self.wall_squares = {}
        self.double_trouble_turns = 0
        self.leap_frog_active = None
        self.ghost_active = None
        self.domi_reversi_target = None
        self.domi_reversi_original_color = None
        self.domi_reversi_wait = False
        self.cannibalism_active = None
        
    def reset(self):
        self.board.reset()
        self.spells = {
            chess.WHITE: {i: 1 for i in range(1, 21)},
            chess.BLACK: {i: 1 for i in range(1, 21)}
        }
        self.reset_state_modifiers()
        return self.get_state()
        
    def copy(self):
        new_env = ChesspellEnv.__new__(ChesspellEnv)
        new_env.board = self.board.copy()
        new_env.spells = {
            chess.WHITE: self.spells[chess.WHITE].copy(),
            chess.BLACK: self.spells[chess.BLACK].copy()
        }
        new_env.frozen_square = self.frozen_square
        new_env.shielded_square = self.shielded_square
        new_env.trap_square = self.trap_square.copy()
        new_env.wall_squares = self.wall_squares.copy()
        new_env.double_trouble_turns = self.double_trouble_turns
        new_env.leap_frog_active = self.leap_frog_active
        new_env.ghost_active = self.ghost_active
        new_env.domi_reversi_target = self.domi_reversi_target
        new_env.domi_reversi_original_color = self.domi_reversi_original_color
        new_env.domi_reversi_wait = self.domi_reversi_wait
        new_env.cannibalism_active = self.cannibalism_active
        return new_env

    def get_state(self):
        state = np.zeros((63, 8, 8), dtype=np.float32)
        piece_idx = {'P': 0, 'N': 1, 'B': 2, 'R': 3, 'Q': 4, 'K': 5,
                     'p': 6, 'n': 7, 'b': 8, 'r': 9, 'q': 10, 'k': 11}
                     
        for r in range(8):
            for c in range(8):
                square = chess.square(c, 7-r)
                if square in self.wall_squares:
                    continue
                piece = self.board.piece_at(square)
                if piece:
                    state[piece_idx[piece.symbol()]][r][c] = 1.0
                    
        if self.board.turn == chess.WHITE:
            state[12].fill(1.0)
            
        if self.board.has_castling_rights(chess.WHITE): state[13][0].fill(1.0)
        if self.board.has_castling_rights(chess.BLACK): state[13][7].fill(1.0)
            
        my_spells = self.spells[self.board.turn]
        opp_spells = self.spells[not self.board.turn]
        
        for spell_id, charges in my_spells.items():
            if charges > 0 and 1 <= spell_id <= 20:
                state[14 + spell_id - 1].fill(1.0)
                
        for spell_id, charges in opp_spells.items():
            if charges > 0 and 1 <= spell_id <= 20:
                state[34 + spell_id - 1].fill(1.0)
                
        if self.frozen_square is not None:
            state[54][7 - chess.square_rank(self.frozen_square)][chess.square_file(self.frozen_square)] = 1.0
        
        if self.shielded_square is not None:
            state[55][7 - chess.square_rank(self.shielded_square)][chess.square_file(self.shielded_square)] = 1.0
            
        if self.trap_square[chess.WHITE] is not None:
            sq = self.trap_square[chess.WHITE]
            state[56][7 - chess.square_rank(sq)][chess.square_file(sq)] = 1.0
            
        if self.trap_square[chess.BLACK] is not None:
            sq = self.trap_square[chess.BLACK]
            state[57][7 - chess.square_rank(sq)][chess.square_file(sq)] = 1.0
            
        for sq in self.wall_squares:
            state[58][7 - chess.square_rank(sq)][chess.square_file(sq)] = 1.0
            
        if self.double_trouble_turns > 0: state[59].fill(1.0)
        
        if self.leap_frog_active == self.board.turn: state[60].fill(1.0)
        elif self.leap_frog_active is not None: state[60].fill(-1.0)
        
        if self.ghost_active == self.board.turn: state[61].fill(1.0)
        elif self.ghost_active is not None: state[61].fill(-1.0)
        
        if self.cannibalism_active == self.board.turn: state[62].fill(1.0)
        elif self.cannibalism_active is not None: state[62].fill(-1.0)

        return state
        
    def get_legal_moves(self):
        moves = list(self.board.legal_moves)
        
        # Modifier: Freeze
        if self.frozen_square is not None:
            moves = [m for m in moves if m.from_square != self.frozen_square]
            
        # Modifier: Shield
        if self.shielded_square is not None:
            shielded_piece = self.board.piece_at(self.shielded_square)
            if shielded_piece and shielded_piece.color != self.board.turn:
                moves = [m for m in moves if m.to_square != self.shielded_square]
                
        # Modifier: Walls
        moves = [m for m in moves if m.from_square not in self.wall_squares and m.to_square not in self.wall_squares]
        
        # Modifier: Leap Frog (Add knight pseudo moves for all our pieces)
        if self.leap_frog_active == self.board.turn:
            for sq in chess.SQUARES:
                p = self.board.piece_at(sq)
                if p and p.color == self.board.turn and sq not in self.wall_squares:
                    knight_moves = [
                        (2,1), (1,2), (-1,2), (-2,1),
                        (-2,-1), (-1,-2), (1,-2), (2,-1)
                    ]
                    file, rank = chess.square_file(sq), chess.square_rank(sq)
                    for df, dr in knight_moves:
                        nf, nr = file + df, rank + dr
                        if 0 <= nf <= 7 and 0 <= nr <= 7:
                            dest = chess.square(nf, nr)
                            dest_p = self.board.piece_at(dest)
                            if (not dest_p or dest_p.color != self.board.turn) and dest not in self.wall_squares:
                                moves.append(chess.Move(sq, dest))
                                
        # Modifier: Cannibalism (Allow capturing allies)
        if self.cannibalism_active == self.board.turn:
            for sq in chess.SQUARES:
                p = self.board.piece_at(sq)
                if p and p.color == self.board.turn:
                    for att in self.board.attacks(sq):
                        target = self.board.piece_at(att)
                        if target and target.color == self.board.turn and target.piece_type != chess.KING and att not in self.wall_squares:
                            moves.append(chess.Move(sq, att))
                
        my_spells = self.spells[self.board.turn]
        
        # Phase B & C Spells (1, 4, 6, 7, 8, 10, 11, 15, 16, 17, 18)
        if my_spells.get(1, 0) > 0: # Cannibalism
            # Send a dummy target to keep action space size intact, JS ignores it
            for sq in chess.SQUARES:
                piece = self.board.piece_at(sq)
                if piece and piece.color == self.board.turn:
                    moves.append(SpellAction(1, target1=sq))
                    break
                    
        if my_spells.get(4, 0) > 0: # Sidestep
            for sq in chess.SQUARES:
                p = self.board.piece_at(sq)
                if p and p.color == self.board.turn and sq not in self.wall_squares:
                    file, rank = chess.square_file(sq), chess.square_rank(sq)
                    for df in [-1, 0, 1]:
                        for dr in [-1, 0, 1]:
                            if df == 0 and dr == 0: continue
                            nf, nr = file + df, rank + dr
                            if 0 <= nf <= 7 and 0 <= nr <= 7:
                                dest = chess.square(nf, nr)
                                dest_p = self.board.piece_at(dest)
                                if (not dest_p or dest_p.color != self.board.turn) and dest not in self.wall_squares:
                                    moves.append(SpellAction(4, target1=sq, target2=dest))
                                    
        if my_spells.get(6, 0) > 0: # Swap
            my_pieces = []
            for sq in chess.SQUARES:
                p = self.board.piece_at(sq)
                if p and p.color == self.board.turn and p.piece_type != chess.KING and sq not in self.wall_squares:
                    my_pieces.append(sq)
            for i in range(len(my_pieces)):
                for j in range(i+1, len(my_pieces)):
                    moves.append(SpellAction(6, target1=my_pieces[i], target2=my_pieces[j]))
                    
        if my_spells.get(7, 0) > 0: # Sniper
            for sq in chess.SQUARES:
                p = self.board.piece_at(sq)
                if p and p.color == self.board.turn and p.piece_type == chess.BISHOP and sq not in self.wall_squares:
                    for att_sq in self.board.attacks(sq):
                        att_p = self.board.piece_at(att_sq)
                        if att_p and att_p.color != self.board.turn and att_sq not in self.wall_squares:
                            moves.append(SpellAction(7, target1=sq, target2=att_sq))
                            
        if my_spells.get(8, 0) > 0: # Wall
            for sq in chess.SQUARES:
                if not self.board.piece_at(sq):
                    moves.append(SpellAction(8, target1=sq))
                    
        if my_spells.get(10, 0) > 0: # Tornado
            for sq in chess.SQUARES:
                moves.append(SpellAction(10, target1=sq))
                
        if my_spells.get(11, 0) > 0: # Shield
            for sq in chess.SQUARES:
                piece = self.board.piece_at(sq)
                if piece and piece.color == self.board.turn:
                    moves.append(SpellAction(11, target1=sq))
                    
        if my_spells.get(15, 0) > 0: # Freeze
            for sq in chess.SQUARES:
                piece = self.board.piece_at(sq)
                if piece and piece.color != self.board.turn and sq not in self.wall_squares:
                    moves.append(SpellAction(15, target1=sq))
                    
        if my_spells.get(16, 0) > 0: # Trap
            for sq in chess.SQUARES:
                if not self.board.piece_at(sq) and sq not in self.wall_squares:
                    moves.append(SpellAction(16, target1=sq))
                    
        if my_spells.get(17, 0) > 0: # Teleport
            back_rank_y = 0 if self.board.turn == chess.WHITE else 7
            back_rank = [chess.square(f, back_rank_y) for f in range(8)]
            empty_back_rank = [sq for sq in back_rank if not self.board.piece_at(sq)]
            for sq in chess.SQUARES:
                p = self.board.piece_at(sq)
                if p and p.color == self.board.turn and sq not in self.wall_squares:
                    for dest in empty_back_rank:
                        moves.append(SpellAction(17, target1=sq, target2=dest))
                        
        if my_spells.get(18, 0) > 0: # Kamikaze
            for sq in chess.SQUARES:
                piece = self.board.piece_at(sq)
                if piece and piece.color == self.board.turn and piece.piece_type != chess.KING and sq not in self.wall_squares:
                    moves.append(SpellAction(18, target1=sq))

        # Phase D Spells (2, 3, 5, 9, 12, 13, 14, 19, 20)
        if my_spells.get(2, 0) > 0: # Double Trouble
            moves.append(SpellAction(2))
            
        if my_spells.get(3, 0) > 0: # Domi Reversi
            for sq in chess.SQUARES:
                piece = self.board.piece_at(sq)
                if piece and piece.color != self.board.turn and piece.piece_type != chess.KING:
                    moves.append(SpellAction(3, target1=sq))
                    
        if my_spells.get(5, 0) > 0: # Ghost
            moves.append(SpellAction(5))
            
        if my_spells.get(9, 0) > 0: # Revive
            my_pieces_count = len([p for p in self.board.piece_map().values() if p.color == self.board.turn])
            if my_pieces_count < 16:
                moves.append(SpellAction(9))
            
        if my_spells.get(12, 0) > 0: # Leap Frog
            moves.append(SpellAction(12))
            
        if my_spells.get(13, 0) > 0: # Mirror
            moves.append(SpellAction(13))
            
        if my_spells.get(14, 0) > 0: # Sacrifice (Destroy piece -> Promote Pawn to it)
            # Simplification: Destroy a piece, turn one pawn into it
            my_pieces = []
            my_pawns = []
            for sq in chess.SQUARES:
                p = self.board.piece_at(sq)
                if p and p.color == self.board.turn:
                    if p.piece_type != chess.KING and p.piece_type != chess.PAWN:
                        my_pieces.append(sq)
                    elif p.piece_type == chess.PAWN:
                        my_pawns.append(sq)
            for p_sq in my_pieces:
                for pawn_sq in my_pawns:
                    moves.append(SpellAction(14, target1=p_sq, target2=pawn_sq))
                    
        if my_spells.get(19, 0) > 0: # Assassin
            moves.append(SpellAction(19))
            
        if my_spells.get(20, 0) > 0: # Promotion
            moves.append(SpellAction(20))
                    
        return moves
        
    def step(self, action):
        turn_advanced = True
        
        if isinstance(action, chess.Move):
            target_sq = action.to_square
            
            # If using pseudo-legal move from Leap Frog, force it on the board
            # Standard python-chess push() asserts legality, so we might need to bypass it or set piece manually.
            # We will use set_piece_at to bypass strict move rules.
            p = self.board.piece_at(action.from_square)
            self.board.remove_piece_at(action.from_square)
            self.board.set_piece_at(target_sq, p)
            
            # Apply Trap if triggered
            if target_sq == self.trap_square[self.board.turn]:
                self.board.remove_piece_at(target_sq)
                self.trap_square[self.board.turn] = None
                
        elif isinstance(action, SpellAction):
            self.spells[self.board.turn][action.spell_id] -= 1
            
            if action.spell_id == 1:
                self.cannibalism_active = self.board.turn
                turn_advanced = False
            elif action.spell_id == 2: # Double Trouble
                self.double_trouble_turns = 1 # 1 extra turn
                turn_advanced = False
            elif action.spell_id == 3: # Domi Reversi
                p = self.board.piece_at(action.target1)
                self.domi_reversi_target = action.target1
                self.domi_reversi_original_color = p.color
                self.domi_reversi_wait = True
                p.color = self.board.turn
                self.board.set_piece_at(action.target1, p)
            elif action.spell_id == 4:
                p = self.board.piece_at(action.target1)
                self.board.remove_piece_at(action.target1)
                self.board.set_piece_at(action.target2, p)
            elif action.spell_id == 5: # Ghost
                self.ghost_active = self.board.turn
                turn_advanced = False
            elif action.spell_id == 6:
                p1 = self.board.piece_at(action.target1)
                p2 = self.board.piece_at(action.target2)
                self.board.remove_piece_at(action.target1)
                self.board.remove_piece_at(action.target2)
                self.board.set_piece_at(action.target1, p2)
                self.board.set_piece_at(action.target2, p1)
            elif action.spell_id == 7:
                self.board.remove_piece_at(action.target2)
            elif action.spell_id == 8:
                self.board.set_piece_at(action.target1, chess.Piece(chess.PAWN, chess.WHITE))
                self.wall_squares[action.target1] = 4
            elif action.spell_id == 9: # Revive
                # Pick first empty square
                for sq in chess.SQUARES:
                    if not self.board.piece_at(sq) and sq not in self.wall_squares:
                        self.board.set_piece_at(sq, chess.Piece(chess.PAWN, self.board.turn))
                        break
                turn_advanced = False
            elif action.spell_id == 10:
                sqs, pieces = [], []
                file, rank = chess.square_file(action.target1), chess.square_rank(action.target1)
                for f in range(max(0, file-1), min(8, file+2)):
                    for r in range(max(0, rank-1), min(8, rank+2)):
                        s = chess.square(f, r)
                        p = self.board.piece_at(s)
                        if p and s not in self.wall_squares:
                            sqs.append(s)
                            pieces.append(p)
                random.shuffle(pieces)
                for s in sqs: self.board.remove_piece_at(s)
                for s, p in zip(sqs, pieces):
                    # Auto-promote if pawn reached the end via Tornado
                    if p.piece_type == chess.PAWN:
                        if chess.square_rank(s) == 0 or chess.square_rank(s) == 7:
                            p = chess.Piece(chess.QUEEN, p.color)
                    self.board.set_piece_at(s, p)
            elif action.spell_id == 11:
                self.shielded_square = action.target1
                turn_advanced = False
            elif action.spell_id == 12: # Leap frog
                self.leap_frog_active = self.board.turn
                turn_advanced = False
            elif action.spell_id in [13, 19, 20]:
                # Handled via buff state in JS, Python just keeps turn
                turn_advanced = False
            elif action.spell_id == 14: # Sacrifice
                p_type = self.board.piece_at(action.target1).piece_type
                self.board.remove_piece_at(action.target1)
                self.board.set_piece_at(action.target2, chess.Piece(p_type, self.board.turn))
            elif action.spell_id == 15:
                self.frozen_square = action.target1
                turn_advanced = False
            elif action.spell_id == 16:
                self.trap_square[self.board.turn] = action.target1
            elif action.spell_id == 17:
                p = self.board.piece_at(action.target1)
                self.board.remove_piece_at(action.target1)
                self.board.set_piece_at(action.target2, p)
            elif action.spell_id == 18:
                file, rank = chess.square_file(action.target1), chess.square_rank(action.target1)
                for f in range(max(0, file-1), min(8, file+2)):
                    for r in range(max(0, rank-1), min(8, rank+2)):
                        s = chess.square(f, r)
                        p = self.board.piece_at(s)
                        if p and p.piece_type != chess.KING and s not in self.wall_squares:
                            self.board.remove_piece_at(s)
                            
        if turn_advanced:
            if self.double_trouble_turns > 0:
                self.double_trouble_turns -= 1
            else:
                self.board.turn = not self.board.turn
                
            # Revert Domi Reversi
            if self.domi_reversi_target is not None:
                if self.domi_reversi_wait:
                    self.domi_reversi_wait = False
                else:
                    p = self.board.piece_at(self.domi_reversi_target)
                    if p:
                        p.color = self.domi_reversi_original_color
                        self.board.set_piece_at(self.domi_reversi_target, p)
                    self.domi_reversi_target = None
                    self.domi_reversi_original_color = None
                    self.domi_reversi_wait = False

            self.frozen_square = None
            self.shielded_square = None
            self.ghost_active = None
            self.leap_frog_active = None
            self.cannibalism_active = None
            
            to_remove = []
            for sq in self.wall_squares:
                self.wall_squares[sq] -= 1
                if self.wall_squares[sq] <= 0:
                    to_remove.append(sq)
            for sq in to_remove:
                del self.wall_squares[sq]
                self.board.remove_piece_at(sq)
                
        # Global Auto-Promote (Handles pawns reaching the end via ANY spell like Teleport, Tornado, Swap, Leapfrog)
        for sq in chess.SQUARES:
            p = self.board.piece_at(sq)
            if p and p.piece_type == chess.PAWN:
                if chess.square_rank(sq) == 0 or chess.square_rank(sq) == 7:
                    self.board.set_piece_at(sq, chess.Piece(chess.QUEEN, p.color))
                    
        done = self.board.is_game_over()
        if not self.board.king(chess.WHITE):
            return self.get_state(), (-1 if self.board.turn == chess.WHITE else 1), True
        if not self.board.king(chess.BLACK):
            return self.get_state(), (-1 if self.board.turn == chess.BLACK else 1), True

        reward = 0
        if done:
            res = self.board.result(claim_draw=True)
            if res == '1-0': reward = 1 if self.board.turn == chess.WHITE else -1
            elif res == '0-1': reward = 1 if self.board.turn == chess.BLACK else -1
            
        return self.get_state(), reward, done

    def get_heuristic_value(self):
        # A simple material and spell evaluator to fallback when NN is poorly trained
        val = 0
        piece_values = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0}
        for sq, piece in self.board.piece_map().items():
            if piece.color == chess.WHITE: val += piece_values[piece.piece_type]
            else: val -= piece_values[piece.piece_type]
            
        # Add slight spell advantage
        white_spells = sum(self.spells[chess.WHITE].values())
        black_spells = sum(self.spells[chess.BLACK].values())
        val += (white_spells - black_spells) * 0.5
        
        return max(-1.0, min(1.0, val / 20.0))
