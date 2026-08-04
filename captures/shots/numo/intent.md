# Le panneau Numo

Emplacement de landing : `numoPanel`. La section s'appelle « Numo connaît déjà
vos tickets » et pose comme premier argument : *« L'assistant est dans l'app,
pas dans un onglet à côté. Il lit vos projets, agit dessus et vous rend la
main. »*

## Ce que l'image doit montrer

- La conversation **« Sweep the unassigned backlog »** : l'instruction de
  Camille, le **résumé de travail replié** (« A travaillé pendant 1 minute et
  3 secondes »), puis la réponse finale.
- Que Numo **a travaillé** : c'est le résumé de durée qui le dit, et la réponse
  qui le prouve en nommant les tickets modifiés.
- Le **badge de contexte** dans le composeur : Numo sait ce qu'on a sous les
  yeux.
- L'app **derrière**, en retrait : l'assistant y vit, mais c'est de lui qu'on
  parle.
- Que Numo **agit** et ne se contente pas de répondre : la dernière réponse cite
  les tickets modifiés par leur identifiant (AUR-11, AUR-7).
- Le **badge de contexte** dans le composeur : Numo sait ce qu'on a sous les
  yeux.
- L'app autour, pour qu'on voie que l'assistant y vit.

## Où

`/projects/<aurora>`, connecté en Camille Roy. Panneau ouvert par **G puis A**,
conversation chargée depuis la liste, et laissé en **taille normale**.

## On photographie le fil REPLIÉ, et le panneau COMPACT

**Replié.** Le tour de travail de Numo est rangé derrière un résumé de durée,
comme dans le fil de l'agent de code. C'est l'état par défaut du produit, et
c'est celui qu'on montre : le résumé dit que Numo a travaillé, la réponse finale
nomme les tickets qu'il a modifiés. Déplier étalait son raisonnement sur toute
la hauteur du panneau pour démontrer ce que la phrase de conclusion dit déjà.

**Compact — et c'est un retour en arrière, daté du 2026-08-04.** Le panneau
était étendu depuis le 26 juillet, pour une raison qui a cessé d'être vraie :
l'étendu mettait Numo au centre et renvoyait le board au décor.
`panel-geometry.ts` a depuis rebranché sa taille sur les tokens de dialogue de
mangue-ui — `--spacing-dialog-w/h`, soit **90vw × 90vh**, la taille du carnet et
de la création de projet. Étendu, le panneau couvre désormais l'écran entier :
le board disparaît de l'image, et le fil replié — six messages dont un tour de
travail refermé — flotte dans les deux tiers de blanc du bas. La capture ne
montrait plus un assistant dans une application, mais une page de chat.

Compact, le panneau garde des métriques FIXES (450 × 600, ancré en bas à
droite). Ce n'est donc plus lui qu'on règle, **c'est la fenêtre** : voir
« Cadrage ».

Le résumé se désigne par sa **durée** : la seule partie du libellé qui vienne
des horodatages et non d'une traduction, donc la seule qui vaille dans les deux
langues. Même procédé que `shots/agent`.

> État précédent, gardé parce qu'il explique la consigne du catalogue : les
> appels d'outils se rendaient **en ligne**, non interactifs, et la consigne
> « deux ou trois appels d'outils dépliés » décrivait une UI inexistante. Le
> dépliage existe maintenant, mais il porte le tour entier, pas un appel.

## 1 min 3 s est une donnée, pas un hasard

La durée affichée est la soustraction du premier horodatage au dernier. Le fil
tenait sur **douze minutes rondes** : invraisemblable pour deux recherches et une
mise à jour groupée, et le « et 0 seconde » d'une durée pile sonnait faux.

`captures/world/seed/006-numo.mjs` date maintenant les six messages sur
**0 s, 4 s, 9 s, 31 s, 38 s, 63 s** — intervalles inégaux, parce que le temps de
lire un résultat n'est pas celui d'écrire une phrase. Le script de capture
vérifie cette durée : changer le déroulé du seed casse la capture, et c'est
voulu.

## Une consigne du catalogue qui ne survit pas au produit

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

## Cadrage — 1200 × 900, et pas la fenêtre commune

Cadre de la landing : **4/3**. Fenêtre **1200 × 900**, au lieu des 1447 × 1085
des autres emplacements 4/3. `carnet` déroge de la même façon, et pour une
raison voisine : quand le sujet a des métriques fixes, c'est la fenêtre qui
décide de la part d'image qu'il occupe.

- à 1447, le panneau pèse 31 % de la largeur : le board, plus dense et plus
  coloré, passe devant. Or la section parle de l'assistant ;
- à 1200, il en pèse 37 % sur 67 % de la hauteur. Le board reste lisible
  derrière, sans prendre le regard.

**1200 est un plancher, pas un réglage.** `--breakpoint-desktop` vaut 1200 px :
en dessous, le shell bascule en mise en page mobile — barre latérale escamotée,
fil d'Ariane centré, barre d'onglets en bas, board en une colonne. Une prise en
1024 × 768 a sorti exactement ça, et l'image racontait une application de
téléphone.

La définition ne souffre pas de la fenêtre plus petite : la prise est en 2×
(2400 px) et `publishShot` sert 1600 px pour un emplacement affiché autour de
530 — trois fois la densité d'affichage, comme les autres.

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
