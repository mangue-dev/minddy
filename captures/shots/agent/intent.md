# Le run de l'agent de code

Emplacement de landing : `workflowAgent`, deuxième des trois temps de « Du
ticket à la pull request ». Le texte à côté dit : *« Le run se lance dans un
environnement isolé. Chaque tâche passe à "en cours" puis à "terminée" pendant
qu'il travaille : vous suivez l'avancement sans relire tout le fil. »*

## Ce que l'image doit montrer

- La page `/agents` : la liste à gauche avec le run sur **AUR-2**, son statut
  **En attente**, et le ticket en en-tête à droite.
- L'instruction de Camille, puis le **fil d'exécution déplié** :
  - le raisonnement de l'agent, en clair ;
  - ses **trois lectures** (`glob` sur `**/palette/**`, puis
    `lib/palette/actions.ts` et `components/palette/provider.tsx`) ;
  - son **édition des trois fichiers** ;
  - le bloc **3 fichiers modifiés +58 −7**, ouvert, avec le compte par fichier ;
  - la **commande de test** qu'il a lancée.
- Le résumé, qui pose une question — le run est **au repos, en attente de
  réponse**, pas en cours d'exécution.
- Le composeur du bas : modèle (`Claude Sonnet 4.5`) et branches
  (`main → numo/aur-2-palette-shortcuts`). C'est ce dernier détail qui raccorde
  cette capture à celle de la pull request.

## Où

`/agents` sur `https://www.minddy.app`, connecté en Camille Roy. Le run est
sélectionné d'office : c'est le seul.

## Deux accordéons à ouvrir, et pourquoi

Le fil arrive **replié** : un run terminé referme son déroulé
(`AgentEventFeed`, `useState(active)` puis fermeture au passage travail →
terminé). Sans les ouvrir, l'image ne montre aucun appel d'outil — c'est
pourtant tout le propos.

1. **Le déroulé de travail**, derrière « A travaillé pendant 8 minutes et
   40 secondes ».
2. **Le groupe de lectures**, replié en « Lecture de … » : plusieurs actions
   d'un même tour se résument à la dernière. Ouvert, il rend les trois lignes.

Le bloc « 3 fichiers modifiés » s'ouvre tout seul avec le déroulé.

## Un bug produit trouvé ici, et corrigé

Le run affichait « **Édition de 0 fichier(s)** » juste au-dessus de son propre
« 3 fichiers modifiés ». Ce n'était pas la donnée de démo : `toolArgSummary`
(`lib/server/agent/agent-loop.ts`) persiste `{ count, paths }` pour
`apply_edits`, et c'est bien ce que le seed a écrit. C'est l'affichage qui
comptait `args.changes`, une clé qui n'existe que dans les arguments bruts du
modèle et **jamais** dans ce que le fil relit. Tout run réel affichait donc zéro.

Corrigé dans `components/assistant/tool-call-display.tsx` : repli sur `count`,
puis sur `paths.length`. Le script vérifie le libellé attendu et **échoue tant
que la correction n'est pas en production** — c'est voulu, une capture ne doit
pas photographier ce bug.

## Cadrage

1447 × 1085, la fenêtre commune des emplacements 4/3.

## Déclinaisons

fr/light, fr/dark, en/light, en/dark

## Pièges connus

- **Le déroulé se désigne par sa DURÉE, pas par son libellé.** « A travaillé
  pendant 8 minutes et 40 secondes » / « Worked for 8 minutes and 40 seconds » :
  seule la durée est commune aux deux langues, et elle vient des horodatages du
  run. D'où l'ancre `/8…40/`.
- **Ne jamais viser « le premier accordéon fermé ».** Un run l'a appris : le
  premier `button[data-state="closed"]` de la page est le menu « Nouveau », en
  haut de la liste. Il s'est ouvert à la place du fil.
- **Le run ne doit jamais être `queued` ni `running`.** Ce n'est pas une
  question de rendu : le cron le reprendrait et lancerait réellement l'agent
  (microVM, appels facturés). Voir `world.md`.
- **Le FAB de Numo est masqué sur `/agents`** (`hiddenForRoute`), donc rien à
  neutraliser de ce côté.
- **Ouvrir le run met sa date à jour.** La date affichée sur la carte de la
  liste est celle de la dernière activité de la conversation, et la visite en
  est une : au run du 2026-08-04, la PREMIÈRE variante est sortie avec « 26
  juil. » et les trois suivantes avec « 4 août ». Une seule image sur quatre
  disait autre chose que les autres. Le remède est de **rejouer le script une
  seconde fois** : la date est alors stabilisée pour les quatre. À vérifier à
  chaque rafraîchissement, c'est invisible sans comparer les variantes entre
  elles.
- **La barre latérale principale se réduit à un rail d'icônes** sur cet écran
  depuis `fcb2a4d` : la liste des conversations occupe la colonne secondaire.
  C'est le produit, pas un défaut de capture.
