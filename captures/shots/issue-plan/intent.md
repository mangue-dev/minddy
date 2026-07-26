# Le ticket et son plan d'implémentation

> **Cette capture n'est plus branchée sur la landing.** Depuis le 2026-07-26,
> l'emplacement `workflowIssue` est servi par `shots/issue-create` : le premier
> temps s'appelle « Vous décrivez » et montre désormais le geste de
> l'utilisateur — la modale de création — au lieu du plan écrit par l'agent.
>
> Le dossier est gardé tel quel : le script marche, l'intention est juste, et le
> plan reste la meilleure preuve en image que les tâches sont une donnée suivie.
> S'il fallait le remontrer, sa place serait le DEUXIÈME temps (« L'agent Numo
> exécute »), dont le texte dit maintenant « il écrit son plan ». Il faudrait
> alors un emplacement à lui, `workflowAgent` étant pris par le run.

Emplacement de landing (historique) : `workflowIssue`, premier des trois temps de la section
« Du ticket à la pull request ». Le texte à côté de l'image dit : *« L'agent
transforme la description en plan d'implémentation : des tâches ordonnées qui
nomment les fichiers à toucher, stockées sur le ticket lui-même. »* C'est cette
phrase que l'image doit prouver.

## Ce que l'image doit montrer

- Le ticket **AUR-2** ouvert : son identifiant, son titre.
- L'onglet **Plan** sélectionné, avec son compteur `2/6` et la barre de
  progression — la preuve que les tâches sont une donnée suivie, pas un
  paragraphe.
- Les **six tâches** dans trois états visibles d'un coup d'œil : deux cochées et
  barrées, une en cours (case pleine, texte en gras), trois à faire.
- Des **chemins de fichiers réels** dans les tâches (`lib/palette/actions.ts`,
  `components/palette/row.tsx`, `components/palette/provider.tsx`) : c'est
  littéralement ce que la phrase de la landing promet.
- Le board du projet derrière, flouté par le voile du panneau — le ticket est
  ouvert *dans* l'application, pas dans une page isolée.

## Où

`/projects/6cd36606-c297-4920-8ce3-31b5f3697be8` sur `https://www.minddy.app`,
connecté en Camille Roy, carte AUR-2 cliquée puis onglet Plan.

## La consigne du catalogue est fausse, et sur deux points

`screenshot-slots.ts` demande « le détail d'une issue avec sa description **ET**
son plan d'implémentation visible », à la route
`/projects/<id>/issues/<identifier>`.

1. **Cette route n'existe pas.** Il n'y a pas de page de détail : un ticket
   s'ouvre dans un panneau latéral posé sur le board (`IssueSidePanel`), et le
   lien profond est `?issue=<uuid>`.
2. **Description et plan sont deux onglets**, donc mutuellement exclusifs
   (`Tabs value={tab}` dans `issue-side-panel.tsx`). Les montrer ensemble
   demanderait de modifier le produit.

L'intention suit le produit : c'est l'onglet **Plan** qu'on photographie. C'est
aussi celui que la landing décrit — la description tient en deux phrases qu'on
lit déjà dans le texte de la section, le plan est ce qu'on ne peut montrer
qu'en image.

## Cadrage — pourquoi 1447 × 1085 et pas 1736 × 1085

Le cadre de cet emplacement est **4/3**, et `<ScreenshotSlot>` rend l'image en
`object-cover`. Une capture 16/10 y perdrait 17 % de sa largeur, rognée à parts
égales des deux côtés — soit ~145 px sur la droite, là où se trouve justement
le panneau. L'image serait tranchée en plein dans le plan.

On garde donc la **hauteur commune de 1085 px** et on réduit la largeur à
**1447** (= 1085 × 4/3). Deux effets, tous deux voulus :

- la composition verticale reste celle des captures déjà publiées — même
  en-tête, même hauteur de colonnes, même quantité de vide en bas ;
- le panneau occupe 32 % de la largeur au lieu de 26 %, et le plan reste
  lisible dans un cadre affiché autour de 530 px sur la landing.

L'échelle monte de 20 % par rapport aux captures 16/10. C'est le prix assumé :
allonger la fenêtre à 1302 px aurait tenu l'échelle à l'identique mais laissé
un tiers de l'image en gris vide, le board comme le panneau s'arrêtant bien
avant le bas du cadre.

**C'est la règle des cinq emplacements en cadre 4/3** — `workflowIssue`,
`workflowAgent`, `workflowPr`, `numoPanel`, `scratchpad`. Les emplacements
16/10 gardent 1736 × 1085.

## Déclinaisons

fr/light, fr/dark, en/light, en/dark

## Pièges connus

- **L'onglet Plan se désigne par son rang, pas par son libellé.** Le libellé
  vaut « Plan » dans les deux langues aujourd'hui, mais le compteur `2/6` y est
  collé (`Plan2/6` dans l'arbre d'accessibilité) : une correspondance exacte sur
  le texte casserait au premier ticket dont le plan change de taille.
- **Le panneau s'ouvre toujours sur Description** (`initialTab = "description"`,
  et le lien profond `?issue=` le force). Il faut cliquer l'onglet.
- **Vérifier le contenu par les chemins de fichiers.** `lib/palette/actions.ts`
  est une donnée, identique en FR et en EN : c'est l'ancre de contrôle. Un
  contrôle sur « À faire » ou « terminée » casserait une variante sur deux.
- **La barre d'onglets du board arrive après les tickets** (requête séparée) :
  elle est floutée derrière le panneau, mais son absence se verrait. On attend
  l'onglet de la vue par défaut avant d'ouvrir le ticket, comme pour la palette.
