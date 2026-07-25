# Le carnet de tâches

Emplacement de landing : `scratchpad`. La section qui l'accompagne s'appelle
« Tout ce qui n'est pas encore un ticket » et promet, entre autres, de *« lancer
l'agent de code directement sur une section, sans passer par un ticket »*.

## Ce que l'image doit montrer

- La modale du carnet, ouverte par le raccourci **G puis N** — celui que le
  texte de la section cite mot pour mot.
- **Deux sections `##`** (« Before the release », « Loose ends ») et leurs
  **neuf tâches**, dans les quatre états : cochée et barrée, en cours, à faire,
  annulée.
- Une **action de section visible au survol** : la section pointée se détache
  sur un fond gris, ses deux boutons apparaissent contre son titre, et
  l'infobulle nomme l'action (« Lancer un agent sur la section »).
- Le carnet est **personnel et cross-projet** : rien à l'écran ne le rattache à
  un projet, et c'est voulu.

## Où

N'importe quelle page de l'app — ici le board d'Aurora, pour que le fond soit
le même que les autres captures. Connecté en Camille Roy.

## Cadrage — pourquoi 1024 × 768 et pas 1447 × 1085

C'est le seul emplacement qui déroge à la fenêtre commune, et la raison tient à
la modale elle-même.

`--spacing-dialog-w/h` valent `90vw` / `90vh` : **la modale grandit avec la
fenêtre, pas son contenu.** Le corps du carnet a des métriques fixes — 192 px de
marge haute (`pt-48`, une surface d'écriture qui commence bas, comme un
éditeur de notes), 336 px de tâches, 48 px de marge basse, soit 576 px en tout.

Conséquence : à 1085 px de haut, la modale fait 976 px et **60 % de sa surface
est du blanc**. À 768, elle fait 691 px, et le blanc restant (115 px) se lit
comme la respiration voulue par le `pt-48`, pas comme un chargement raté.

L'autre voie était d'allonger la note jusqu'à remplir la grande modale : il
aurait fallu **une quinzaine de tâches de plus**, soit quatre sections et une
vingtaine de lignes. Un carnet de « choses à faire tout de suite » qui en
compte vingt ne dit plus la même chose, et ça demandait une écriture en base.
La fenêtre coûte moins cher que la donnée.

## Déclinaisons

fr/light, fr/dark, en/light, en/dark

## Pièges connus

- **`G` puis `N` se tape avant d'ouvrir quoi que ce soit**, sur un board déjà
  stabilisé — c'est l'inverse du piège de la palette, où la frappe suit
  l'ouverture d'une surface et perd ses premiers caractères. Ici le raccourci
  ouvre la surface ; il n'y a rien à perdre.
- **Les titres de section sont des données, pas des libellés.** « Before the
  release » et « Loose ends » sont en anglais dans les deux variantes : c'est
  l'ancre de contrôle, elle vaut pour FR comme pour EN.
- **Les boutons de section sont des widgets ProseMirror**, injectés par une
  décoration (`section-copy-extension.ts`), pas des composants React. Ils ne
  portent ni rôle ni test-id : on les vise par leurs classes
  `.scratchpad-section-launch` / `.scratchpad-section-copy`, qui sont leur seul
  identifiant stable.
- **Le survol doit être forcé.** Les boutons ne sont visibles qu'au survol du
  titre : `hover()` sans `force` attend une visibilité qui n'arrivera jamais.
- **L'infobulle et le fond de section sont posés par du JS**, sur `mouseenter`,
  via la classe `is-visible`. C'est elle qu'on attend — pas un délai.
