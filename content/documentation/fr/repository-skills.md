---
{
  "id": "repository-skills",
  "locale": "fr",
  "title": "Skills du dépôt",
  "summary": "Publier des instructions réutilisables dans le dépôt lié et sélectionner celles nécessaires.",
  "topic": "Numo et intégrations",
  "type": "guide",
  "audiences": [
    "member",
    "integrator"
  ],
  "workflows": [
    "N07"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "content/knowledge/repository-skills.md",
      "components/assistant/skill-preview-dialog.tsx"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (fr translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (fr manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Utiliser des skills du dépôt"
  ],
  "figures": [
    {
      "id": "repository-skills-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/repository-skills-workflow.png",
      "alt": "Prévisualisation d’un skill du dépôt avec son nom stable, son chemin et ses instructions complètes.",
      "caption": "Relisez le skill avant de le joindre à un message. Ce vrai skill de démonstration demande `npm test` et interdit de fusionner la pull request ; sa prévisualisation n’exécute aucune de ces actions.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        916,
        868
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "repository-skills-workflow"
  ]
}
---

## Rendre le skill accessible {#repository-skills}

Numo lit les fichiers `SKILL.md` dans les sous-dossiers de `.agents/skills`, `.claude/skills`, `.github/skills`, `.cursor/skills`, `.codex/skills` et `.gemini/skills`, dans cet ordre de priorité. Le nom et la description du frontmatter identifient le skill ; scripts et références peuvent rester à côté.

Commitez et poussez ces fichiers sur la branche par défaut du dépôt GitHub ou GitLab lié : Numo lit les skills depuis cette branche. Les fichiers présents uniquement sur votre ordinateur ou sur une autre branche sont indisponibles. La liste s’actualise à l’ouverture de la conversation ou au changement de projet.

## Sélectionner et examiner {#selection}

Utilisez `/`, `$` ou le menu `+` et prévisualisez les instructions avant l’envoi. Sélectionnez jusqu’à cinq skills ; les badges verts indiquent la sélection. `$` présente seulement les skills du dépôt, `/` comprend aussi d’autres commandes. Dans l’instruction d’une routine, tapez `$` pour insérer une skill ; `/` ouvre le menu des blocs de l’éditeur.

La sélection s’applique à ce tour utilisateur. Celle d’une routine s’applique à chaque occurrence. Ce sont des fichiers du dépôt, pas des installations globales du compte ; ils ne remplacent pas les consignes système ou de sécurité. Pour créer ou modifier un skill, modifiez ses fichiers vous-même ou avec votre propre agent de code, puis poussez avant de sélectionner la nouvelle version.

![Prévisualisation d’un skill du dépôt avec son nom stable, son chemin et ses instructions complètes.](/documentation/fr/repository-skills-workflow.png)
