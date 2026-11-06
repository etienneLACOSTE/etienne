import torch
import chess
import numpy as np
from chess_env import ChesspellEnv, move_to_int, SpellAction

env = ChesspellEnv()
env.board.set_fen("rnbqkbnp/pprppppp/8/4N3/8/8/PPPPPPPP/RNBQKB1R b - - 0 1")

# Black has 13.
env.spells[chess.WHITE] = {}
env.spells[chess.BLACK] = {13: 1}

last_played_spell = 6
if last_played_spell is not None:
    for color in [chess.WHITE, chess.BLACK]:
        if 13 in env.spells[color] and env.spells[color][13] > 0:
            env.spells[color][13] -= 1
            env.spells[color][last_played_spell] = env.spells[color].get(last_played_spell, 0) + 1

legal = env.get_legal_moves()
print("Legal moves contains 13:", any(isinstance(m, SpellAction) and m.spell_id == 13 for m in legal))
print("Legal moves contains 6:", any(isinstance(m, SpellAction) and m.spell_id == 6 for m in legal))

class DummyModel:
    def __init__(self):
        self.device = torch.device('cpu')
    def parameters(self):
        return iter([torch.nn.Parameter(torch.zeros(1))])
    def __call__(self, state):
        return torch.ones((1, 4172)), torch.zeros((1, 1))

from mcts import MCTS
mcts = MCTS(DummyModel(), num_simulations=2, add_noise=False)
counts = mcts.search(env)
for m in counts:
    if isinstance(m, SpellAction):
        print(f"MCTS considered spell: {m.spell_id}")
