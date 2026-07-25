# La quinzaine en cours

Emplacement de landing : `featureCycle`. Doit montrer ce qui distingue le cycle
de minddy : il est **personnel et cross-projet**, pas un sprint d'équipe.

## Ce que l'image doit montrer

- L'en-tête de cycle : « Cycle en cours » avec ses dates, et les **deux
  anneaux** — complétion et capacité. C'est ça, la « progression visible ».
- Des tickets de **deux projets** dans la même liste, chacun préfixé de son
  projet (`Aurora AUR-1`, `Beacon BCN-8`) — le cœur du sujet.
- Assez de tickets terminés pour que l'anneau de complétion soit crédible.

## Où

`/all?view=cycle` sur `https://www.minddy.app`, connecté en Camille Roy.
Fenêtre 1736 × 1085 (16/10), la même que les autres captures.

## Le cadrage, et pourquoi il est décalé

Le cycle contient 12 tickets répartis ainsi : Backlog 0, À faire 2, En cours 4,
En revue 1, Terminé 5. Cadré au bord gauche, l'image s'ouvrirait sur une
colonne **vide** et laisserait « Terminé » — les 5 tickets finis, donc toute la
preuve de progression — hors champ.

Le script fait donc défiler le board d'**exactement un pas de colonne** (364 px)
avant de photographier. Les colonnes visibles deviennent À faire, En cours,
En revue, Terminé, et le bord droit retombe pile sur la gouttière suivante.
C'est un geste qu'un utilisateur fait, pas un trucage.

## Déclinaisons

fr/light, fr/dark, en/light, en/dark

## Pièges connus

- **Les cycles sont opt-in.** Sans `cycles_enabled: true` dans les métadonnées
  du compte, la ligne existe en base mais l'application affiche « Activer les
  cycles » et l'écran reste vide. Le premier seed avait posé la cadence sans
  le drapeau.
- **La fenêtre du cycle périme.** Elle est calculée côté serveur à l'heure
  réelle : la quinzaine semée court jusqu'au **3 août 2026**. Après, relancer
  `003-projet-beacon.mjs` puis `004-cycle.mjs` avant de recapturer.
- **Les dates affichées dans l'en-tête décalent d'un jour** par rapport à la
  ligne en base (`19 juil. – 1 août` pour une fenêtre `2026-07-20 → 2026-08-03`
  exclusive). Sans effet sur la capture, mais c'est peut-être un vrai décalage
  de rendu côté produit.
