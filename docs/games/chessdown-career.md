# Chessdown : le mode carrière (spécification, en cours)

Décisions du propriétaire du 2026-11-21. Maquette : https://claude.ai/artifact/UoTHtDdS4uf72rC3DtD9Jg

## Principe

La carrière se joue avec son club All Star (`docs/games/chessdown-levels.md`). On y apprend
le jeu en jouant. La trame principale est le championnat ; autour, des quêtes annexes
servent à faire progresser ses joueurs et à en recruter.

## Décisions

- **Pas de relégation.** Si on rate la montée, on rejoue la saison de l'échelon.
- **Une carte où l'on se déplace.** On va chercher les quêtes dans des lieux : stades,
  bars, écoles, parcs, city-stades, mairie…
  - Les quêtes principales sont marquées d'un **!** doré (l'ambre du Stade).
  - Les quêtes annexes sont marquées d'un **!** bleu. C'est une nouvelle couleur, `--quest-blue`,
    à ajouter à DESIGN.md.
  - Les lieux verrouillés se débloquent avec la trame principale.
- **La carte s'agrandit à chaque échelon** :

  | Carte | Échelon |
  |---|---|
  | Ville | Scolaire |
  | Département | Départemental |
  | Région | Régional |
  | Pays | National |
  | Monde | International |

  On se déplace à pied en ville et dans le département, en bus dans la région et le pays,
  en avion dans le monde.
- **Des saisons plus longues que 5 à 7 matchs**, pour que les pièces aient le temps de
  monter de niveau. L'essentiel de l'expérience vient des quêtes annexes, qu'on peut faire
  entre deux journées.
- **L'échelon scolaire sert de tutoriel**, découpé en 5 matchs :
  1. le roi et les pions (marquer un touchdown) ;
  2. le cavalier ;
  3. la tour et le fou ;
  4. la première draft ;
  5. une finale en best of 3 avec le chrono de 30 s.

  Ensuite, la Coupe de la ville débloque le département.
- **Après l'International, les saisons continuent** : on défend son titre et les quêtes se
  durcissent (effectif restreint, chrono plus court, adversaire avantagé).
- **Le mode actuel « Campagne » devient « Partie rapide »**, joué avec les pièces
  classiques. Le mot « campagne » est réservé à la carrière.

## Types de quêtes annexes (vus dans la maquette)

| Type | Exemple | Récompense |
|---|---|---|
| Défi à contrainte | gagner avec le roi et 3 pions | de l'expérience pour les pièces engagées |
| Recrutement | marquer avec un cavalier pour qu'Inès signe | une recrue nommée, d'un niveau donné |
| Entraînement (problème) | touchdown en 3 coups depuis une position donnée | de l'expérience pour une pièce |
| Match à règle spéciale | chrono de 15 s, aucun recul (neige) | de l'expérience pour tous les joueurs |
| Série | 3 victoires d'affilée sans changer sa composition | une grosse prime d'expérience |
| Cosmétique | gagner avec l'effectif d'origine | un maillot ou un emblème |

## Questions ouvertes

1. **La longueur des saisons.** Je propose 10 journées aller-retour au Départemental et au
   Régional, 14 au National, puis des poules et des matchs à élimination à l'International.
2. **La disponibilité des quêtes annexes.** Toujours rejouables, ou limitées (une fois par
   saison, ou qui expirent après quelques journées) ?
3. **Le plafond d'expérience des quêtes rejouables**, pour éviter de « farmer » un problème
   facile : récompense une seule fois, ou décroissante ?
4. **Les clubs adverses** : générés une fois par carrière (des rivaux qu'on retrouve), avec
   un nom, un blason et un style de jeu (les archétypes du bot) ?
5. **La sauvegarde** : dans le navigateur, comme le club, en attendant les comptes (All Star
   en ligne).
6. **Les nouvelles règles de match** (aucun recul, effectif imposé…) : elles demandent des
   options dans le moteur, sans toucher aux règles en ligne.
