# Limites connues

Ce qui marche mais pourrait mieux faire, noté pour plus tard. Chaque ligne dit ce qui se
passe aujourd'hui, pourquoi, et une piste. Retirer une ligne quand elle est corrigée.

## Statistiques (étape 3c, 2026-11-09)

- **Coupure de connexion en ligne : la place est gardée 30 secondes** (2026-11-12,
  `seatKeeper` dans `server/socket-utils.js`, reprise de connexion Socket.io). Ce qui reste :
  - **Recharger la page fait revenir dans la partie** (2026-11-15, `assets/js/seat.js`) :
    un jeton de place gardé dans `sessionStorage` (cet onglet seulement), tant que la place
    est gardée. Ce qui reste : la draft de Chessdown en cours recommence de zéro (seule
    une armée validée est gardée) ; le chat repart vide ; ouvrir la partie dans un autre
    onglet ou navigateur ne la reprend pas (le jeton est propre à l'onglet) ; une partie
    finie n'est pas reprise (l'écran de fin et « Play Again » sont perdus).
  - **Une coupure franche est vue tard** : sans fermeture propre (Wi-Fi perdu, tunnel), le
    serveur ne la remarque qu'après le battement de cœur Socket.io (~45 s), puis attend
    30 s. Fermer l'onglet est vu tout de suite (et donne la victoire après 30 s ; le
    bouton « quitter » reste un abandon immédiat).
- **Parties contre le bot et en local : déclarées par la page.** Quelqu'un qui modifie sa
  page peut s'ajouter des victoires, seulement dans ses propres stats, affichées à part
  des parties en ligne (les totaux montrés aux adversaires ne comptent que l'en ligne). Piste : rejouer la partie côté serveur (envoyer les coups), ou
  n'utiliser que les parties en ligne pour un futur classement.
- **Totaux montrés à l'adversaire : lus à la connexion.** Les stats « Games / Wins » que
  voit l'adversaire en ligne sont lues quand la page se connecte au serveur de jeu ; une
  partie finie ensuite n'y apparaît qu'au rechargement de la page. Piste : recalculer à la
  création / à l'entrée dans une salle.
- **Durée en ligne mesurée de la mise en jeu à la fin** (pas la draft de Chessdown, ni le
  temps d'attente dans la salle).

## Comptes

- **Mot de passe oublié : pas encore de lien par email.** Il faut un nom de domaine à nous
  (les services d'envoi refusent `onrender.com`). Piste : acheter `pawnet.<extension>`,
  le brancher sur Render et sur Resend, puis coder la réinitialisation (table
  `password_resets` déjà créée).
- **Avatar vérifié mais pas ré-encodé.** Le serveur vérifie le type réel de l'image, son
  poids et ses dimensions déclarées (512 x 512 au plus), mais renvoie les octets tels quels. Piste : ré-encoder côté serveur (bibliothèque
  d'images, nouvelle dépendance à valider) ; modération si le site grandit (signaler un
  avatar).
- **Une session reste valable jusqu'à 30 jours** après un changement de mot de passe sur
  un autre appareil (il n'y a pas encore de changement de mot de passe). Piste : avec la
  réinitialisation, fermer toutes les sessions du compte (`destroyAllFor` existe).
- **Chessdown n'a pas de profil local :** sans compte, pas de stats du tout ; avec un
  compte, pas encore d'armées sauvegardées (prévu « plus tard » dans `docs/accounts.md`).
- **Connexion Google seulement :** GitHub abandonné (choix du 2026-11-09).
- **Blocage temporaire d'un compte après 10 mauvais mots de passe en 15 minutes** (étape
  5) : protège contre les essais depuis plusieurs adresses, mais quelqu'un qui connaît un
  pseudo peut bloquer sa connexion par mot de passe pendant 15 minutes (la connexion
  Google reste possible). Compteur en mémoire, remis à zéro au redémarrage. Piste : une
  vérification type CAPTCHA au lieu d'un blocage, si ça arrive.
- **Suppression du compte : mot de passe limité par adresse seulement** (tribunal du
  2026-11-10). Il faut déjà être connecté au compte ; quelqu'un qui a volé la session
  pourrait essayer 10 mots de passe par 15 minutes et par adresse. Piste : compter ces
  échecs avec ceux de la connexion (même compteur par compte).

## Amis et présence (étape 4, 2026-11-09)

- **Présence en mémoire du serveur :** qui est en ligne n'est connu que du processus
  Node en cours. Avec plusieurs instances (ou après un redémarrage), la liste repart de
  zéro ; les pages se reconnectent seules, mais il faudrait un stockage partagé (Redis)
  pour plusieurs instances.
- **Invitation seulement à un ami en ligne,** et seulement depuis une salle que l'on vient
  de créer. Un ami hors ligne ne la reçoit pas (pas de boîte de réception). Piste :
  garder les invitations quelques minutes, ou une notification sur la page compte.
- **Rejoindre Ches'spell par invitation demande un deck de trois cartes** sur le compte ;
  sinon, un message renvoie au Deck Builder. Piste : proposer de le construire tout de
  suite puis rejoindre.
- **Recherche d'amis par pseudo exact seulement** (pas de suggestions), voulu pour ne pas
  exposer la liste des joueurs.

## Nulle et chat (2026-11-12)

- **Signalements sans outil de modération** (2026-11-15, `server/reports.js`) : un message
  signalé est gardé 90 jours dans `chat_reports`, copié depuis la mémoire du serveur (les
  30 derniers messages de la partie), 5 signalements au plus par joueur et par partie.
  Mais rien ne les lit sur le site : il faut les consulter à la main dans la base, et
  aucune sanction n'existe (suspendre un compte). Piste : une page d'administration
  réservée, et prévenir par email quand un même compte est signalé plusieurs fois.
- **Le chat disparaît au rechargement de la page** (rien n'est gardé, voulu) et n'existe
  qu'une fois les deux joueurs dans la salle (pas dans la salle d'attente).
- **Nulle sur le même écran : la page croit le joueur qui clique.** Celui qui a le trait
  propose, l'autre répond dans la boîte de dialogue ; rien ne vérifie que ce n'est pas la
  même personne (sans conséquence : seules ses propres stats « Same screen » comptent).

## All Star (2026-11-21)

- **L'en-but et la barre du minuteur** prennent la couleur de maillot du jeu la plus proche
  de la couleur 1 du club, pas sa nuance exacte (les pièces, elles, ont la vraie couleur).
- **L'expérience de campagne est déclarée par la page** (comme les stats contre le bot).

## Ladders et All Star en ligne (2026-11-21)

- **Un club modifié à la main peut jouer en ligne.** Le club vient du navigateur (la
  carrière s'y joue) ; le serveur vérifie ses règles (`sanitizeClub`) et que chaque niveau
  correspond à l'expérience du joueur (`plausibleClub`), mais quelqu'un qui modifie aussi
  l'expérience passe. Le budget de 39 points, le même pour les deux, limite l'avantage :
  un niveau 5 coûte plus cher. Piste : jouer la carrière côté serveur (envoyer les coups
  des matchs contre le bot), ou des ladders All Star avec des niveaux imposés.
- **Les parties en ligne ne donnent pas d'expérience** au club (pour ne pas pouvoir monter
  ses joueurs en jouant contre soi-même avec deux comptes). Piste : de l'expérience en
  classé seulement, plafonnée par jour.
- **Deux comptes d'une même personne peuvent s'affronter en classé** : 3 séries par jour
  au plus entre les deux mêmes comptes comptent. Piste : repérer les paires qui reviennent
  souvent, ou une limite par adresse.
- **Le classement d'un joueur qui ne joue plus reste au tableau du mois** : chaque mois
  repart de zéro au tableau (il faut jouer pour y figurer), la cote est reportée à
  mi-chemin de 1000.
- **Une série classée abandonnée pendant la draft par inactivité** (la salle se ferme
  après 15 minutes sans rien) ne compte pour personne. Piste : une horloge de draft.
- **Le club gardé sur le compte : le dernier enregistré gagne.** Deux navigateurs qui
  changent le club en même temps s'écrasent l'un l'autre ; à la connexion, le club du
  compte remplace celui du navigateur (sauf changement fait avant la réponse du serveur).

## Best of 3 (2026-11-21)

- **Les stats comptent chaque manche, pas la série :** le résultat d'une série n'est
  enregistré nulle part. Piste : une table des séries, avec le ladder.
- **Quitter en cours de série** compte comme un abandon de la manche en cours (stats) et
  ferme la salle ; la série n'existe plus, sans trace de qui l'a perdue.

## Niveaux des pièces (2026-11-21)

- **Le bot n'est pas entraîné pour All Star :** il joue les coups des niveaux, et pèse une
  pièce selon le coût de son niveau, mais ses poids viennent du mode Classique. Piste :
  un entraînement avec des armées à niveaux variés (`tools/chessdown/train.js`), adopté
  seulement s'il fait mieux contre des armées variées.

## Langues (2026-11-20)

- **Chessdown seulement** en anglais, français, espagnol, italien et allemand (réglage
  dans Settings, gardé dans le navigateur). L'accueil, le compte, la confidentialité et
  Ches'spell restent en anglais. Piste : appeler `useLanguages()` sur ces pages avec leurs
  dictionnaires (`assets/js/i18n.js`).
- **Traductions faites sans relecture par des locuteurs natifs** (espagnol, italien,
  allemand surtout). Piste : les faire relire avant d'ouvrir au public.
- **Messages du serveur traduits d'après leur texte anglais** (`serverText()` dans
  `assets/js/i18n.js`) : une phrase du serveur modifiée sans mettre la table à jour reste
  en anglais. Piste : le serveur envoie un code au lieu d'une phrase.
- **Les erreurs des routes `/api`** (compte, amis) arrivent en anglais.

## Divers (relevés avant les comptes)

- **Le tutoriel (`games/chesspell/js/demo.js`) enveloppe `engine.move` et
  `engine.activateSpell`** pour guider le joueur : dernier endroit où une fonction d'un
  autre module est remplacée à la volée. Piste : un point d'extension explicite dans le
  moteur.
- **`games/chesspell/bot.js` est complexe et peu couvert par les tests de mutation**
  (Stryker) : à cibler avec `/crap` avant de le retoucher.
- **Tests en ligne : une course corrigée, à surveiller** (2026-11-15). Des tests envoyaient
  un coup avant que les deux pages écoutent `moveMade` : sous charge, l'événement passait
  avant l'écoute (`stats.spec.js`, `reconnect.spec.js`, corrigé ; minuteur de 5 min pour
  ces parties). Ensuite, deux suites e2e complètes (346 tests) et 200 passages répétés des
  tests en ligne, sans échec. Si un test en ligne échoue encore une fois, chercher d'abord ce motif.
