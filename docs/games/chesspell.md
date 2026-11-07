# Ches'spell

Ches'spell est un jeu d'échecs magique moderne. En plus des pièces d'échecs classiques, chaque joueur possède un deck de sorts magiques qui permettent d'altérer le plateau, d'invoquer des murs, de téléporter des pièces, ou d'inverser le cours du temps !

## 🎮 Comment Jouer

Le jeu inclut plusieurs modes de jeu :
- **Online Multiplayer** : Jouez avec vos amis à distance avec des codes de salon.
- **Local Game** : Jouez à deux joueurs sur le même ordinateur.
- **Campaign Mode** : Affrontez l'Intelligence Artificielle (AlphaZero) en difficulté croissante !

## 🚀 Installation & Lancement

Le mode Campagne utilise l'IA Python si elle tourne, sinon un bot JavaScript intégré prend le relais.

### 1. Démarrer le serveur web (interface et multijoueur)
Depuis la racine du projet :
```bash
npm install
npm start
```
*Le jeu est accessible sur http://localhost:3000/chesspell/.*

### 2. (Optionnel) Démarrer l'IA (AlphaZero)
Dans un deuxième terminal :
```bash
cd ai/chesspell
source venv/bin/activate
python3 api.py
```
*L'IA écoute sur le port 5000. Le modèle `chesspell_model.pth` n'est pas versionné (trop lourd) : il doit être présent dans `ai/chesspell/`.*

### Fichiers
- `games/chesspell/rules.js` : déplacements des pièces (sans échec : le roi se capture)
- `games/chesspell/game.js` : tours, coups et les 20 sorts, sans DOM ; partagé avec le serveur, qui arbitre les parties en ligne (`server/chesspell.js`)
- `games/chesspell/js/` : interface (affichage, bot, tutoriel, jeu en ligne)
- `ai/chesspell/` : IA Python (MCTS + réseau de neurones, entraînement par self-play)
- `tools/chesspell/train_spells.js` : algorithme génétique pour les heuristiques de sorts du bot JS

## 🛠️ Technologies
- **Frontend** : Vanilla JS, HTML5, CSS3, Socket.io
- **Backend Web** : Node.js, Express
- **Backend IA** : Python 3, PyTorch, Flask, Algorithme Monte Carlo Tree Search (AlphaZero)
