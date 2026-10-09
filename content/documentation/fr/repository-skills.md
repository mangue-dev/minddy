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
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
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
      "components/assistant/skill-preview-dialog.tsx",
      "content/documentation/reviews/repository-skill-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root (inline-code syntax and unchanged-text review)",
    "date": "2026-10-09"
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
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        996,
        888
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "repository-skills-workflow"
  ]
}
---

## Rendre le skill accessible {#repository-skills}

Numo lit les fichiers `SKILL.md` dans les sous-dossiers de `.agents/skills`, `.claude/skills`, `.github/skills`, `.cursor/skills`, `.codex/skills` et `.gemini/skills`, dans cet ordre de priorité. Le nom et la description du frontmatter identifient le skill ; scripts et références peuvent rester à côté.

Commitez et poussez ces fichiers dans le dépôt GitHub ou GitLab lié. Choisissez la référence du dépôt appropriée si nécessaire. Les fichiers uniquement locaux sont indisponibles. La liste s’actualise à l’ouverture de la conversation ou au changement de projet.

## Sélectionner et examiner {#selection}

Utilisez `/`, `$` ou le menu `+` et prévisualisez les instructions avant l’envoi. Sélectionnez jusqu’à cinq skills ; les badges verts indiquent la sélection. `$` présente seulement les skills du dépôt, `/` comprend aussi d’autres commandes.

La sélection s’applique à ce tour utilisateur. Celle d’une routine s’applique à chaque occurrence. Ce sont des fichiers du dépôt, pas des installations globales du compte ; ils ne remplacent pas les consignes système ou de sécurité. Pour créer ou modifier un skill, changez ses fichiers ou demandez à Numo de déléguer ce travail, puis poussez avant de sélectionner la nouvelle version.

![Prévisualisation d’un skill du dépôt avec son nom stable, son chemin et ses instructions complètes.](/documentation/fr/repository-skills-workflow.png)
