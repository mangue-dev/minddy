---
{
  "id": "task-notebook",
  "locale": "fr",
  "title": "Carnet de tâches",
  "summary": "Écrivez des notes rapides et transformez une tâche choisie en travail de projet lorsqu’elle doit être suivie.",
  "topic": "Planifier et retrouver le travail",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W17"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 12,
  "sourceRevision": 12,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-05",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop"
    ],
    "evidence": [
      "content/knowledge/productivity.md",
      "components/scratchpad/scratchpad-modal.tsx",
      "components/scratchpad/start-tasks.ts",
      "components/scratchpad/scratchpad-task.tsx",
      "components/scratchpad/task-item-view.tsx",
      "lib/keyboard/shortcuts.ts",
      "lib/keyboard/keyboard-context.tsx",
      "components/scratchpad/scratchpad-trigger.tsx",
      "components/editor/rich-editor.tsx",
      "components/editor/document-editor.tsx",
      "components/editor/comment-editor.tsx",
      "components/scratchpad/scratchpad-editor.tsx",
      "lib/scratchpad-search.ts",
      "components/command-palette.tsx",
      "components/editor/mobile-editor-toolbar.tsx",
      "components/editor/find-bar.tsx",
      "lib/keyboard/find-shortcut.ts",
      "components/pages/blocks/math.ts",
      "components/editor/math-edit-menu.tsx",
      "components/editor/block-selection.ts",
      "lib/use-mention-sources.ts",
      "lib/use-numo-mentionables.ts"
    ]
  },
  "review": {
    "revision": 12,
    "fact": "agent:claude-code (MIN-899: the notebook's `@` menu offering the pages of every non-hidden project with their project's name, opening a cited page in its project, and leaving out the notebook itself checked against lib/use-mention-sources.ts, lib/use-numo-mentionables.ts, lib/use-numo-mentionables.test.tsx and components/scratchpad/scratchpad-modal.tsx; the other mention types listed checked against lib/use-feature-mentions.ts; rest of the article unchanged since the previous review; no figure recaptured, the existing figure shows no `@` menu); agent:claude-code (Command/Ctrl+F find and replace bar in the open notebook checked against components/scratchpad/scratchpad-editor.tsx, components/editor/find-bar.tsx and lib/keyboard/find-shortcut.ts; equations (the `/` Equation entry, `$$…$$` typed in a line, click to edit the LaTeX with a live preview in a popover or phone sheet, red error, empty save removing it, `$…$` and `$$` fence Markdown with prices kept as text) checked against components/pages/blocks/math.ts, components/editor/math-edit-menu.tsx and lib/pages-math.test.ts; the pointer to block selection (drag, Escape, Command/Ctrl+A) in the shared editor checked against components/editor/block-selection.ts and components/scratchpad/scratchpad-editor.tsx; rest of the article unchanged since the previous review; no figure recaptured, the existing figure does not show the changed controls); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 1 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures)",
    "language": "agent:claude-code (fr changed passages with catalog UI labels; equivalent meaning to en revision 12; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-05"
  },
  "related": [
    "issues",
    "numo",
    "pages"
  ],
  "aliases": [],
  "tags": [
    "Noter des tâches dans le carnet privé"
  ],
  "figures": [
    {
      "id": "task-notebook-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/work-task-notebook.png",
      "alt": "Tâches personnelles de démonstration localisées dans le carnet.",
      "caption": "Le carnet suit des étapes personnelles hors de la hiérarchie des tickets du projet. Les états des tâches d’exemple restent inchangés.",
      "revision": 12,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        1156,
        1048
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "task-notebook-steps"
  ]
}
---

## Capturer l’idée {#task-notebook}

Ouvrez le carnet depuis les commandes personnelles, ou utilisez Commande+Maj+K sur macOS et Ctrl+Maj+K sur Windows/Linux lorsque le focus est hors d’un champ de texte. Ce bloc-notes appartient au compte et accueille notes et cases à cocher. Ajoutez le contexte, organisez des sections si utile et suivez de petites étapes personnelles avant de les convertir en tickets.

Pour retrouver une tâche, ouvrez la palette de commandes avec Commande+K sur macOS ou Ctrl+K sur Windows/Linux et tapez des mots de la tâche. Les tâches restant à faire apparaissent sous **Carnet de tâches**, avec leur section ; les tâches terminées ou annulées et les questions n’y figurent pas. Choisissez-en une pour ouvrir le carnet sur cette tâche. Tant que vous n’avez rien tapé, la palette ne liste pas les tâches du carnet.

Le carnet utilise le même éditeur que les pages du projet, avec les mêmes poignées de bloc : survolez un bloc pour le déplacer, ouvrir son menu ou ajouter un bloc avec **+**. Tapez `/` pour insérer une tâche, proposée en premier, ou un titre, une liste, une citation, un **Encadré**, un bloc de code, une **Équation**, un **Dépliant** ou un séparateur, ou choisissez **Dicter une tâche** pour énoncer vos tâches à voix haute. Le carnet reste enregistré en Markdown : Numo et les agents connectés lisent les mêmes tâches et les mêmes états. Sélectionnez du texte pour le mettre en forme ou ajouter un lien. Sélectionnez des blocs entiers comme sur une page, en faisant glisser la souris dessus, avec un rectangle de sélection tracé depuis le côté ou le dessous des notes, avec Échap ou avec Commande/Ctrl+A, comme l’explique le [guide des pages](/fr/documentation/pages#editor-formatting). Collez ou déposez une image, ou choisissez **Image** dans le menu `/`, pour l’insérer dans une note. Les autres types de fichiers vont dans les pages. Sur un téléphone, la barre au-dessus du clavier remplace les poignées de bloc, la barre de sélection et le menu `@` à la saisie ; le [guide des pages](/fr/documentation/pages#editor-formatting) la décrit. Tant que le carnet est ouvert, Commande+F sur macOS ou Ctrl+F sur Windows/Linux ouvre la même [barre de recherche et de remplacement](/fr/documentation/pages#find-and-replace) que sur une page.

Tapez `@` dans une note pour mentionner une personne, un projet, un ticket, un objectif, une page, une pull request, une routine, un cycle, un serveur MCP ou une date, de n’importe lequel de vos projets. Le menu liste les pages de tous les projets, chacune suivie du nom de son projet pour distinguer deux pages au même titre. Les projets masqués n'y figurent pas. Cliquez sur une mention pour ouvrir ce qu’elle désigne, par exemple une page dans son projet.

Le menu **Actions du carnet** (`…`) propose **Tout copier en prompt**, qui copie tout le carnet pour votre propre agent de code, et **Retirer les tâches terminées et annulées**. Le retrait demande une confirmation, supprime les tâches terminées et annulées avec les titres qu’elles laissent vides, et conserve les tâches à faire ou en cours. Pour copier moins, utilisez la commande **Copier la section en prompt** d’un titre ou **Copier en prompt** d’une tâche. Si **Démarrer le ticket ou la tâche quand je copie son prompt** est activé dans **Paramètres du compte** → **Tickets**, la copie passe aussi en cours les tâches en attente copiées.

Le carnet est privé, contrairement au wiki d’un projet. Choisissez une page pour les informations à partager avec des collègues. Numo peut lire ou modifier le carnet à votre demande ; l’adhésion d’un autre membre au projet n’en fait pas un document partagé.

![Tâches personnelles de démonstration localisées dans le carnet.](/documentation/fr/work-task-notebook.png)

## Promouvoir une tâche {#promote-note}

La promotion utilise Numo et nécessite un budget IA disponible ou une clé personnelle compatible.

1. Ouvrez le menu de la tâche et choisissez **Promouvoir en ticket**. Le carnet se ferme et Numo s’ouvre avec une demande préparée contenant la tâche et ses sous-tâches.
2. Vérifiez le projet de destination. Le projet courant est utilisé si vous en consultez un ; depuis un écran global, précisez-le dans la conversation.
3. Relisez et envoyez la demande. Ouvrir la conversation seul ne crée pas de ticket.
4. Après que Numo a annoncé la création, ouvrez le ticket et vérifiez son identifiant, son périmètre et ses propriétés. Vérifiez que le contexte de la tâche a été conservé et ajoutez les conditions de réalisation manquantes. La demande préparée invite aussi Numo à retirer la tâche du carnet une fois le ticket créé : cherchez-la donc dans le ticket plutôt que dans le carnet.

Après un échec ou un résultat réseau incertain, cherchez le ticket avant une nouvelle promotion. Gardez les autres sections intactes lorsque vous demandez une modification à Numo et vérifiez qu’il a modifié la bonne case plutôt que remplacé tout le carnet.
