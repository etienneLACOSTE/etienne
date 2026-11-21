# Chessdown : All Star en ligne et ladders

Décisions du propriétaire du 2026-11-21 : une file classée (les salles privées ne comptent
pas), All Star en ligne en même temps que les deux ladders, classements visibles des
joueurs connectés seulement avec une option pour s'en masquer, saisons mensuelles.

## Le club sur le compte

- Table `chessdown_clubs` (migration 008) : le club et la carrière d'un compte, vérifiés par
  les règles partagées (`sanitizeClub`, `sanitizeCareer`) avant d'être écrits.
- API : `GET /api/account/chessdown`, `PUT /api/account/chessdown` `{ club, career }` (club
  `null` : supprime les deux). Inclus dans le téléchargement des données du compte, supprimés
  avec le compte.
- Page : `js/cloud-save.js`. Chaque enregistrement du club ou de la carrière
  (`club-store.js`, `career-store.js`) est envoyé au compte 0,8 s plus tard (et à la fermeture
  de la page). À la connexion, le club du compte remplace celui du navigateur ; un navigateur
  qui a un club et un compte qui n'en a pas l'envoie. Sans compte, rien ne change.

## All Star en ligne

- À la création d'une salle, un joueur qui a un club choisit Classique ou All Star.
- Le serveur lit le club **sur le compte**, jamais celui envoyé par la page. Un club dont un
  niveau ne correspond pas à l'expérience est refusé (`plausibleClub`,
  `server/chessdown-clubs.js`). Rejoindre une salle All Star demande un club aussi.
- Chaque page reçoit son club (`allStarClub`) ; la draft se fait avec le banc, quel que soit
  le siège (les compositions enregistrées sont retournées pour le siège 2).
- La page envoie seulement les cases et l'identifiant de chaque joueur (`clubId`). Le serveur
  y met le type et le niveau du club qu'il connaît, puis vérifie l'armée avec
  `engine.checkArmy` : un roi, la zone du joueur, chaque joueur une fois, le budget de
  39 points (coûts des niveaux). Une draft refusée reçoit `draftRefused`.
- Même maillot choisi des deux côtés : le siège 2 en prend un autre.
- Les parties en ligne ne donnent pas d'expérience au club.

## La file classée

- « Partie classée » dans le menu (comptes seulement) : Classique, ou All Star avec un club.
- Le serveur garde une file par ladder (`joinQueue`, `leaveQueue`). Deux joueurs sont
  appariés si l'écart de cote est sous 100 points, plus 50 toutes les 10 s d'attente (au plus
  800) ; jamais un compte contre lui-même.
- Une partie classée est toujours un best of 3 en tours de 30 s. Pas de revanche : la série
  suivante repasse par la file. Quitter la série avant la fin (même entre deux manches) la
  perd.

## Les ladders

- Table `ladder_ratings` (migration 009) : une cote par compte, ladder (`classic`,
  `allstar`) et saison (le mois, en UTC : `2026-11`). Table `ladder_series` : chaque série
  classée.
- Elo : départ à 1000, K = 48 pendant les 10 premières séries, puis 32 ; série gagnée 1,
  nulle 0,5, perdue 0.
- Nouvelle saison chaque mois : la cote repart à mi-chemin entre l'ancienne et 1000. Les mois
  passés restent : le podium du mois précédent est affiché.
- Entre les deux mêmes comptes, 3 séries comptent par jour (UTC) ; les suivantes sont
  jouées et notées, sans changer les cotes.
- Fin de série : chaque page reçoit `ladderResult` (cote avant, après, ou « ne compte pas »),
  affiché sur l'écran de fin.

## Le tableau

- `GET /api/ladders/:mode`, comptes connectés seulement : le top 50 de la saison, la ligne
  et le rang du joueur, les jours restants, le podium du mois précédent.
- Page : écran « Leaderboard » du menu (`js/ladder-view.js`), un onglet par ladder.
- `users.ladder_hidden` : « Me masquer du classement public » sur la page du compte
  (`PUT /api/account/ladder`). Masqué, on garde sa cote et on voit son propre rang ; les
  autres ne voient pas son nom.

## Limites

Voir `docs/known-limits.md`, section « Ladders et All Star en ligne ».
