# Chessdown : le mode carrière (spécification, en cours)

Décisions du propriétaire du 2026-11-21. Maquette : https://claude.ai/artifact/UoTHtDdS4uf72rC3DtD9Jg

## Expérience des quêtes (2026-11-21)

Une quête réussie qui donne de l'expérience donne **+5 XP à chaque pièce qui l'a jouée**
(`QUEST_XP`, `career-quests.js`) ; le roi n'en gagne pas. Les anciens bonus (jusqu'à 150 XP
pour tout le club) faisaient monter les niveaux trop vite. Les recrues et le maillot ne
changent pas.

## Le tournoi remplace la ligue (2026-11-21)

Décisions du propriétaire : plus de contrainte en match de compétition ; à chaque échelon,
international compris, un tournoi de 32 clubs ; les coupes sont retirées. Le 2026-11-22, la
double élimination est abandonnée (trop compliquée) : élimination directe.

- **Format** (`career-rules.js`, `STAGES`) : élimination directe en 5 tours, 1er tour (16
  matchs), 2e tour, quarts, demies, finale. Une partie unique aux trois premiers tours (une
  nulle est rejouée), best of 3 en demi-finale et en finale. Places : 17e (1er tour), 9e,
  5e, 3e, 2e. Une carrière de la version 2 (double élimination) est reprise : ses matchs
  jusqu'à la première défaite (les mêmes premiers tours).
- **Élimination** à la première défaite (la finale perdue aussi) : l'écran passe au noir,
  Gérard dit que c'est fini jusqu'à la saison prochaine. Les quêtes annexes restent jouables ;
  la saison suivante se lance depuis le stade.
- **Ticket** : seul le vainqueur du tournoi monte à l'échelon suivant.
- **31 adversaires** : les entraîneurs nommés de l'échelon (hors boss) et des clubs générés
  depuis la graine (`career-coaches.js`, `generatedCoach` : nom, club, couleurs, portrait,
  style, force ; ni surnom ni réplique). Tableau tiré à nouveau chaque saison ; les autres
  matchs sont simulés depuis la graine. Seuls les résultats du joueur sont enregistrés
  (`tournament.results`), le tableau se recalcule (`bracket`).
- **Progression** : l'armée adverse dépend de l'échelon et de la profondeur du tour
  (`DEPTH`, de 0 au premier tour à 1 en finale). École : 10 points, niveaux 1 et 2 au
  premier tour ; environ 30 points, niveaux 2 et quelques 3 en finale. Le niveau est une
  moyenne : chaque pièce prend le niveau du dessous ou du dessus (`js/bot.js`).
- **Première saison en ville** : Gérard donne une leçon avant chacun des 5 premiers matchs,
  sans aucune restriction de pièces.
- **Date** (décorative) : 1er septembre 8 h au début de chaque saison ; un déplacement prend
  du temps selon la distance et l'échelon (`minutesPerPixel`), un match ou une quête une
  demi-journée, un changement d'échelon un jour. Affichée en haut à droite de la carte.
- **Abandon** : bouton « Abandonner » en partie ; en best of 3, la manche ou le match.
- Les carrières enregistrées avant (version 1, ligues) sont refusées : la page en recommence
  une (le club est gardé).

## Compositions et tableau du tournoi (2026-11-21)

- **Compositions** (`js/lineup-editor.js`, bouton « Compositions » de la page du club) : 3
  emplacements nommés (`club.lineups` : `slot1` à `slot3`, `title`, pièces vues du premier
  siège, rangées 9 à 11), vérifiés par `sanitizeLineups` (`club-rules.js`, aussi sur le
  serveur). Un roi et 39 points au plus pour enregistrer. En draft, « Charger : nom » place
  l'équipe ; les joueurs que le match n'autorise pas (budget, quête, rangées) restent sur le
  banc, et un message le dit.
- **Tableau du tournoi** (`js/bracket-view.js`) : un arbre à branches en SVG, 16 clubs à gauche,
  16 à droite, les tours qui se rejoignent vers la finale au centre ; chaque match avec ses deux
  clubs et son score, le parcours du club en doré, son prochain match en pointillés, le
  champion au-dessus de la finale. Les résultats du tour en cours n'apparaissent qu'après le
  match du club. Il défile sur le côté (centré sur le club) ; la liste de tous les matchs est
  repliée dessous. Avant un match de
  tournoi (« Commencer la draft » ou « Retour à la carte ») et sur l'écran de fin, avec
  « Match suivant » et « Rentrer au club » ; éliminé : seulement « Rentrer au club », et l'écran
  noir de Gérard par-dessus le club. Les quêtes gardent « Retour à la carte ».

## Plus d'onglets sur l'écran de carrière (2026-11-21)

La carte, le Journal et les Pièces s'ouvrent depuis la page du club (trois boutons) ; l'écran
de carrière n'a plus d'onglets : son titre dit la vue ouverte, et « ♜ Ouvrir le club » ramène
au club. La visite de Gérard montre ce bouton au lieu de faire cliquer des onglets (13 étapes).

## Le journal et les actualités du club (2026-11-22)

Le journal montre, dans l'ordre : le tournoi en cours (situation, prochain adversaire, « Voir le
tableau » qui déplie l'arbre centré sur le club), les actualités du club, les quêtes de la saison
(réussie, ratée ou à tenter) et les trophées.

Les actualités (`career.news`, `career-rules.js addNews`) sont datées par le calendrier, la plus
récente en haut, les 40 dernières gardées : début de saison, match du club (score), surprises des
autres matchs du même tour (au plus 2 par tour : un vainqueur plus faible d'au moins 0,2 de force),
champion du tournoi, quête réussie ou ratée, recrue arrivée, joueur qui passe un niveau (en match
ou par l'XP d'une quête). Une carrière plus ancienne commence avec un fil vide ; une nouvelle
illisible à la relecture est écartée (`sanitizeCareer`), le reste de la carrière est gardé.

Ajouts du 2026-11-22 : les séries de victoires du club (`career.streak` : matchs de tournoi et
quêtes ; nouvelle à 3, 5, 10 puis toutes les 5 ; une défaite ou une quête ratée la remet à zéro),
la montée d'échelon du champion (le club seulement quand il gagne un nouveau ticket) et
l'arrivée du club dans un nouvel échelon après le voyage.

## Boss des écoles et saisons au club (2026-11-22)

- Un boss dès la ville : Kenzo Belkacem, « le Caïd du City », au city-stade (quête `city-king`) :
  bot apprenti, armée fixe tour 3★, cavalier 2★, deux pions 2★ ; il donne une recrue de niveau 2
  au choix, de quoi aider à gagner le premier tournoi.
- Le boss d'un échelon est toujours tiré parmi les quêtes de la saison tant qu'il n'est pas
  battu (`drawQuests`).
- Le coin de la carte ne montre plus la date mais les saisons à la tête du club (« 3e saison à
  la tête du club », « Saison 3 » sur téléphone) : seul le titre fait monter d'échelon, ce compte
  dit combien de tournois il a fallu. Les actualités du journal disent leur saison. Le
  calendrier reste tenu (`minutes`), sans être affiché.

## Les maillots sur les pièces (2026-11-22)

En All Star et en carrière, le corps de chaque pièce du club (là où une pièce porterait son
maillot) prend le tissu du club : son motif et ses deux couleurs, découpés à la forme de la
pièce (`club-art.js jerseyBand`, une bande du glyphe réglée pièce par pièce dans styles.css
`.piece-jersey`). La tête et le socle gardent la couleur vive du jeu, la plus proche de celle du
club mais jamais la sombre, et le contour noir reste : la pièce se lit sur le terrain même pour
un club sombre. Le banc de la draft, l'éditeur de compositions et le registre montrent des
pièces blanches au corps habillé.

Seuls les matchs de tournoi habillent l'adversaire : le maillot de son club, ou son maillot
extérieur (couleurs inversées) quand il ressemble trop à celui du club, sinon blanc ou noir uni
(`awayJersey`) ; son en-but prend la couleur la plus proche. En quête (boss compris) et en
amical, l'adversaire n'a pas de maillot. En ligne, le maillot du club adverse n'est pas connu de
la page.

Les sentiers entre un lieu et la route s'arrêtent au bord de la route. Un bouton « Plein écran »
est dans l'en-tête (masqué si le navigateur ne le permet pas). L'écran de fin dit « Défaite »
quand le bot gagne et quand une quête est ratée, même si la partie a été gagnée.

## Téléphones (2026-11-21)

- Jusqu'à 520 px de large : titre « Carrière » masqué (lu par les lecteurs d'écran), onglets
  et deux boutons à icône (« ? » la visite, « ♜ » le club) sur une ligne, l'étape du tournoi
  dessous (saison et échelon : dans l'échelle), bulle de Gérard sur 2 lignes, échelle sur une
  ligne, carte sur toute la largeur, fiche dessous dans la hauteur restante.
- Téléphone à l'horizontale (hauteur ≤ 500 px) : en-tête sur une ligne, Gérard sur une ligne,
  échelle masquée, carte à gauche et fiche à droite.
- Marqueurs de 24 × 24 px au moins (WCAG 2.5.8). Test : `career.spec.js`, « on phones ».
- Page du club : un engrenage ouvre les Réglages (langue, minuteur) ; on revient au club, y
  compris après le rechargement d'un changement de langue (`sessionStorage`, cet onglet).

## Visite de Gérard et blason du QG (2026-11-21)

- `js/career-tour.js` : Gérard en grand à l'écran, le reste assombri sauf ce dont il parle
  (un trou découpé dans quatre caches qui bloquent les autres clics). 17 étapes : le principe,
  la partie, la draft et les niveaux, puis il fait cliquer le QG, le stade, une quête annexe,
  les onglets Journal, Pièces et Carte (chaque clic ouvre vraiment le menu ; la visite reprend
  quand la fiche ou l'onglet est là), et montre la date, la gare et le bouton de visite.
  Elle s'ouvre seule à la première ouverture de la carrière (`pawnet.chessdown.tourSeen`), et à
  la demande (bouton « Visite avec Gérard » de la carrière et du club) ; Échap ou « Passer la
  visite » l'arrête.
- Le QG porte le blason du club (`crestSVG`, réduit en pixels) : sur la façade en ville, sur un
  panneau à côté du village aux autres échelons (`CREST_SPOT`, `js/career-map.js`).

## Guide des pièces (2026-11-21)

- Onglet « Pièces » de la carrière (`js/piece-guide.js`) : pour chaque pièce, ses 5 niveaux
  (étoiles, coût, capacité). Un niveau ne s'affiche qu'une fois débloqué : un joueur du club
  de ce type l'a atteint (les niveaux en dessous aussi), ou il a été croisé en match (gardé dans
  le navigateur, `pawnet.chessdown.seen`) ; le niveau 3 (la pièce classique) est toujours
  visible. Les autres : « Pas encore découvert ».
- En match avec des niveaux (carrière, All Star, en ligne), un clic ou Entrée sur une pièce
  adverse ouvre un encadré : la pièce, son niveau et ce qu'elle sait faire (les capacités du
  niveau 3 au sien) ; Échap ou « Fermer ». Les pièces adverses d'une partie comptent comme
  croisées dès le début.
- Le bouton « Abandonner » s'affiche aussi pendant la draft (hors ligne) : il abandonne le match.

## Variantes de quêtes (2026-11-21)

Décidées par le propriétaire : toutes gardées. 3 quêtes de plus par échelon (11 par échelon),
une seule quête tirée par lieu et par saison (`drawQuests`).

- **Escorte** : le roi doit marquer (`touchdownWith` avec `k`) : école, Rio.
- **Tenir N coups** (`survive`) : la partie est gagnée quand l'adversaire a joué N coups
  (gagner avant compte aussi) ; souvent face à une armée plus riche : parc, refuge.
- **Prendre N pièces** (`captures`) : la partie est gagnée à la N-ième prise : gymnase, Séoul.
- **Sans perte** (`cleanSheet`) : gagner sans perdre une pièce : moulin.
- **Roi seulement** (règle `noTouchdowns`) : les touchdowns ne comptent pour personne : étang,
  Séoul. **Touchdown seulement** (`noKingCapture`, `engine.js`) : le joueur ne peut pas
  prendre le roi : vignoble.
- **Outsider** (règle `budget`) : 25 points contre 39 : studio de télé.
- **Blitz qui accélère** (règle `timerSteps`) : 20 s, puis 15 s, puis 10 s par manche : journal.
- **Boss** (`kind: 'boss'`, `opponent.army` et `opponent.boss`) : un entraîneur nommé avec son
  portrait (`career-coaches.js`, `boss: true`, jamais rival de ligue) et une armée fixe à 4 ou
  5 étoiles. Taureau (comté, 2 tours ★4), Hélène des Cimes (région, dame ★5 et fou ★4), Victor
  Valmont (national, dame, cavalier, fou ★5, best of 3), Ada Kingsley (international, deux
  dames, tour, cavalier ★5). Récompenses : des recrues de haut niveau.

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

- **Les problèmes (faits ; l'adversaire joue depuis le 2026-11-21)** : 6 positions dans
  `career-quests.js` (`PUZZLES`). Ta pièce contre le roi adverse et ses pions, qui jouent entre
  tes coups (`bot-search.js` `puzzleDefense` : la réponse qui résiste le plus longtemps).
  Gagner en N coups au plus : prendre le roi, ou un touchdown que l'adversaire ne peut pas
  reprendre (comme en partie). 2 minutes par coup, sans draft, compteur « Coup 2/3 ».
  `tests/unit/chessdown-puzzles.test.js` prouve que chaque position se gagne de force en
  exactement N coups (`puzzleFewest`, recherche exhaustive des deux camps) et la rejoue
  contre la défense. Positions trouvées au hasard avec ce solveur, en gardant celles où la
  défense coûte un coup de plus que si l'adversaire ne bougeait pas (le pion : autant). Un
  problème n'est pas compté dans les statistiques du compte.
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

