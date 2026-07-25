# Le panneau Numo

Emplacement de landing : `numoPanel`. La section s'appelle « Numo connaît déjà
vos tickets » et pose comme premier argument : *« L'assistant est dans l'app,
pas dans un onglet à côté. Il lit vos projets, agit dessus et vous rend la
main. »*

## Ce que l'image doit montrer

- La conversation **« Sweep the unassigned backlog »** en entier : l'instruction
  de Camille, les trois réponses de Numo, et entre elles les **deux actions**
  qu'il a menées — une recherche (`3 tickets trouvés`) puis une modification
  groupée (`2 tickets modifiés`).
- Que Numo **agit** et ne se contente pas de répondre : la dernière réponse cite
  les tickets modifiés par leur identifiant (AUR-11, AUR-7).
- Le **badge de contexte** dans le composeur : Numo sait ce qu'on a sous les
  yeux.
- L'app autour, pour qu'on voie que l'assistant y vit.

## Où

`/projects/<aurora>`, connecté en Camille Roy. Panneau ouvert par **G puis A**,
conversation chargée depuis la liste, puis passé en mode **étendu**.

## Deux consignes du catalogue qui ne survivent pas au produit

**« Deux ou trois appels d'outils dépliés. »** Ça n'existe pas. Un appel d'outil
seul se rend en **ligne non interactive** — une icône, un libellé, rien à
déplier (`ToolCallRow`, tool-call-display.tsx). Le seul dépliage du composant
est un accordéon qui apparaît quand un même tour appelle **plusieurs** outils :
il résume « n actions », et l'ouvrir affiche… les mêmes lignes. Ni arguments ni
résultats ne sont jamais montrés. Les deux lignes d'action de cette
conversation sont donc l'état complet, pas un état replié. `world.md` reprenait
la même formule ; elle est fausse au même titre.

**« Le badge Ticket en contexte. »** Il faudrait ouvrir Numo depuis un ticket
ouvert — c'est ce qu'annonçait `world.md`, et c'est **impossible** : le panneau
latéral du ticket pose un voile sur toute la page, et le FAB de Numo (`z-40`)
passe dessous. Vérifié : `elementFromPoint` au centre du FAB renvoie le pied du
panneau de ticket. Le raccourci `G A` ne sauve rien non plus — dans un ticket
ouvert, `A` est le raccourci « assigner », et il ouvre le sélecteur d'assigné.

Le badge est donc là, mais il nomme la **vue du board** (« Toutes » / « All »).
C'est un des trois contextes que la landing revendique elle-même — *« le ticket,
le board ou le cycle que vous avez sous les yeux »* — et le seul qu'on puisse
photographier sans écrire en base.

## Mode étendu, et pas le widget de coin

En compact, le panneau fait 450 × 600 et le fil déborde de **73 px** : soit la
dernière réponse est coupée en bas, soit, une fois défilé, l'instruction de
Camille l'est en haut. Deux mauvaises images.

L'étendu (896 × 704, centré) est la « taille de modale de lecture » prévue par
`panel-geometry.ts` : la conversation entière y tient. On perd le board net
derrière — il passe sous le voile — mais on gagne un fil complet.

## Cadrage

1447 × 1085, la fenêtre commune des emplacements 4/3.

## Déclinaisons

fr/light, fr/dark, en/light, en/dark

## Pièges connus

- **`G A` dans un ticket ouvert ouvre le sélecteur d'assigné.** Le panneau doit
  s'ouvrir depuis le board nu.
- **Les infobulles restent affichées après un clic.** Radix les garde ouvertes
  tant que le bouton a le focus : après « Conversations » et « Agrandir », il
  faut retirer le focus, sinon une bulle noire traverse la capture. Un run l'a
  produite deux fois.
- **La conversation ne se restaure pas** : le panneau relit
  `localStorage`, vide dans un contexte de capture neuf. Il faut passer par la
  liste. Son titre est une donnée anglaise, donc une ancre valable pour les deux
  langues.
- **Les libellés d'action sont des pluriels ICU.** Le script les reconstruit
  depuis `messages/<langue>.json` plutôt que de les recopier : si le produit
  change « tickets trouvés » en autre chose, la capture le dit au lieu de le
  photographier en silence.
