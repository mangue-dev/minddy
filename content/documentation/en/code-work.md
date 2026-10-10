---
{
  "id": "code-work",
  "locale": "en",
  "title": "Code work and pull requests",
  "summary": "Delegate issue implementation to a code worker, continue the work and review the linked pull request.",
  "topic": "Numo and integrations",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N03",
    "N04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-10",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12); MIN-676 private hosted native worker selection",
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
      "components/assistant/delegated-work-card.tsx",
      "components/pull-requests/pr-detail.tsx",
      "components/pull-requests/pr-reviews-details.tsx",
      "components/settings/native-agent-connections.tsx",
      "components/settings/native-agent-connections.test.tsx",
      "app/api/account/agent-preferences/route.ts",
      "content/documentation/reviews/min-676-native-worker-selection-2026-10-10.md"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root/native_hosting_terms (private worker selection controls and fail-closed recovery source/UI-test review; no paid Claude execution or new provider rehearsal claimed)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review); agent:/root/native_hosting_terms (localized worker selection additions and equivalent meaning; agent review, no human acceptance claimed)",
    "date": "2026-10-10"
  },
  "related": [
    "numo",
    "repository-skills"
  ],
  "aliases": [
    "delegate-code-work",
    "plans-and-agents",
    "review-pull-requests"
  ],
  "tags": [
    "Delegate an issue to a code worker",
    "Review a linked pull request"
  ],
  "figures": [
    {
      "id": "delegate-code-work-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/delegate-code-work-workflow.png",
      "alt": "Completed code-worker card with model, light reasoning, two changed files, branch, PR #1 and corrected commit.",
      "caption": "Card from the real correction of the existing PR, showing its updated commit and link. Inspect the diff and checks before merging; the completion badge alone does not establish acceptance.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        912,
        179
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "review-pull-requests-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/review-pull-requests-workflow.png",
      "alt": "Changes tab of the open demonstration PR, with the greeting function diff and an unavailable GitHub authorization notice.",
      "caption": "The real corrected PR remains open and unmerged. Its diff trims the name and uses World for an empty value. This instance cannot request user GitHub authorization; the readiness label does not grant merge permission or prove successful provider CI.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1528,
        1148
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "delegate-code-work-workflow",
    "review-pull-requests-workflow"
  ]
}
---

Code work starts from a project’s linked repository and runs in a server sandbox. Prepare the issue and delegate implementation to Numo’s code worker, then review the linked pull request and provider checks before merging.

## Delegate an issue to a code worker {#delegate-code-work}

The project needs a linked GitHub or GitLab repository, usable provider authorization and a configured server sandbox. Check **Code agent** in account AI settings. OpenCode requires a compatible API code model and reasoning configuration; the private Codex and Claude Code preview requires the selected personal account connection. Native CLI model defaults are independent of the conversation model. If native access fails, reconnect or explicitly choose OpenCode; work does not fall back to API billing.

1. Open the issue and describe expected behavior, constraints and acceptance checks.
2. Open Numo with the issue context. Ask it to inspect the repository before writing a code-level plan. Unverified filenames and APIs are not implementation evidence.
3. Request implementation explicitly. Numo delegates branch changes to the worker, which clones the linked repository in the server sandbox.
4. Follow the delegated-work card for progress, changed files, checks and any questions. Answer requested input in the conversation.
5. Open the attached pull request. Review the diff and recorded checks against the acceptance criteria before merging. A preview is available only when the deployment provider produced one.

![Completed code-worker card with model, light reasoning, two changed files, branch, PR #1 and corrected commit.](/documentation/en/delegate-code-work-workflow.png)

### Continue safely {#continuation}

A saved checkpoint can support recovery if it survived; it does not guarantee completion. Check the branch and PR before retrying a failed run. Existing plans should retain checked tasks and concurrent edits. Files present only on your computer are unavailable: push required code or skills to the repository first.

## Review a linked pull request {#review-pull-requests}

Open the pull request linked to an issue or delegated run. Repository access is still required; project membership alone does not grant forge permissions.

Read the description and activity, then inspect changed files and diff hunks. Open unresolved conversations and respond in the relevant thread rather than creating an unrelated comment. File review marks help track your reading; they are not a provider approval. Check commits, CI results and linked issues to confirm the proposed change covers the requested work.

![Changes tab of the open demonstration PR, with the greeting function diff and an unavailable GitHub authorization notice.](/documentation/en/review-pull-requests-workflow.png)

### Review and merge {#decision}

Request a reviewer when a second review is needed. An available AI review is another review input, not proof that tests passed. Check the draft or ready-for-review state, unresolved discussions, requested reviews and provider merge policy.

Merge only after the applicable checks and reviews are satisfied and your provider account has permission. A visible action can still be rejected by the forge. If the displayed state is stale, refresh and inspect the provider before repeating an action. Numo can read, comment, update readiness or merge when authorized; branch changes go to the code worker. A linked preview depends on a real provider deployment.
