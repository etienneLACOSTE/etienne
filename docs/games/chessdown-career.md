# Chessdown : le mode carrière (spécification, en cours)

Décisions du propriétaire du 2026-11-21. Maquette : https://claude.ai/artifact/UoTHtDdS4uf72rC3DtD9Jg

## Expérience des quêtes (2026-11-21)

Une quête réussie qui donne de l'expérience donne **+5 XP à chaque pièce qui l'a jouée**
(`QUEST_XP`, `career-quests.js`) ; le roi n'en gagne pas. Les anciens bonus (jusqu'à 150 XP
pour tout le club) faisaient monter les niveaux trop vite. Les recrues et le maillot ne
changent pas.

## Principe

La carrière se joue avec son club All Star (`docs/games/chessdown-levels.md`). On y apprend
le jeu en jouant. La trame principale est le championnat ; autour, des quêtes annexes
servent à faire progresser ses joueurs et à en recruter.

## Décisions

- **Pas de relégation.** Si on rate la montée, on rejoue la saison de l'échelon.
- **Une carte où l'on se déplace.** On va chercher les quêtes dans des lieux : stades,
  bars, écoles, parcs, city-stades, mairie, fermes, ports…
  - Les quêtes principales sont marquées d'un **!** doré (l'ambre du Stade).
  - Les quêtes annexes sont marquées d'un **!** bleu. C'est une nouvelle couleur, `--quest-blue`
    (#3FA9F5), validée et ajoutée à DESIGN.md.
  - Les lieux verrouillés se débloquent avec la trame principale.
  - L'entraîneur suit les routes. Les cartes sont sinueuses et vivantes : rivières, voitures,
    trains, drapeaux.
- **La carte s'agrandit à chaque échelon**, et chaque échelon a son moyen de transport :

  | Carte | Échelon | Saison | Lieu de départ vers l'échelon suivant |
  |---|---|---|---|
  | Ville | Scolaire | tutoriel en 5 journées, puis la Coupe de la ville | gare routière (bus) |
  | Département | Départemental | 10 journées aller-retour | gare RER |
  | Région | Régional | 10 journées aller-retour | gare TGV |
  | Pays | National | 14 journées, puis la coupe | aéroport (avion) |
  | Monde | International | poules, puis élimination directe | – |

- **Pour passer à l'échelon suivant, il faut avoir fini le palier en cours.** Concrètement :
  - Le ticket du transport se gagne chaque saison en finissant dans le **top 3** de sa ligue.
  - Sans ticket, le lieu de transport refuse le voyage. Il explique que le ticket se gagne
    chaque saison par le top 3 de la ligue.
- **Les quêtes annexes :**
  - Un catalogue de nombreuses quêtes par palier : environ 24 au Scolaire, 30 au
    Départemental, 36 au Régional, 40 au National et 48 à l'International.
  - À chaque saison, quelques quêtes du catalogue sont **tirées au sort**.
  - Chaque quête ne peut être faite **qu'une fois par saison**.
  - Une quête réussie **disparaît définitivement** de la carrière. On ne peut donc pas
    « farmer » l'expérience.
- **Les clubs adverses sont créés une fois par carrière.** Ce sont des rivaux qu'on retrouve
  d'une saison à l'autre, avec un nom, un blason et un style de jeu. Le style vient des
  archétypes du bot : `ecuries`, `citadelle`, `chapiteau`, `chair`, `sorcieres`, `normal`.
- **Un seul écran, sans défilement** : la carte et la fiche du lieu ; le journal (trame principale, quêtes annexes) est derrière un onglet en haut.
- **Des entraîneurs adverses faciles à reconnaître.** Chacun a :
  - un portrait en pixel art ;
  - un surnom ;
  - un signe distinctif (béret, casquette et sifflet, chignon et perles…) ;
  - une phrase fétiche ;
  - un style de jeu qui correspond à son archétype.

  Exemples :
  - Gaston Normand « Le Prof » : classique ;
  - Tony Marchetti « Le Bulldozer » : des pions en masse ;
  - Hélène Duroc « La Citadelle » : des tours ;
  - les sœurs Vasseur « Les Sorcières » : des dames ;
  - Diego Ferrán « El Jinete » : des cavaliers.
- **Après l'International, les saisons continuent** : on défend son titre, et les quêtes se
  durcissent (effectif restreint, chrono plus court, adversaire avantagé).
- **Le mode actuel « Campagne » devient « Partie rapide »**, joué avec les pièces
  classiques. Le mot « campagne » est réservé à la carrière.

## Types de quêtes annexes

| Type | Exemple | Récompense |
|---|---|---|
| Défi à contrainte | gagner avec le roi et 3 pions | +5 XP par pièce engagée |
| Recrutement | marquer avec un cavalier pour qu'Inès signe | une recrue nommée, d'un niveau donné |
| Entraînement (problème) | touchdown en 3 coups depuis une position donnée | +5 XP pour la pièce du club qui le joue |
| Match à règle spéciale | chrono de 15 s, aucun recul (neige), placement inversé | +5 XP par pièce engagée |
| Série | 3 victoires d'affilée sans changer sa composition | +5 XP par pièce engagée |
| Cosmétique | gagner avec l'effectif d'origine | un maillot ou un emblème |

## À faire ou à préciser

1. **Écrire le catalogue des quêtes**, palier par palier, dans un module de données partagé.
   Chaque quête a : un identifiant stable, un lieu, une personne qui la donne, des
   contraintes, une récompense et des textes dans les 5 langues.
2. **Les règles spéciales de match** (aucun recul, effectif imposé, placement inversé,
   chrono court) : ce sont des options du moteur. Les règles du jeu en ligne ne changent pas.
3. **La sauvegarde de la carrière** : dans le navigateur, comme le club, en attendant All
   Star en ligne.
4. **Le classement de chaque ligue** : les matchs entre clubs adverses sont simulés, pour
   que le top 3 ait un sens.
5. **Les cartes** : elles sont dessinées par le code, avec une graine fixe par échelon, comme
   dans la maquette. Il n'y a donc pas d'image à charger. Elles doivent rester accessibles :
   - chaque lieu est un bouton ;
   - on peut aussi choisir un lieu dans une liste ;
   - les animations respectent la réduction des mouvements.

## Avancement

- **Étape 0 (faite)** : le mode contre le bot s'appelle « Partie rapide », et le club joue des
  « matchs amicaux ».
- **Étape 1 (faite)** : les règles de la carrière, sans interface, testées dans
  `tests/unit/chessdown-career.test.js` :
  - `career-coaches.js` : 34 entraîneurs rivaux, en réserves de 6 à 8 par échelon ;
  - `career-quests.js` : les lieux de chaque carte et 40 quêtes (8 par échelon, dont 2 qui
    n'ouvrent qu'à partir de la 2e saison dans l'échelon) ;
  - `career-rules.js` : les ligues, la simulation des autres matchs, le classement, les
    tickets, les voyages, le tirage des quêtes et la vérification d'une carrière enregistrée.

  Les ligues : 6 clubs en match simple au Scolaire (5 journées) ; 6 clubs en aller-retour au
  Départemental et au Régional (10 journées) ; 8 clubs en aller-retour au National
  (14 journées) ; à l'International, une poule de 4 puis 3 tours à élimination directe.

  Pas encore fait : la Coupe de la ville et la coupe nationale, et les textes des quêtes et
  des entraîneurs (ils viendront avec l'interface).

- **Étape 2 (faite)** : les règles spéciales de match dans le moteur
  (`games/chessdown/engine.js`), testées dans `tests/unit/chessdown-match-rules.test.js` :
  - `matchRules` : aucun recul (`noRetreat`, par joueur) et pas de prise pendant les N premiers
    coups (`noCaptureMoves`, en-passant compris). Les coups sont comptés par `applyMove` et
    `undoMove`, donc le bot respecte ces règles dans sa recherche.
  - `draftRows` : les 3 rangées arrière, ou les 3 plus proches du milieu (`invertedRows`).
  - `checkArmy` : vérifie l'armée d'un joueur (un roi, les rangées, une pièce par case, le
    budget avec le coût des niveaux, l'effectif imposé, les pièces interdites, le nombre
    maximum, les joueurs autorisés).
  - Le bot fait sa draft sans les pièces interdites (`draftArmy`, option `banned`).
  - Le chrono et la composition verrouillée relèvent du déroulé du match : ils seront
    branchés à l'étape 4. Sans `state.rules`, le moteur ne change pas, en ligne compris.
- **Étape 3 (faite)** : la carte et l'écran de carrière dans le jeu (`#career-screen`) :
  - `js/career-map.js` : les 5 cartes dessinées par le code, le réseau de routes, les
    déplacements (à pied, en bus, en avion) et l'animation (eau, voitures, trains, drapeaux).
    Avec la réduction des animations, rien ne bouge.
  - `js/career-view.js` : Gérard, l'échelle des niveaux et la carte avec un bouton par lieu.
    La fiche d'un lieu n'apparaît qu'à l'arrivée. Le transport demande le ticket. Le journal
    (classement, quêtes, trophées) est derrière un onglet.
  - `js/coach-portrait.js` : les portraits des rivaux. `js/career-store.js` : la carrière est
    gardée dans le navigateur (`pawnet.chessdown.career`) et effacée avec le club.
  - Les textes sont dans `strings/career/<langue>.js`, en 5 langues. Un test vérifie que
    chaque lieu, rival, quête, règle et récompense a son texte.
  - L'écran s'ouvre depuis la page du club, avec le bouton « Carrière » (depuis l'étape 4).
- **Étape 4 (faite)** : les matchs (`js/career-match.js`) :
  - le stade joue la journée suivante, en best of 3 avec 30 s par tour, contre l'armée du
    rival (son style, et un budget qui dépend de sa force) ;
  - une quête joue son match avec ses règles :
    - effectif imposé, pièces interdites et nombre maximum de pièces : le banc ne propose que
      les joueurs permis, et la draft est vérifiée (`checkArmy`) ;
    - rangées inversées, aucun recul, pas de prise pendant N coups, chrono ;
    - composition verrouillée (la même composition rejouée automatiquement) ;
    - série de victoires (des parties simples enchaînées) ;
  - à la fin, le résultat va dans la carrière : le classement, la quête réussie (elle disparaît)
    ou ratée, la récompense (XP, recrue à son niveau, recrue au choix choisie avant le match,
    maillot) ; en fin de saison, le rang, le ticket et le titre ;
  - le bouton de l'écran de fin ramène à la carte.

  Changements faits en route :
  - un touchdown termine la partie, donc « 2 touchdowns dans une partie » était impossible :
    ces quêtes demandent maintenant 2 touchdowns dans le best of 3 ;
  - les quêtes « problème » ne sont pas encore tirées au sort : il leur faut leurs positions ;
  - le Régional tire donc 4 quêtes par saison au lieu de 5.

- **Étape 5 (faite)** : le tutoriel scolaire, pendant la première saison en ville
  (`career-rules.js` : `tutorialStep`, `matchdayRules`) :
  - journée 1 : rois et pions ; journée 2 : + cavaliers ; journée 3 : + tours et fous ;
    journée 4 : toutes les pièces, première vraie draft ; les pièces interdites le sont pour
    les deux camps, et ces 4 journées se jouent avec 60 s par tour ;
  - journée 5 : la finale, un vrai match (30 s par tour) ;
  - Gérard explique la leçon en arrivant au stade (aussi écrite sur la fiche), puis commente le
    résultat au retour sur la carte et annonce la suite.

- **Les problèmes (faits)** : 6 positions dans `career-quests.js` (`PUZZLES`). Ta pièce et
  des obstacles adverses qui ne bougent jamais (le bot passe son tour) ; atteindre la zone
  d'en-but (ou prendre le roi) en N coups au plus, 2 minutes par coup, sans draft. Un compteur
  « Coup 2/3 » s'affiche. `tests/unit/chessdown-puzzles.test.js` rejoue chaque solution et
  prouve, par une recherche exhaustive, qu'aucune n'est plus courte. Les positions ont été
  trouvées par une recherche au hasard avec ce même solveur. Un problème n'est pas compté dans
  les statistiques du compte.
- En carrière, gagner une série ne donne plus de recrue en attente : les recrues viennent des
  quêtes (les matchs amicaux en donnent toujours).

- **Les coupes (faites)** : la Coupe de la ville (Scolaire, à la mairie : demi-finale puis
  finale) et la Coupe nationale (National, au Grand Stade : quart, demie, finale). Elles se
  jouent une fois le championnat fini, contre les meilleurs rivaux de la ligue, du plus faible
  au plus fort (le meilleur en finale), à élimination directe. La saison ne se termine
  qu'après la coupe ; le ticket dépend toujours du classement de la ligue. Gagner la coupe
  rapporte un trophée (dans le journal) et une recrue à signer sur la page du club. Les
  journées du tutoriel ne touchent pas la coupe.

- **Le maillot « Héritage » (fait)** : gagné par la quête « Les fondateurs », il apparaît dans un
  vestiaire sur la page du club (le vestiaire n'existe qu'une fois un maillot gagné). On y
  choisit entre le maillot du club et le maillot Héritage (crème, bande de poitrine aux
  couleurs du club, col lacé). Le choix est gardé dans `club.wear`, accepté seulement si le
  maillot a été gagné.

## Pas encore fait

- Rien de prévu dans la feuille de route de la carrière. Pistes : plus de quêtes par palier,
  plus de maillots à gagner, la carrière gardée sur le compte (All Star en ligne).

