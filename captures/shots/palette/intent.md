# La palette ⌘K

Emplacement de landing : `featurePalette`. Doit montrer que minddy se pilote
au clavier, sans jamais lâcher les mains.

## Ce que l'image doit montrer

- La palette ouverte **par-dessus le board d'Aurora**, qui reste lisible
  derrière : c'est ce qui donne le contexte.
- **Une recherche tapée**, qui remonte à la fois des tickets et des actions.
- Les affordances clavier du **pied de palette** : `↵ Ouvrir` et `⌘ ; Actions`.
  La consigne du catalogue demande des « raccourcis affichés à droite des
  lignes » : **ça n'existe pas**. Vérifié dans les deux états (requête vide et
  requête tapée), les seuls `<kbd>` de la palette sont les trois du pied. Ce
  qu'on peut montrer, c'est que la palette se pilote au clavier — pas un
  raccourci par ligne.
- Aucune autre surface ouverte, pas de bandeau.

## Où

`/projects/6cd36606-c297-4920-8ce3-31b5f3697be8` sur `https://www.minddy.app`,
connecté en tant que Camille Roy, palette ouverte au clavier.

Cadre de la landing : **16/10**, même fenêtre que `heroBoard`
(1736 × 1085) pour que les deux images de la page aient la même échelle.

## Déclinaisons

fr/light, fr/dark, en/light, en/dark

## Le texte tapé : `board`

Une recherche qui doit remonter des tickets **et** des actions, dans les deux
langues. Les titres de tickets étant en anglais, la requête est un mot anglais
présent dans plusieurs titres — sinon la variante française remonterait une
liste vide et l'image ne montrerait rien.

`board` remonte le board public du projet (une entrée de navigation) et quatre
tickets dont le titre porte le mot, en anglais « Keyboard shortcuts » en plus.
C'est en outre le **même mot dans les deux langues**, là où la requête
précédente devait être traduite.

### Pourquoi ce n'est plus `ticket` / `issue`

C'était la requête de juillet, et elle donnait quatre groupes. Elle a cessé de
marcher sans que rien ne casse : l'export CSV et les entrées de réglages sont
venus grossir les groupes d'actions, et **ils ont poussé le groupe « Tickets »
sous la ligne de flottaison**. La palette ne remontait plus que de la
navigation — « Nouveau ticket », « Tous les tickets », « Exporter les tickets
en CSV », « Tickets — Préférences » — c'est-à-dire l'exact contraire de l'`alt`
de l'emplacement : *« une recherche qui remonte tickets ET actions »*.

Le contrôle du script ne l'a pas vu parce qu'il **comptait** les résultats (au
moins 7) : ils étaient toujours huit. Il vérifie maintenant ce qui est
réellement DANS LE CADRE — au moins trois tickets, au moins une action, et
aucune ligne tranchée par le bas de la liste.

## Pièges connus

- **La frappe globale perd des caractères.** La palette s'anime à l'ouverture ;
  un `keyboard.type` lancé aussitôt a produit « ssue » au lieu de « issue ».
  On tape désormais DANS le champ (`pressSequentially`) et on relit la valeur
  saisie avant de photographier.
- **La requête décide de l'image, et son résultat VIEILLIT.** Ce que la palette
  remonte dépend du catalogue d'actions, qui grossit à chaque feature. Une
  requête bien choisie aujourd'hui peut ne plus rien montrer dans trois mois,
  sans qu'aucune erreur ne le dise. C'est ce qui est arrivé à `ticket`.
- **Un identifiant de ticket ne se cherche pas avec `\b` en tête.** Le titre et
  l'identifiant sont deux nœuds voisins : le texte de la ligne dit
  « …from the boardAUR-5 », sans frontière de mot entre `d` et `A`.
- **Compter des résultats ne dit rien de ce qu'on voit.** Un résultat sous la
  ligne de flottaison compte comme les autres. Le contrôle mesure donc les
  positions, pas les longueurs.
