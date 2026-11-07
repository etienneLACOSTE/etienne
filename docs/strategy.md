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

### Phase 4 — Découper les gros fichiers
- Modules ES : `engine`, `ui`, `network`, `ai`, `tutorial`, un par commit.
- Suppression des `onclick` inline ; `// @ts-check` + JSDoc.

### Phase 5 — Mise à niveau
- Serveur autoritaire (validation des coups et des tours, codes de salle plus longs).
- XSS : `textContent` au lieu de `innerHTML` pour les données utilisateur.
- Accessibilité WCAG 2.2 AA (plateau au clavier, ARIA, contrastes).
- Design selon `DESIGN.md` (à rédiger).
- Avant production : `/tribunal`, `/crap`, décision sur l'hébergement de l'IA Python.

## Décisions

| Sujet | Décision |
|---|---|
| Langage | JavaScript, modules ES + `@ts-check` ; TypeScript plus tard si besoin |
| Arborescence | `hub/` plutôt que `apps/hub/` (une seule app hors jeux) |
| Historique git | Conservé ; rien n'est poussé sans demande |
| IA Python | Conservée, hors du parcours critique ; hébergement décidé en phase 5 |
| Dépendances | Demander avant chaque ajout |
