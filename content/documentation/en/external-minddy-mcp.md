---
{
  "id": "external-minddy-mcp",
  "locale": "en",
  "title": "Connect an external assistant to Minddy MCP",
  "summary": "Authorize a compatible MCP client on the correct instance and revoke access when needed.",
  "topic": "Numo and integrations",
  "type": "guide",
  "audiences": [
    "integrator",
    "member"
  ],
  "workflows": [
    "N09"
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
      "app/(marketing)/mcp/page.tsx",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "components/settings/mcp-connect-panel.tsx",
      "components/settings/account-connected-apps-section.tsx",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "content/documentation/reviews/mcp-access-capture-candidates.json"
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
      "id": "external-minddy-mcp-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/external-minddy-mcp-workflow.png",
      "alt": "Minddy MCP client picker for Claude, Codex and other assistants.",
      "caption": "Select your client to display its installation command or configuration.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "external-minddy-mcp-install-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/external-minddy-mcp-install-workflow.png",
      "alt": "Codex installation dialog on the local instance.",
      "caption": "Codex installation dialog on the local instance. Use your own instance origin; the displayed command was not executed for this capture.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "external-minddy-mcp-accesses-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/external-minddy-mcp-accesses-workflow.png",
      "alt": "Connected applications list with no active grant.",
      "caption": "Review authorized applications here. The demonstration account has no active grant; no authorization or revocation was executed.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "external-minddy-mcp-workflow",
    "external-minddy-mcp-install-workflow",
    "external-minddy-mcp-accesses-workflow"
  ]
}
---

## Configure the client {#external-minddy-mcp}
Open the instance's public MCP setup page and choose the instructions for your client. Use the endpoint displayed there, ending in `/api/mcp`. For self-hosting, use your instance origin, not the Cloud origin. The client must support the remote MCP connection and OAuth flow shown by the guide.

Complete sign-in in the browser and inspect the authorization request before granting access. The connection acts as your Minddy account; it does not obtain access to projects you cannot use. Start with a read request for an issue you can already open, then check that the returned project is the intended one.

![Minddy MCP client picker for Claude, Codex and other assistants.](/documentation/en/external-minddy-mcp-workflow.png)


## Scope and revocation {#access}
External clients can use available Minddy tools for issues, plans, comments, pages, feedback, cycles, routines and the task notebook within their authorized permissions. The MCP server is available on every Cloud plan; running the client's AI still depends on that client's configuration and costs.

Account settings' Minddy MCP section lists external client access and its revocation controls. Revoke a client when you no longer trust or use it. This is separate from MCP for Numo, which connects Numo to other services. Never paste access tokens into issues, public feedback or screenshots.

![Codex installation dialog on the local instance.](/documentation/en/external-minddy-mcp-install-workflow.png)

![Connected applications list with no active grant.](/documentation/en/external-minddy-mcp-accesses-workflow.png)
