# Limites connues

Ce qui marche mais pourrait mieux faire, noté pour plus tard. Chaque ligne dit ce qui se
passe aujourd'hui, pourquoi, et une piste. Retirer une ligne quand elle est corrigée.

## Statistiques (étape 3c, 2026-11-09)

- **Coupure de connexion en ligne : la place est gardée 30 secondes** (2026-11-12,
  `seatKeeper` dans `server/socket-utils.js`, reprise de connexion Socket.io). Ce qui reste :
  - **Recharger ou rouvrir la page ne fait pas revenir dans la partie** : seule une
    connexion qui revient d'elle-même est reprise (le navigateur garde son identifiant de
    session Socket.io en mémoire). Piste : un jeton de place gardé dans `sessionStorage`,
    et une resynchronisation complète de la partie (Chessdown applique les coups un à un).
  - **Une coupure franche est vue tard** : sans fermeture propre (Wi-Fi perdu, tunnel), le
    serveur ne la remarque qu'après le battement de cœur Socket.io (~45 s), puis attend
    30 s. Fermer l'onglet est vu tout de suite (et donne la victoire après 30 s ; le
    bouton « quitter » reste un abandon immédiat).
- **Chessdown sur le même écran : le compte est toujours le joueur 1.** Sans profils
  locaux, la page ne sait pas de quel côté est le joueur connecté ; s'il joue les rouges,
  ses victoires sont comptées comme des défaites (seulement dans ses stats « Same screen »,
  qui ne sont plus montrées aux adversaires). Piste : demander « Which side are you? » au
  début d'une partie locale, comme Ches'spell choisit un profil par côté.
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
- **Un seul compte Google par compte Pawnet : vérifié par le code, pas par la base.** Deux
  liaisons envoyées exactement en même temps pourraient passer. Piste : contrainte
  `UNIQUE (user_id, provider)` sur `identities` (migration à valider).

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

- **Chat sans modération ni signalement** (`server/chat.js`) : réservé aux comptes, coupable
  par chaque joueur, bloqué entre joueurs qui se sont bloqués, limité à 5 messages par 10 s
  et 200 caractères, jamais enregistré. Mais un message insultant ne peut pas être signalé.
  Piste : un bouton « Report » qui garde le message signalé (donnée nouvelle : politique de
  confidentialité à mettre à jour), et bloquer l'adversaire depuis la partie (aujourd'hui,
  depuis la page compte, et seulement pour les parties suivantes).
- **Le chat disparaît au rechargement de la page** (rien n'est gardé, voulu) et n'existe
  qu'une fois les deux joueurs dans la salle (pas dans la salle d'attente).
- **Nulle sur le même écran : la page croit le joueur qui clique.** Celui qui a le trait
  propose, l'autre répond dans la boîte de dialogue ; rien ne vérifie que ce n'est pas la
  même personne (sans conséquence : seules ses propres stats « Same screen » comptent).

## Divers (relevés avant les comptes)

- **Erreurs de formulaire dans une boîte de dialogue** (2026-11-12, `assets/js/dialog.js`) :
  « Please enter a valid 6-letter code » ou « Please enter a username » s'ouvrent dans une
  boîte au lieu de s'afficher à côté du champ. Piste : un message sous le champ, relié par
  `aria-describedby`, et le focus remis dans le champ.
- **Pas de test e2e de l'écran de fin Ches'spell en ligne.**
- **Le tutoriel (`games/chesspell/js/demo.js`) enveloppe `engine.move` et
  `engine.activateSpell`** pour guider le joueur : dernier endroit où une fonction d'un
  autre module est remplacée à la volée. Piste : un point d'extension explicite dans le
  moteur.
- **`games/chesspell/bot.js` est complexe et peu couvert par les tests de mutation**
  (Stryker) : à cibler avec `/crap` avant de le retoucher.
- **Tests en ligne parfois instables sous charge.** Lors d'un `npm test` complet (le
  2026-11-09), 3 tests en ligne ont échoué une fois (Ches'spell « both players see each
  move », un test d'arbitrage, le minuteur Chessdown) puis sont passés seuls et au
  lancement suivant. Piste : attendre des événements plutôt que des délais dans ces
  tests, ou moins de workers Playwright pour les tests en ligne.
