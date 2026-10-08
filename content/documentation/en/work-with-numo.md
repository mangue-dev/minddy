---
{
  "id": "work-with-numo",
  "locale": "en",
  "title": "Complete a project task with Numo",
  "summary": "Open a conversation with page context, choose a model and check the result.",
  "topic": "Numo and integrations",
  "type": "tutorial",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N01"
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
      "content/knowledge/agents-and-mcp.md",
      "components/assistant-panel.tsx",
      "components/assistant/chat-input.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "numo-permissions-and-approvals",
    "delegate-code-work",
    "recover-numo-work",
    "numo-mcp-connections",
    "external-minddy-mcp"
  ],
  "aliases": [
    "agents-and-mcp"
  ],
  "tags": [],
  "figures": [
    {
      "id": "work-with-numo-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/work-with-numo-workflow.png",
      "alt": "Numo demonstration conversation with page context, a priority-change request and its saved answer.",
      "caption": "Existing demonstration thread, localized for display. The saved answer names AUR-11 and AUR-7; this capture does not prove a new execution.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1200,
        900
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "work-with-numo-workflow"
  ]
}
---

## Start from the work {#work-with-numo}
Open the issue or project you want to work on, then use the floating Numo button. The current page becomes conversation context. Contextual actions that hand work to Numo open this same panel. You need access to the project and available AI usage or a compatible personal key.

1. Check the context shown in the composer. Name the issue explicitly if several items are relevant.
2. Choose the conversation model and reasoning level. These choices affect the conversation; the code worker has separate account defaults.
3. Send a bounded request, for example: “Read this issue and propose acceptance criteria. Do not change its status.”
4. Read the answer and follow its issue or source links. For an action request, open the changed object and check the result.

![Numo demonstration conversation with page context, a priority-change request and its saved answer.](/documentation/en/work-with-numo-workflow.png)


## Continue or delegate {#continue}
The conversation list keeps earlier conversations reachable. Continue the existing conversation when it contains the needed decisions. For repository changes, Numo delegates to a worker in a server sandbox and displays progress, files, checks and the pull request. It does not work in your desktop folder.

If Numo asks for input, submit the requested choice before expecting dependent work to continue. A usage or failure card explains why a turn stopped. Verify any external write before asking it to repeat the action.
