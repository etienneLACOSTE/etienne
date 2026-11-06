import sys
import os
import torch
import chess
from chess_env import ChesspellEnv, move_to_int, SpellAction
from model import ChesspellNet
from mcts import MCTS

env = ChesspellEnv()
env.board.set_fen("rnbqkbnp/pprppppp/8/4N3/8/8/PPPPPPPP/RNBQKB1R b - - 0 1")

# Simulate API
last_played_spell = 6
white_spells = {'13': 1}
black_spells = {'13': 1}

env.spells[chess.WHITE] = {int(k): v for k, v in white_spells.items()}
env.spells[chess.BLACK] = {int(k): v for k, v in black_spells.items()}

if last_played_spell is not None:
    for color in [chess.WHITE, chess.BLACK]:
        if 13 in env.spells[color] and env.spells[color][13] > 0:
            env.spells[color][13] -= 1
            env.spells[color][last_played_spell] = env.spells[color].get(last_played_spell, 0) + 1

legal = env.get_legal_moves()
print("Legal moves contains 13:", any(isinstance(m, SpellAction) and m.spell_id == 13 for m in legal))
print("Legal moves contains 6:", any(isinstance(m, SpellAction) and m.spell_id == 6 for m in legal))
