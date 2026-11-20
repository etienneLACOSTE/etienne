# Chessdown : niveaux des pièces (mode All Star)

Spécification décidée avec le propriétaire du projet (2026-11-20 et 2026-11-21). Elle
fait foi pour le moteur (`games/chessdown/engine.js`), le bot, le serveur et l'interface.
Rien n'est encore codé : la feuille de route est dans `docs/games/chessdown.md`.

## Décisions

Points tranchés le 2026-11-21 :

- **Fou, niveaux 1 et 2 :** portée plus courte que la tour, car une diagonale va plus
  loin : **2 puis 4 cases** (proposé, à confirmer).
- **Fou, niveaux 4 et 5 :** au niveau 4, il saute une pièce de son camp ; au niveau 5, il
  fait aussi un pas d'une case en ligne droite, sans manger.
- **Dame, niveau 5 :** la ligne de vue se calcule comme un rayon lumineux (jeux de
  tactique sur grille), dans n'importe quel angle (voir « Ligne de vue »).
- **Pion niveau 5 :** il ne se transforme qu'en une pièce autre qu'un pion. Prendre un
  pion, y compris en passant, le laisse pion de niveau 5.
- **La transformation ne dure que le temps de la partie :** dans le club, le joueur
  reste un pion, avec son nom et son expérience ; ses transformations sont comptées dans
  ses stats.
- **Le niveau ne redescend jamais,** même quand le malus de -3 fait passer l'expérience
  sous le palier atteint.
- **+3 d'expérience** pour chaque pièce encore sur le terrain à la fin d'une partie
  gagnée.

## Principes

- **Cinq niveaux, affichés en étoiles** (1 à 5). Le niveau 3 correspond à la pièce des
  échecs classiques. Les niveaux 1 et 2 la brident, les niveaux 4 et 5 lui donnent un
  bonus.
- **Les capacités s'additionnent :** une pièce garde tout ce que lui donnent les niveaux
  inférieurs à partir du niveau 3. Aux niveaux 1 et 2, les brides remplacent le
  déplacement normal.
- **Le mode Classique = toutes les pièces au niveau 3** (le roi est toujours au
  niveau 5). C'est le même moteur, sans aucun changement de règles.
- **Le roi ne change jamais :** pièce 5 étoiles, déplacement normal, coût 0. Il ne gagne
  pas d'expérience, mais ses stats sont comptées dans le registre.
- **Pas d'échec ni de mat** (règle de Chessdown) : les déplacements ci-dessous ne
  tiennent jamais compte de la sécurité du roi.
- **Toute pièce, à tout niveau, peut marquer un touchdown.**
- **« Sans manger »** veut dire que la case d'arrivée doit être vide.

Les schémas regardent vers l'adversaire (le haut est l'avant). `P` est la pièce, `A`
une arrivée possible, `x` une case qui doit être libre, `o` une case qui peut être
occupée (la pièce saute par-dessus).

## Pion

| Niveau | Déplacement | Prise |
|---|---|---|
| 1 | 1 case vers l'avant | **aucune** |
| 2 | 1 case vers l'avant | en diagonale vers l'avant, **pas en passant** |
| 3 | normal : 1 case, ou 2 au premier coup | normale, en passant compris |
| 4 | au premier coup, au choix 1, 2 ou **3 cases**, chemin libre | normale |
| 5 | comme le niveau 4 | normale, puis **transformation** |

- **En passant contre un pas de 3 (niveau 4 ou 5) :** un pion adverse de niveau 3 ou plus
  peut le prendre sur l'une ou l'autre des cases traversées, au coup qui suit
  immédiatement.
- **La transformation (niveau 5) est obligatoire :** après la prise d'un cavalier, d'un
  fou, d'une tour ou d'une dame, le pion devient la pièce prise, au niveau 3. Le joueur
  n'a rien à choisir. Prendre un pion (même en passant) ne le transforme pas. Prendre le
  roi termine la partie.

```
Niveau 4, premier coup        Niveau 5 qui prend un cavalier
 A                             . C'   (C' = cavalier niveau 3)
 A                             P .
 A
 P
```

## Cavalier

Le L se lit toujours ainsi : **2 cases dans une direction, puis 1 case sur le côté.**

| Niveau | Déplacement |
|---|---|
| 1 | le L **sans sauter** : les 2 cases droites doivent être libres. L'arrivée peut être une prise. |
| 2 | **une case droite, puis une diagonale** : seule la première case droite doit être libre. |
| 3 | normal : il saute par-dessus tout |
| 4 | + **saut de 3 cases en ligne droite** (4 directions), par-dessus tout, **sans manger** |
| 5 | + **saut de 2 cases en diagonale** (4 directions), par-dessus tout, **sans manger** |

```
Niveau 1 (2 vers le haut, puis 1 à droite)    Niveau 2 (même arrivée)
 x A                                           . A
 x .                                           x .
 P .                                           P .

Niveau 4 (saut droit, en plus du L)           Niveau 5 (saut diagonal, en plus)
 A                                             A . A
 o                                             . o .
 o                                             . P .
 P
```

## Tour

| Niveau | Déplacement |
|---|---|
| 1 | en ligne droite, **3 cases au plus** |
| 2 | en ligne droite, **6 cases au plus** |
| 3 | normale |
| 4 | + **saut d'une pièce de son camp :** elle glisse jusqu'à une pièce alliée, la saute et **atterrit juste derrière**, **sans manger** |
| 5 | + le même saut **peut manger** une pièce adverse juste derrière l'alliée |

```
Niveau 4 / 5
 A     ← niveau 4 : case vide ; niveau 5 : vide ou pièce adverse
 o     ← pièce de son camp (on ne saute jamais une pièce adverse)
 x
 P
```

## Fou

| Niveau | Déplacement |
|---|---|
| 1 | en diagonale, **2 cases au plus** (à confirmer) |
| 2 | en diagonale, **4 cases au plus** (à confirmer) |
| 3 | normal |
| 4 | + **saut d'une pièce de son camp,** comme la tour niveau 4 : atterrit juste derrière, **sans manger** |
| 5 | + **un pas d'une case en ligne droite,** **sans manger** : il peut ainsi changer de couleur de case |

## Dame

| Niveau | Déplacement |
|---|---|
| 1 | comme une dame, **4 cases au plus** (« cercle de rayon 4 ») |
| 2 | comme une dame, **6 cases au plus** |
| 3 | normale |
| 4 | + **saut de cavalier** (comme un cavalier niveau 3), **sans manger** |
| 5 | + **téléportation au contact de son roi :** sur l'une des 4 cases voisines du roi (haut, bas, gauche, droite), au choix, si son roi est **dans son champ de vision** (voir « Ligne de vue »). **Sans manger.** |

```
Niveau 5 : la dame (D) voit son roi (R), dans n'importe quel angle
 . A .
 A R A      ← les 4 arrivées possibles, si elles sont vides
 . A . .
 . . . . .
 . . . . . . D
```

### Ligne de vue

Comme un rayon lumineux dans un jeu de tactique sur grille. On trace le segment qui
va **du centre de la case de la dame au centre de la case du roi.** Le roi est visible
si **aucune autre pièce** n'occupe une case dont le segment traverse l'intérieur.

- Un segment qui passe **exactement par un coin** entre deux cases ne traverse aucune
  des deux : il n'est pas bloqué par elles.
- Les cases de la dame et du roi ne comptent pas.
- Le calcul se fait en nombres entiers (coordonnées doublées), sans arrondi, pour que
  le navigateur, le serveur et le bot donnent toujours la même réponse.

```
 . . * R      Le roi est 3 cases à droite et 2 vers le haut. Le segment D→R
 . * * .      traverse les cases marquées * : une pièce sur l'une d'elles
 D * . .      cache le roi. Les autres cases ne gênent pas.
```

En diagonale exacte, le segment ne passe que par des coins et par les cases de la
diagonale elle-même : seules ces cases-là peuvent cacher le roi.

## Roi

Toujours au niveau 5 (5 étoiles) : une case dans toutes les directions. Coût 0, pas
d'expérience, stats comptées.

## Coût en points de draft

Budget : 39 points, comme aujourd'hui.

| Pièce | Niv. 1 | Niv. 2 | Niv. 3 | Niv. 4 | Niv. 5 |
|---|---|---|---|---|---|
| Pion | 1 | 1 | 1 | 2 | 2 |
| Cavalier | 2 | 2 | 3 | 4 | 4 |
| Fou | 2 | 2 | 3 | 4 | 4 |
| Tour | 3 | 4 | 5 | 6 | 6 |
| Dame | 7 | 8 | 9 | 10 | 11 |
| Roi | 0 (toujours niveau 5) |

## Expérience

- **Elle ne se gagne qu'en campagne** (contre le bot). Ni le mode Classique, ni les
  parties en ligne, ni les parties sur le même écran n'en donnent.
- **Ce qui rapporte, pour chaque joueur nommé de la composition :**
  - +1 par déplacement (téléportation et sauts compris) ;
  - +5 par prise ;
  - +10 par touchdown marqué ;
  - +3 s'il est encore sur le terrain à la fin d'une partie gagnée.
- **Ce qui coûte :** -3 quand la pièce est prise. L'expérience ne descend jamais sous 0,
  et le niveau ne redescend jamais.
- **Paliers :**

| Niveau | Expérience totale |
|---|---|
| 1 | 0 |
| 2 | 20 |
| 3 | 60 |
| 4 | 200 |
| 5 | 500 |

- **Calcul :** l'expérience est comptée à la fin de chaque partie (chaque manche d'un
  best of 3). Le nouveau niveau compte à partir de la partie suivante, jamais en cours de
  partie.

## Affichage des niveaux

- **Les étoiles (1 à 5) se voient :**
  - sur les pièces pendant la draft ;
  - dans le registre du club ;
  - pendant les premières secondes du match, jusqu'au premier coup ;
  - ensuite, au survol ou au focus clavier d'une pièce, la sienne comme celle de
    l'adversaire.
- **Accessibilité :** le niveau fait partie de l'étiquette de la case (par exemple
  « e2 : ta tour, niveau 2 »). Les étoiles ne sont jamais la seule information.

## Cas limites

- **Le touchdown** se vérifie comme aujourd'hui, quel que soit le niveau. Une tour
  niveau 1 met plus de tours à traverser le terrain de 12 rangées : c'est le but.
- **Une pièce transformée** (pion niveau 5) se déplace comme une pièce de niveau 3 de son
  nouveau type. Dans le récit des coups pour les lecteurs d'écran, elle garde son nom de
  joueur.
- **La répétition de position (nulle par triple répétition)** tient compte du type et
  du niveau des pièces.
- **Le bot** reçoit les niveaux comme le joueur. Il faudra le réentraîner pour le mode
  All Star.
- **En ligne,** le serveur vérifie les déplacements avec les niveaux du club enregistré
  sur le serveur, jamais avec ceux que la page envoie.
