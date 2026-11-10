# Limites connues

Ce qui marche mais pourrait mieux faire, noté pour plus tard. Chaque ligne dit ce qui se
passe aujourd'hui, pourquoi, et une piste. Retirer une ligne quand elle est corrigée.

## Statistiques (étape 3c, 2026-11-09)

- **Partie en ligne quittée : abandon immédiat, sans délai de reconnexion** (corrigé le
  2026-11-10 : comptée comme victoire `forfeit` pour celui qui reste). Une simple coupure
  réseau fait donc perdre la partie, comme avant (la salle se fermait déjà). Piste : garder
  la salle 30 secondes et laisser le joueur revenir.
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
- **Adresse du visiteur : en-tête `cf-connecting-ip` cru sur parole** (tribunal du
  2026-11-10). Si le serveur Render est joignable sans passer par Cloudflare, un visiteur
  peut écrire cet en-tête lui-même et changer d'« adresse » à chaque essai, ce qui contourne
  les limites par adresse (pas la limite par compte). Piste : vérifier sur Render si l'accès
  direct est possible ; sinon, n'accepter l'en-tête que venant des adresses de Cloudflare.
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

## Divers (relevés avant les comptes)

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
