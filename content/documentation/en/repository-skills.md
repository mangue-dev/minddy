---
{
  "id": "repository-skills",
  "locale": "en",
  "title": "Repository skills",
  "summary": "Publish reusable instructions in the linked repository and select only the skills needed.",
  "topic": "Numo and integrations",
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
  "revision": 3,
  "sourceRevision": 3,
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
    "revision": 3,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Use repository skills in a turn or routine"
  ],
  "figures": [
    {
      "id": "repository-skills-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/repository-skills-workflow.png",
      "alt": "Repository skill preview with its stable name, file path and complete instructions.",
      "caption": "Preview the skill before attaching it to a message. This real demonstration skill requests npm test and forbids merging the pull request; previewing it does not run either action.",
      "revision": 3,
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

## Make the skill discoverable {#repository-skills}

Numo reads `SKILL.md` files in skill subdirectories under `.agents/skills`, `.claude/skills`, `.github/skills`, `.cursor/skills`, `.codex/skills` and `.gemini/skills`, in that precedence order. The frontmatter name and description identify the skill; supporting scripts and references can sit beside it.

Commit and push these files to the linked GitHub or GitLab repository. Choose the appropriate repository ref when needed. Desktop-only files are unavailable. The skill list refreshes when the conversation opens or its project changes.

## Select and inspect {#selection}

Use `/`, `$` or the `+` menu and preview the instructions before sending. Select up to five skills; green badges show the selection. `$` lists repository skills only, while `/` also includes other commands.

The selection applies to that user turn. Skills selected in a routine apply to every occurrence. They are repository files, not global account installations, and cannot override system or safety instructions. To create or revise one, edit the repository files or ask Numo to delegate that code work, then push the change before selecting the new version.

![Repository skill preview with its stable name, file path and complete instructions.](/documentation/en/repository-skills-workflow.png)
