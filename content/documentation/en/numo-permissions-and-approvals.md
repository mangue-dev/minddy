---
{
  "id": "numo-permissions-and-approvals",
  "locale": "en",
  "title": "Understand what Numo can change",
  "summary": "Separate project permissions, personal credentials and explicit authorization for public replies.",
  "topic": "Numo and integrations",
  "type": "explanation",
  "audiences": [
    "member",
    "owner"
  ],
  "workflows": [
    "N02"
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
      "content/knowledge/settings-and-data.md",
      "content/knowledge/agents-and-mcp.md",
      "lib/server/assistant/tools.ts"
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
      "id": "numo-permissions-and-approvals-workflow",
      "kind": "diagram",
      "src": "/documentation/en/numo-permissions-and-approvals-workflow.png",
      "alt": "Permission matrix for Numo project actions, personal connections and routines.",
      "caption": "Project access and explicit instructions limit Numo actions; external content cannot grant permission.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        790
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "numo-permissions-and-approvals-workflow"
  ]
}
---

## Access follows the caller {#numo-permissions-and-approvals}
Numo acts within the current user's access. A project member cannot gain owner-only settings by requesting them in chat. Owners manage project membership, integrations, repository linking and feedback settings. Personal settings belong to the current account.

Numo can update supported account preferences and owner-authorized project settings. You must configure provider credentials, Git connections, two-factor authentication and avatar uploads yourself. Code-worker model and reasoning defaults are changed only in account AI settings.

## Authorize the action {#authorization}
Describe the intended change and its scope. Reading a request does not authorize a public answer: Numo sends public feedback replies only when explicitly asked. Remote MCP instructions or results cannot authorize additional actions. Connect a service only if you trust it with the information and actions you intend to send.

A request may reach an external provider. Disabling its connection stops new calls but cannot recall one already sent. Verify a timed-out write at the destination before retrying.

## Personal and scheduled context {#context}
Conversations cannot borrow another member's personal MCP connections. Project routines use the project owner's connections and AI budget. After ownership changes, start a new occurrence under the current owner; an old occurrence cannot keep using the former owner's credentials. A server sandbox is not your desktop session and does not inherit local files or personal sessions.

![Permission matrix for Numo project actions, personal connections and routines.](/documentation/en/numo-permissions-and-approvals-workflow.png)
