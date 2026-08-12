# Une page du wiki

Emplacement de landing : `pagesEditor`. La consigne du catalogue
(`components/marketing/screenshot-slots.ts`) : *« une page du wiki ouverte : à
gauche l'arbre des pages du projet avec une page dépliée sur ses sous-pages, à
droite le contenu — un titre, un paragraphe, une liste de cases à cocher dont
deux cochées, et une pilule de mention vers un ticket dans le texte. Pas de menu
ouvert : c'est la page telle qu'on la lit, pas l'éditeur en train d'être
manipulé. »*

## Ce que l'image doit montrer

- **L'arbre, à gauche** : les quatre pages racines d'Aurora, et « 📘 Product
  handbook » **déplié sur ses trois sous-pages**, dont celle qui est ouverte —
  surlignée dans l'arbre.
- **Le fil des parents**, au-dessus du titre : « 📘 Product handbook », qui dit
  qu'une page est une page, pas un fragment de son parent.
- **Le contenu**, à droite : l'icône 🚀 et le titre « Release process », un
  paragraphe, le sous-titre « Before you ship », **cinq cases à cocher dont deux
  cochées** (les deux cochées barrées), puis un dernier paragraphe portant la
  **pilule `AUR-2`**.
- **Rien d'ouvert** : pas de menu « / », pas de menu ⋯, pas de poignée de bloc
  au survol, pas de curseur dans le texte. C'est une page qu'on lit.

## Où

`/projects/6cd36606…/pages/cd3ee91e…` — la page « Release process » d'Aurora,
connecté en Camille Roy. Les données viennent de
`captures/world/seed/014-pages-aurora.mjs`.

## Déclinaisons

fr/light, fr/dark, en/light, en/dark

Le contenu des pages est en **anglais** dans les quatre : c'est de la donnée,
comme les tickets du board. Ce qui change d'une langue à l'autre, c'est le
chrome — « Nouvelle page », « Filtrer 7 pages… », « Modifiée par… ».

## Cadrage

1736 × 1085, la fenêtre des emplacements en 16/10 (`heroBoard`, `featureCycle`,
les deux boards de retours). Il en faut la largeur : l'arbre et le corps de la
page doivent tenir côte à côte, et c'est justement ce que la section raconte.

## Pièges connus

- **La cible est l'env de preview**, pas la production : les pages n'y sont pas
  encore. `CAPTURE_BASE_URL=https://preview.minddy.app`, et une session prise
  sur le même hôte (`CAPTURE_BASE_URL=… node captures/lib/session.mjs`) — les
  cookies d'authentification sont liés au domaine.
- **Le survol pose une poignée de bloc** dans la marge gauche du texte
  (`components/pages/block-gutter.tsx`). La souris est donc écartée du corps
  avant la prise ; sans ça, l'image montre l'éditeur en train d'être manipulé,
  ce que l'intention interdit explicitement.
- **Les deux tâches cochées se reconnaissent au texte barré**, pas à l'attribut :
  c'est ce que le contrôle mesure, parce que c'est ce que l'œil lit.
- **La pilule est un nœud stocké, pas du texte re-scanné.** Contrairement à une
  description de ticket, l'éditeur de page n'hydrate pas les « @… » écrits en
  texte — voir l'en-tête du script de seed. Si la pilule sort en texte brut,
  c'est le seed qu'il faut reprendre, pas la capture.
- **L'en-tête affiche « Modifiée par Camille Roy · il y a 2 jours »** : les dates
  du seed sont antérieures à l'horloge figée (15 juillet 2026). Un « maintenant »
  à l'image veut dire que les pages ont été réécrites après coup, avec la date du
  jour — relancer `014-pages-aurora.mjs`, qui les repose backdatées.
