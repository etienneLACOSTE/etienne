import math
import numpy as np
import torch
import copy
import chess
from chess_env import ChesspellEnv, move_to_int

class Node:
    def __init__(self, prior, parent=None, move=None):
        self.prior = prior         # P(s, a) from neural net
        self.parent = parent       # Parent node
        self.move = move           # Move that led to this node
        self.children = {}         # move_int -> Node
        self.visits = 0            # N(s, a)
        self.value_sum = 0         # W(s, a)
        self.state = None          # Environment state at this node (for root mostly)

    def q_value(self):
        if self.visits == 0:
            return 0
        return self.value_sum / self.visits

    def expand(self, action_probs, valid_moves):
        # action_probs is a dict of move_int -> probability
        for move in valid_moves:
            m_int = move_to_int(move)
            if m_int not in self.children:
                prob = action_probs.get(m_int, 0.0)
                self.children[m_int] = Node(prior=prob, parent=self, move=move)

    def is_expanded(self):
        return len(self.children) > 0

class MCTS:
    def __init__(self, model, num_simulations=100, c_puct=1.5, add_noise=True):
        self.model = model
        self.num_simulations = num_simulations
        self.c_puct = c_puct
        self.add_noise = add_noise
        self.device = next(model.parameters()).device

    def search(self, env):
        root = Node(prior=1.0)
        
        # We need to copy the environment so simulations don't mess up the actual game
        for _ in range(self.num_simulations):
            node = root
            sim_env = env.copy()
            done = False
            reward = 0
            
            # Check if root is already done
            if not sim_env.board.king(chess.WHITE) or not sim_env.board.king(chess.BLACK) or sim_env.board.is_game_over():
                done = True
                if not sim_env.board.king(chess.WHITE):
                    reward = -1 if sim_env.board.turn == chess.WHITE else 1
                elif not sim_env.board.king(chess.BLACK):
                    reward = -1 if sim_env.board.turn == chess.BLACK else 1
                else:
                    res = sim_env.board.result(claim_draw=True)
                    if res == '1-0': reward = 1 if sim_env.board.turn == chess.WHITE else -1
                    elif res == '0-1': reward = 1 if sim_env.board.turn == chess.BLACK else -1
            
            # 1. Selection
            while node.is_expanded() and not done:
                best_score = -float('inf')
                best_action = None
                best_child = None
                
                for m_int, child in node.children.items():
                    # PUCT Formula
                    u = self.c_puct * child.prior * math.sqrt(node.visits + 1e-8) / (1 + child.visits)
                    # Note: AlphaZero uses -Q for the opponent's perspective, but our NN outputs 
                    # value from the current player's perspective if we pass the current board.
                    # Since our simplistic model just outputs White's advantage, we would need to negate it for Black.
                    # For this prototype, we'll assume q_value is relative to the active player.
                    q = child.q_value()
                    
                    # If it's black's turn in the simulation, we negate the value (assuming Q is white-relative)
                    if not sim_env.board.turn: # False = Black
                        q = -q
                        
                    score = q + u
                    if score > best_score:
                        best_score = score
                        best_action = child.move
                        best_child = child
                        
                node = best_child
                _, reward, done = sim_env.step(best_action)
                
            # 2. Evaluation & Expansion
            if not done:
                state_tensor = sim_env.get_state()
                state_t = torch.tensor(state_tensor, dtype=torch.float32).unsqueeze(0).to(self.device)
                with torch.no_grad():
                    policy_logits, value = self.model(state_t)
                    
                # Convert logits to probabilities
                policy_probs = torch.softmax(policy_logits, dim=1).cpu().numpy()[0]
                nn_value = value.item()
                heuristic_value = sim_env.get_heuristic_value()
                
                # Blend NN value with Heuristic value to compensate for the poorly trained model
                value = (nn_value * 0.2) + (heuristic_value * 0.8)
                
                # Get legal moves and mask policy
                legal_moves = sim_env.get_legal_moves()
                action_probs = {move_to_int(m): policy_probs[move_to_int(m)] for m in legal_moves}
                
                # Normalize valid probabilities
                sum_probs = sum(action_probs.values())
                if sum_probs > 0:
                    action_probs = {k: v / sum_probs for k, v in action_probs.items()}
                else:
                    # Fallback if network gave 0 to all valid moves
                    action_probs = {move_to_int(m): 1.0 / len(legal_moves) for m in legal_moves}
                    
                node.expand(action_probs, legal_moves)
                
                # Add Dirichlet Noise to root for exploration
                if node == root and self.add_noise:
                    noise = np.random.dirichlet([0.3] * len(legal_moves))
                    for i, m_int in enumerate(node.children.keys()):
                        node.children[m_int].prior = (0.75 * node.children[m_int].prior) + (0.25 * noise[i])
            else:
                # Terminal state: Convert reward (relative to current player) to White's advantage
                value = reward if sim_env.board.turn == chess.WHITE else -reward

            # 3. Backpropagation
            # Propagate the value up the tree
            curr = node
            while curr is not None:
                curr.visits += 1
                curr.value_sum += value
                curr = curr.parent

        # Return the move visitation counts to use as our improved policy
        action_counts = {child.move: child.visits for child in root.children.values()}
        return action_counts
