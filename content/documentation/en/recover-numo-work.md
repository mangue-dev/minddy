---
{
  "id": "recover-numo-work",
  "locale": "en",
  "title": "Recover stopped or waiting Numo work",
  "summary": "Identify the stopping condition and check saved results before continuing.",
  "topic": "Numo and integrations",
  "type": "troubleshooting",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N05"
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
      "components/assistant/usage-exhausted-card.tsx",
      "components/assistant/ask-user-card.tsx",
      "docs/architecture/numo-durable-turns.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "recover-numo-work-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/recover-numo-work-workflow.png",
      "alt": "Numo response reporting local code and tests, a failed branch push and no pull request at that stage.",
      "caption": "Initial partial result from a real demonstration run. At this stage the push failed and no PR existed. Verify the saved branch and external state before continuing; the conversation later recovered and the PR was corrected.",
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
    "recover-numo-work-workflow"
  ]
}
---

## Read the stopping state {#recover-numo-work}
Return to the existing conversation and read its last messages and delegated-work card. Distinguish a question awaiting input, an account budget limit, a routine cap, an operation allocation limit and a technical failure. Closing the panel is not proof that work stopped.

For a live question card, answer every required question and submit the set. Past cards are records and cannot submit a new answer. Skipping does not supply missing information or authorize dependent changes.

## Budget and failures {#recovery}
An account-limit card shows the reset date when known and may offer plan or personal-key options. A routine-limit card links to routine management; inspect the per-run cap. An operation-allocation card concerns that operation's allocation. Repeating the same request does not remove the limit. Personal model keys do not make sandbox compute free.

A failed turn can continue from a saved checkpoint only when that checkpoint survived. Inspect issue changes, branch, pull request and external services before retrying: a write may have succeeded even when its response was lost. State what remains and ask to continue the existing work. If no recoverable checkpoint exists, provide that verified state in a new request. Record the error and affected conversation when reporting a persistent failure; exclude credentials.

![Numo response reporting local code and tests, a failed branch push and no pull request at that stage.](/documentation/en/recover-numo-work-workflow.png)
