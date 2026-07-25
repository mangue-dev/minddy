# Board projet — la capture du hero

Emplacement de landing : `heroBoard` (`components/marketing/screenshot-slots.ts`).
C'est la première image du site, celle qui doit faire comprendre minddy en une
seconde : un tracker de tickets sobre, rempli d'un vrai travail d'équipe.

## Ce que l'image doit montrer

- Le board du projet **Aurora**, en **kanban groupé par statut**.
  La consigne du catalogue dit « vue liste » : cette vue **n'existe pas** dans
  minddy. `ViewDisplay` (lib/types.ts) ne porte que `hideDone` — le board de
  projet est un kanban, sans alternative. L'intention suit le produit réel.
- **Quatre colonnes entières** : Backlog (2), À faire (3), En cours (4),
  En revue (2). `Terminé` et `Annulé` tombent hors cadre — voir le cadrage.
- Des titres crédibles, en anglais, aucun lorem.
- Des priorités variées, dont **un urgent** (AUR-1) — c'est le repère visuel
  qui prouve que la priorité se lit d'un coup d'œil.
- Des efforts variés (xs → xl).
- **Trois personnes assignées** avec leur pastille : Camille, Alice, Tom.
- La barre latérale visible, avec les deux projets (Aurora, Beacon).
- Aucune modale, aucun panneau latéral, aucun bandeau de cookies.

## Où

`/projects/6cd36606-c297-4920-8ce3-31b5f3697be8` sur `https://www.minddy.app`,
connecté en tant que Camille Roy (compte de démo).

## Cadrage — et pourquoi cette largeur exacte

Cadre de la landing : **16/10**. Fenêtre de capture **1736 × 1085** en 2×.

Les colonnes du kanban font 352 px de large, à pas fixe de 364, et commencent
à 280 : leurs bords droits tombent à 632, 996, 1360, 1724, 2088, 2452. Une
largeur de fenêtre de 1736 s'arrête donc dans la gouttière qui suit la 4ᵉ
colonne — quatre colonnes entières, la cinquième entièrement hors champ.

C'est le seul cadrage qui évite une coupe en plein milieu d'une carte. Un board
tranché au tiers d'un titre ne se lit pas comme « il y en a plus à droite », il
se lit comme une image cassée. Le premier run l'a montré, en 1440 × 900.

Le script **vérifie cette géométrie à chaque prise** : si une colonne chevauche
le bord droit, il échoue au lieu de produire une image bancale.

## Déclinaisons

fr/light, fr/dark, en/light, en/dark

## Ce qui n'y sera pas, et pourquoi

La consigne d'origine mentionnait « une issue in_progress portant un badge
d'agent ». Le badge « Numo travaille » ne s'allume que pour un run `queued` ou
`running` (`lib/server/agent/activity.ts`), et le monde de démo n'en contient
aucun — un run dans cet état serait réellement exécuté par le cron. Le run semé
sur AUR-2 est au repos. Si un marqueur apparaît quand même pour ce run, tant
mieux ; sinon l'image est jugée sans ce critère.

## Pièges connus

- **La coupe à droite.** Premier run en 1440 × 900 : la colonne « En revue »
  tranchée au tiers d'une carte. Ça ne se lit pas comme « il y en a plus à
  droite », ça se lit comme une image cassée. D'où la largeur calée sur la
  gouttière, et le contrôle automatique dans le script.
- **Le nom de la vue est une DONNÉE, pas une traduction.** L'onglet « Toutes »
  est une ligne de la table `views`, dont le nom est traduit **à la création**
  (`ensureBaselineViews`, `tBoard("defaultViewName")`) puis figé. Le compte de
  démo ayant vu son premier board en français, la variante anglaise affiche un
  mot français. « Mes tickets » n'a pas ce défaut : l'UI le réétiquette d'après
  son `kind`.
- **La barre d'onglets arrive APRÈS les tickets.** Elle vient d'une requête
  séparée : un run a sorti une image sans « Toutes » ni « Mes tickets », sans
  qu'aucune erreur ne le signale. Le script attend maintenant explicitement
  l'onglet de la vue par défaut. C'est le mode d'échec typique — vert, et faux.
- **La pastille « 0 % » du header** est l'indicateur d'usage du plan
  (`components/usage-indicator.tsx`), pas une jauge de projet. Le compte de
  démo est sur un plan gratuit et n'a rien consommé — c'est normal.
- **Le bandeau cookies** est neutralisé en amont pour toutes les captures :
  `browser.mjs` pose `localStorage["cookie_consent"] = "declined"` avant
  chargement. Rien à faire ici.
