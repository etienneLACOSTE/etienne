# Ches'spell

Ches'spell est un jeu d'échecs magique moderne. En plus des pièces d'échecs classiques, chaque joueur possède un deck de sorts magiques qui permettent d'altérer le plateau, d'invoquer des murs, de téléporter des pièces, ou d'inverser le cours du temps !

## 🎮 Comment Jouer

Le jeu inclut plusieurs modes de jeu :
- **Online Multiplayer** : Jouez avec vos amis à distance avec des codes de salon.
- **Local Game** : Jouez à deux joueurs sur le même ordinateur.
- **Campaign Mode** : affrontez le bot en difficulté croissante (curseur ELO) !

## 🚀 Installation & Lancement

Le mode Campagne oppose le joueur au bot JavaScript `games/chesspell/bot.js` (sans DOM, partagé avec l'entraîneur) :
- sous 1000 ELO, il choisit ses sorts avec les règles d'origine (`heuristicSpell`, une règle par sort) et joue parfois au hasard ;
- à partir de 1000 ELO, il essaie chaque carte et chaque cible sur une copie de la partie (via `game.js`, donc avec les vraies règles), puis cherche les réponses (alpha-bêta, quiescence) ; une carte en main a une valeur, il ne la joue que si elle rapporte plus. Profondeur 2 à 4 selon l'ELO, 1,5 s de réflexion au plus.

Le profil entraîné est lu dans `games/chesspell/training_data.json` (sans lui, le bot utilise le profil standard `DEFAULT_PROFILE`). Profil adopté le 2026-11-09 : 97 générations à profondeur 2, puis 50 à profondeur 3. À profondeur 3, sur les mêmes 400 parties, il marque 65,8 % contre le profil standard et 84,1 % contre le bot d'origine, où le profil standard marque 80,6 %.

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
- `tools/chesspell/train_spells.js` : entraînement génétique du bot (valeurs des pièces, termes positionnels, valeur de chaque carte), parties complètes avec `game.js` et `bot.js` ; `spell_heuristics.json` est la sortie de l'ancien entraîneur (sur une copie des règles), plus utilisée

## 🛠️ Technologies
- **Frontend** : Vanilla JS, HTML5, CSS3, Socket.io
- **Backend Web** : Node.js, Express
- **Backend IA** : Python 3, PyTorch, Flask, Algorithme Monte Carlo Tree Search (AlphaZero)
