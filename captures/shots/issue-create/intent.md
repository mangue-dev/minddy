# La modale de création d'un ticket

Emplacement de landing : `workflowIssue`, premier des trois temps de la section
« Du ticket à la pull request ». Le texte à côté de l'image dit : *« Un titre,
deux phrases, une priorité. L'agent n'a pas besoin de plus. »* C'est cette
phrase que l'image doit prouver.

## Pourquoi cette capture a remplacé l'onglet Plan

Le premier temps s'appelle **« Vous décrivez »** et montrait le plan écrit par
l'agent (`captures/shots/issue-plan/`). Le pas était faux : la légende annonçait
ce que fait l'utilisateur, l'image montrait ce que fait la machine, et le plan
revenait de toute façon au deuxième temps (« il écrit son plan, puis code »).

L'image montre donc maintenant le geste de l'utilisateur, et rien d'autre : le
formulaire rempli, juste avant le clic sur « Créer ».

## Ce que l'image doit montrer

- La modale **« Nouveau ticket »** posée sur le board d'Aurora, qui reste
  visible derrière le voile — on crée le ticket *dans* le tracker.
- Un **titre** et une **description de deux phrases**, saisis : le formulaire est
  rempli, pas vide. Il n'y a pas de troisième champ de texte à remplir.
- Trois propriétés posées dans la rangée compacte — **priorité haute**,
  **effort M**, **catégorie Feature** — et rien d'autre. La rangée montre sept
  propriétés possibles ; six suffisent à ne pas être remplies pour que l'image
  dise « on demande peu ».
- Le bouton **« Créer dans Aurora » actif** : le ticket part au clic suivant.

## Le ticket est AUR-2, mot pour mot

Titre et description sont ceux d'AUR-2 dans le monde de démo
(`captures/world/seed/002-projet-aurora.mjs`) :

> **Add keyboard shortcuts to the command palette**
> Power users live in the palette but still reach for the mouse to run an
> action. Show the shortcut next to each row, and make it work from anywhere in
> the app.

Ce n'est pas un détail de mise en scène. Les deux temps suivants de la section
photographient **le même ticket** : le run de l'agent (`shots/agent`) et sa pull
request (`shots/pull-request`) portent tous deux AUR-2. Les trois images
racontent donc une seule histoire, du formulaire à la PR — changer le ticket
d'ici casserait la continuité sans que rien ne le signale.

La description fait exactement **deux phrases**, comme la légende le promet.

## Où

`/projects/6cd36606-c297-4920-8ce3-31b5f3697be8` sur `https://www.minddy.app`,
connecté en Camille Roy, modale ouverte au clavier par `c`.

Rien n'est jamais soumis : le formulaire est photographié avant le clic. Aucun
ticket n'est créé dans la base de production, et le contexte de navigateur meurt
avec le run — le brouillon local part avec lui.

## Cadrage — 1447 × 1085

**C'est la règle des cinq emplacements en cadre 4/3** (`workflowIssue`,
`workflowAgent`, `workflowPr`, `numoPanel`, `scratchpad`) : hauteur commune de
1085 px, largeur réduite à 1447 (= 1085 × 4/3). `<ScreenshotSlot>` rend l'image
en `object-cover` ; une capture 16/10 y perdrait 145 px de chaque côté, soit une
bonne part de la modale, qui est centrée. Voir `shots/issue-plan/intent.md`
pour le raisonnement complet.

## Déclinaisons

fr/light, fr/dark, en/light, en/dark

## Pièges connus

- **Le titre et la description sont des DONNÉES, identiques en FR et en EN.**
  Comme partout dans le monde de démo, le contenu est anglais et seule
  l'interface est traduite. Ce sont donc les ancres de vérification : elles ne
  cassent pas une variante sur deux.
- **La rangée de propriétés se pilote par `aria-label`, pas par les raccourcis
  clavier.** Les touches S/P/E/A/L/D/O sont ignorées tant que le focus est dans
  le titre ou la description (`create-issue-dialog.tsx` les filtre sur
  `INPUT` / `TEXTAREA` / `contentEditable`), et il y est forcément à ce
  moment-là. On clique les déclencheurs, dont les libellés accessibles sont
  traduits — d'où la table `ARIA` du script.
- **Le sélecteur de catégories est un multi-select : il ne se referme pas tout
  seul.** Il faut un `Escape`, et vérifier ensuite que c'est bien le popover
  qui s'est fermé et pas la modale. Les sélecteurs simples (priorité, effort)
  se referment à la sélection.
- **La barre d'onglets du board arrive après les tickets** (requête séparée) :
  elle est floutée derrière la modale, mais son absence se verrait. On attend
  l'onglet de la vue par défaut avant d'ouvrir la modale.
- **Le bouton de création est un `SplitButton` désactivé tant que le titre est
  vide.** Son état actif est la preuve que le formulaire est réellement rempli :
  c'est un contrôle, pas une décoration.
