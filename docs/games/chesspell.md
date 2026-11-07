# Ches'spell

Ches'spell est un jeu d'échecs magique moderne. En plus des pièces d'échecs classiques, chaque joueur possède un deck de sorts magiques qui permettent d'altérer le plateau, d'invoquer des murs, de téléporter des pièces, ou d'inverser le cours du temps !

## 🎮 Comment Jouer

Le jeu inclut plusieurs modes de jeu :
- **Online Multiplayer** : Jouez avec vos amis à distance avec des codes de salon.
- **Local Game** : Jouez à deux joueurs sur le même ordinateur.
- **Campaign Mode** : Affrontez l'Intelligence Artificielle (AlphaZero) en difficulté croissante !

## 🚀 Installation & Lancement

Le mode Campagne oppose le joueur au bot JavaScript intégré (minimax avec heuristiques de sorts) ; le curseur ELO règle sa profondeur de calcul et sa part de coups au hasard.

### 1. Démarrer le serveur web (interface et multijoueur)
Depuis la racine du projet :
```bash
npm install
npm start
```
*Le jeu est accessible sur http://localhost:3000/chesspell/.*

### IA Python (mise de côté)
`ai/chesspell/` contient une IA de type AlphaZero (MCTS + réseau de neurones). Elle n'est plus appelée par le jeu depuis le 2026-11-07 : elle suit les règles des échecs classiques (pas celles de Ches'spell) et ne pouvait tourner que sur la machine du visiteur. Le dossier reste comme projet de recherche ; le modèle `chesspell_model.pth` n'est pas versionné.

### Fichiers
- `games/chesspell/rules.js` : déplacements des pièces (sans échec : le roi se capture)
- `games/chesspell/game.js` : tours, coups et les 20 sorts, sans DOM ; partagé avec le serveur, qui arbitre les parties en ligne (`server/chesspell.js`)
- `games/chesspell/js/` : interface (affichage, bot, tutoriel, jeu en ligne)
- `ai/chesspell/` : IA Python mise de côté (MCTS + réseau de neurones, self-play)
- `tools/chesspell/train_spells.js` : algorithme génétique pour les heuristiques de sorts du bot JS

## 🛠️ Technologies
- **Frontend** : Vanilla JS, HTML5, CSS3, Socket.io
- **Backend Web** : Node.js, Express
- **Backend IA** : Python 3, PyTorch, Flask, Algorithme Monte Carlo Tree Search (AlphaZero)
