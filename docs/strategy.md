# Stratégie de refonte

Objectif : remettre le projet à niveau sans jamais casser les jeux.

## Règles

1. **Un filet avant les travaux** : pas de refonte sans tests qui prouvent que le jeu marche encore.
2. **Déplacer avant de modifier** : on extrait du code tel quel, puis on l'améliore dans un commit séparé.
3. **Une étape = un commit = un contrôle** : tests + partie manuelle après chaque étape ; en cas de casse, on annule ce seul commit.

## Phases

### Phase 0 — Mise à l'abri ✅ (2026-11-07)
- Dépôt git unique à la racine, historiques `main` des deux jeux importés (commit `61f70b8`).
- Travail non commité sauvegardé tel quel (commits `45a8233`, `cf96947`).
- `.gitignore` racine : dépendances, venv, modèles `.pth`, logs, données générées.
- Anciens `.git` archivés dans `../etienne-archive/` ; sauvegarde complète dans `../etienne-backup-2026-11-07.tar.gz`.
- Branches `online` et `mobile-responsiveness` non importées : entièrement contenues dans `main`.

### Phase 1 — Filet de sécurité ✅ (2026-11-07)
- `@playwright/test` 1.64.1 (version fixée), lancé par `npm test` sur desktop (1280 px) et mobile (375 px).
- Tests de bout en bout (`tests/e2e/`) :
  - Chessdown : partie locale jusqu'à la prise du roi, touchdown, bot, partie en ligne à deux joueurs.
  - Ches'spell : draft + sort Mur + prise du roi, bot via l'API IA (simulée), repli sur le bot JS, partie en ligne.
  - Serveur : 21 messages Socket.io invalides ne le font plus planter.
- Captures de référence des 5 écrans principaux (`tests/e2e/__screenshots__/`).
- Correctif : gestionnaires Socket.io protégés, codes de salle vérifiés, coordonnées validées (`server.js`).
- Bugs connus documentés par des tests `test.fail()` (voir l'audit) : retirer la marque quand ils sont corrigés.

Commandes :
- `npm test` : toute la suite.
- `npm run test:update` : régénère les captures après un changement visuel voulu (les relire ensuite).
- `npx playwright test chessdown --project=desktop` : un sous-ensemble.

### Phase 2 — Ranger sans changer le comportement ✅ (2026-11-07)
- Failles `body-parser` / `qs` corrigées (`npm audit fix`, lockfile seul).
- Supprimés (toujours dans l'historique git) : anciens serveurs et `package.json` des sous-dossiers, 12 scripts `test_*` de Chessdown, scripts jetables de Ches'spell (`test*.js`, `benchmark*.js`, `update_script.js`, `test.png`), sondes Python `test_*.py`, `node_modules` commité par l'ancien dépôt Chessdown.
- Arborescence : `hub/`, `games/chessdown/`, `games/chesspell/`, `server/` (un module par jeu), `ai/chesspell/`, `tools/<jeu>/`, `docs/games/`.
- Les dossiers servis ne contiennent plus que des fichiers publics ; un test vérifie que le code, le modèle et la config ne sont pas téléchargeables.
- venv Python réparé : ses chemins pointaient encore vers l'ancien emplacement `~/Documents/etienne`.

### Phase 3 — Un moteur de règles par jeu ✅ (2026-11-07)
- `games/chessdown/engine.js` et `games/chesspell/rules.js` : règles pures (sans DOM), chargées par le navigateur et par Node.
- Équivalence prouvée avant branchement : tests différentiels aléatoires contre l'ancien code (453 k vérifications pour Chessdown, 1,6 M pour Ches'spell, 0 écart).
- Tests unitaires `node:test` (`tests/unit/`, 31 tests) ; `npm test` lance unitaires puis e2e.
- Le jeu et les entraîneurs (`tools/`) utilisent ces modules ; plus aucune copie des règles en JavaScript.
- Corrigés au passage : prise en passant impossible en ligne (Chessdown) ; règle Ghost divergente dans l'entraîneur Ches'spell.
- JS / Python : comparaison faite (voir l'audit). L'IA Python suit les règles d'échecs classiques ; l'aligner demande de réentraîner le modèle → décision à prendre, hors refactor.

### Phase 4 — Découper les gros fichiers ✅ (2026-11-07, partiel assumé)
- `games/chessdown/game.js` (1 700 lignes) → `games/chessdown/js/` : state, rules-bridge, board-view, draft, gameplay, bot, network, events, demo, main.
- `games/chesspell/script.js` (2 900 lignes) → `games/chesspell/js/` : state, game-engine, profiles, app + app-online, app-demo, app-bot, app-view (méthodes ajoutées par `Object.assign(app, …)`), main.
- Déplacement vérifié ligne à ligne : seuls les en-têtes et les enveloppes sont nouveaux.
- Ches'spell : plus aucun `onclick`/`oninput` dans `index.html` (`data-action` + un écouteur dans `main.js`) ; tests de tous les menus ajoutés.
- Reporté, volontairement :
  - Modules ES et `@ts-check` : les fichiers restent des scripts classiques qui partagent la portée globale (les tests et le HTML s'appuient dessus). La conversion se fera avec la phase 5, quand l'interface sera réécrite.
  - Bot sans variables globales : dépend des décisions sur l'entraîneur Chessdown (voir l'audit).
  - Les 3 `onclick` générés dans `games/chesspell/js/profiles.js` : réécrits avec la correction XSS (phase 5).

### Phase 5 — Mise à niveau (en cours)
**5a. Sécurité ✅ (2026-11-07)**
- Chessdown : serveur arbitre (drafts, tours, coups légaux, fin de partie, saut de tour via le serveur) avec le moteur partagé.
- Ches'spell : seuls les membres d'une salle sont relayés, avec leurs propres cartes ; decks validés, profils nettoyés.
- XSS corrigée (noms et avatars sans `innerHTML`) ; codes de salle à 6 lettres (crypto) ; messages limités à 300 Ko.
- CSP stricte (`script-src 'self'`) + `nosniff`, `no-referrer`, `DENY`.
- API Python : debug coupé, CORS restreint, entrées validées (+ tests Python dans `npm test`).
- ✅ Minuteur Chessdown tenu par le serveur (réglage commun aux deux joueurs, saut de tour et défaite au temps décidés par le serveur).
- ✅ Limite de débit Socket.io par connexion et plafond de salles.
- ✅ Ches'spell arbitré par le serveur : logique de jeu sans DOM (`games/chesspell/game.js`, équivalence prouvée par test différentiel : 400 parties, 47 k actions), état officiel envoyé aux joueurs après chaque action, chronomètre serveur partagé avec Chessdown (`server/turn-clock.js`).
- Limites restantes listées dans l'audit (HTTPS, connexions par IP).

**5b. Interface (en cours)**
- ✅ Bugs d'affichage connus corrigés : clic des noirs en ligne, plateau et cartes à 375 px, menu Timer (`.hidden`), débordement horizontal de l'accueil, titre Ches'spell rogné, panneau `#game-logger` vide sur le plateau. Tests `layout.spec.js` ajoutés.
- ✅ Clavier (WCAG 2.1.1) : les deux jeux se jouent sans souris (`games/<jeu>/js/a11y.js`) ; plateau à un seul arrêt de tabulation, flèches, Entrée/Espace ; cases nommées ; fenêtres de dialogue accessibles ; focus déplacé au changement d'écran ; focus visible.
- ✅ Noms accessibles : champs étiquetés, icônes décoratives masquées, un seul h1 par page (`a11y.spec.js`).
- ✅ Design : `DESIGN.md` écrit. Accueil et Ches'spell en « Boîte de jeu », Chessdown en « Stade ». Polices auto-hébergées (`assets/fonts/`), CSP sans origine tierce, contrastes AA vérifiés pour toutes les paires de texte. Styles en ligne déplacés dans le CSS.
- ✅ Audit axe (`@axe-core/playwright`, WCAG 2.2 A/AA) sur chaque écran : `tests/e2e/axe.spec.js`. Corrigé : zoom autorisé (WCAG 1.4.4), cartes de sorts sans contrôles imbriqués (le titre est le bouton), cibles tactiles ≥ 24 px.
- ✅ Annonces vocales : coups, sorts, tours sautés et joueur au trait lus par les lecteurs d'écran (zone `#announcer`, `a11y.spec.js`).
- Modules ES + `@ts-check` en réécrivant l'interface.

**5c. Avant production**
- `/tribunal` sur le diff, `/crap`, hébergement (HTTPS) et décision sur l'IA Python.

## Décisions

| Sujet | Décision |
|---|---|
| Langage | JavaScript, modules ES + `@ts-check` ; TypeScript plus tard si besoin |
| Arborescence | `hub/` plutôt que `apps/hub/` (une seule app hors jeux) |
| Historique git | Conservé ; rien n'est poussé sans demande |
| IA Python | Conservée, hors du parcours critique ; hébergement décidé en phase 5 |
| Dépendances | Demander avant chaque ajout |
