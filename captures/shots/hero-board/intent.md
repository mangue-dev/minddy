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
- **Une description sur chaque carte** — l'aperçu de trois lignes sous le
  titre, qui donne sa hauteur à la carte et prouve qu'un ticket de minddy
  contient autre chose qu'un intitulé.
- **Une catégorie sur chaque carte** : pastille colorée + nom, en bas à droite.
  Elles sont nommées en anglais depuis le 26 juillet 2026 (`013-categories-en.mjs`),
  sans quoi la variante anglaise afficherait « Fonctionnalité ». Deux cartes en
  portent deux, et affichent donc un « +1 » : AUR-1 et AUR-11.
- Des priorités variées, dont **un urgent** (AUR-1) — c'est le repère visuel
  qui prouve que la priorité se lit d'un coup d'œil.
- Des efforts variés (xs → xl).
- **Trois personnes assignées** avec leur pastille : Camille, Alice, Tom.
- La barre latérale visible. Depuis `fcb2a4d` (`SecondarySidebar`), elle est
  **cadrée sur le projet ouvert** — Tickets, Objectifs, Triage, Feedback,
  Paramètres, avec un retour vers l'accueil — et non plus la liste des deux
  projets. L'intention suit le produit : ce que le hero doit montrer, c'est la
  navigation d'un projet, le nom du projet restant lisible dans le fil d'Ariane.
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

- **Les PNG de `out/` sont périmés.** Ils datent du 25 juillet, avant que les
  tickets ne portent description et catégorie : les cartes y sont plus courtes
  et leur coin bas-droit dit « Aucune ». La prochaine prise sera plus haute —
  les colonnes défileront davantage, c'est attendu.
- **La coupe à droite.** Premier run en 1440 × 900 : la colonne « En revue »
  tranchée au tiers d'une carte. Ça ne se lit pas comme « il y en a plus à
  droite », ça se lit comme une image cassée. D'où la largeur calée sur la
  gouttière, et le contrôle automatique dans le script.
- **Le nom de la vue n'est plus figé en base (corrigé).** L'onglet « Toutes »
  était une ligne de `views` dont le nom, traduit à la création
  (`ensureBaselineViews`), restait français sur la variante anglaise. L'UI
  réétiquette désormais la vue par défaut d'après son `kind`, comme elle le
  faisait déjà pour « Mes tickets » : la prise du 2026-08-04 affiche bien
  « Toutes » en français et « All » en anglais. Rien à corriger ici.
- **La barre d'onglets arrive APRÈS les tickets.** Elle vient d'une requête
  séparée : un run a sorti une image sans « Toutes » ni « Mes tickets », sans
  qu'aucune erreur ne le signale. Le script attend maintenant explicitement
  l'onglet de la vue par défaut. C'est le mode d'échec typique — vert, et faux.
- **La pastille « 100 % » du header** est l'indicateur d'usage du plan
  (`components/usage-indicator.tsx`), pas une jauge de projet, et elle compte le
  budget **restant** (`remainingPercent`), pas le consommé. Le compte de démo
  n'a rien dépensé, elle affiche donc son maximum — c'est le bon message sur une
  capture de vitrine. Elle disait « 0 % » avant que l'indicateur ne bascule sur
  le restant.
- **Le bandeau cookies** est neutralisé en amont pour toutes les captures :
  `browser.mjs` pose `localStorage["cookie_consent"] = "declined"` avant
  chargement. Rien à faire ici.
