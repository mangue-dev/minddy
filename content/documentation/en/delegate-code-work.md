---
{
  "id": "delegate-code-work",
  "locale": "en",
  "title": "Delegate an issue to a code worker",
  "summary": "Prepare repository access, follow the run and verify the attached pull request.",
  "topic": "Numo and integrations",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N03"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
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
      "content/knowledge/plans-and-agents.md",
      "content/knowledge/agents-and-mcp.md",
      "components/assistant/delegated-work-card.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "review-pull-requests",
    "recover-numo-work",
    "repository-skills"
  ],
  "aliases": [
    "plans-and-agents"
  ],
  "tags": [],
  "figures": [
    {
      "id": "delegate-code-work-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/delegate-code-work-workflow.png",
      "alt": "Completed code-worker card with model, light reasoning, two changed files, branch, PR #1 and corrected commit.",
      "caption": "Card from the real correction of the existing PR, showing its updated commit and link. Inspect the diff and checks before merging; the completion badge alone does not establish acceptance.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1480,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "delegate-code-work-workflow"
  ]
}
---

## Prepare a bounded implementation {#delegate-code-work}
The project needs a linked GitHub or GitLab repository, usable provider authorization and a configured server sandbox. Check the worker model and reasoning in account AI settings. The conversation model does not replace those defaults.

1. Open the issue and describe expected behavior, constraints and acceptance checks.
2. Open Numo with the issue context. Ask it to inspect the repository before writing a code-level plan. Unverified filenames and APIs are not implementation evidence.
3. Request implementation explicitly. Numo delegates branch changes to the worker, which clones the linked repository in the server sandbox.
4. Follow the delegated-work card for progress, changed files, checks and any questions. Answer requested input in the conversation.
5. Open the attached pull request. Review the diff and recorded checks against the acceptance criteria before merging. A preview is available only when the deployment provider produced one.

![Completed code-worker card with model, light reasoning, two changed files, branch, PR #1 and corrected commit.](/documentation/en/delegate-code-work-workflow.png)


## Continue safely {#continuation}
A saved checkpoint can support recovery if it survived; it does not guarantee completion. Check the branch and PR before retrying a failed run. Existing plans should retain checked tasks and concurrent edits. Files present only on your computer are unavailable: push required code or skills to the repository first.
