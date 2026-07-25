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

## Le texte tapé

Une recherche qui doit remonter des tickets **et** des actions, dans les deux
langues. Les titres de tickets étant en anglais, la requête est un mot anglais
présent dans plusieurs titres — sinon la variante française remonterait une
liste vide et l'image ne montrerait rien.

## Pièges connus

- **La frappe globale perd des caractères.** La palette s'anime à l'ouverture ;
  un `keyboard.type` lancé aussitôt a produit « ssue » au lieu de « issue ».
  On tape désormais DANS le champ (`pressSequentially`) et on relit la valeur
  saisie avant de photographier.
- **La requête décide de l'image.** « dark » ne remonte que 2 lignes, « issue »
  en français que 3 et aucune action. Seul le mot que l'app emploie elle-même
  pour « issue » dans la langue courante — `ticket` en FR, `issue` en EN —
  ouvre les quatre groupes.
- **La dernière ligne est coupée par le pied**, la liste dépassant la hauteur
  maximale de la palette. C'est le comportement réel : ça signale qu'il y a
  plus à faire défiler. Assumé, pas corrigé.
