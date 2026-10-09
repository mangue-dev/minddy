---
{
  "id": "minddy-mcp",
  "locale": "en",
  "title": "minddy MCP",
  "summary": "Connect an external assistant to minddy, control its access and discover the available MCP tools and safe update patterns.",
  "topic": "Numo and integrations",
  "type": "guide",
  "audiences": [
    "integrator",
    "member"
  ],
  "workflows": [
    "N09",
    "T06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12); 0.11.1 candidate (89ebb59a5)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop",
      "full",
      "managed"
    ],
    "evidence": [
      "app/(marketing)/mcp/page.tsx",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "components/settings/mcp-connect-panel.tsx",
      "components/settings/account-connected-apps-section.tsx",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "content/documentation/reviews/mcp-access-capture-candidates.json",
      "lib/server/mcp/catalog.ts",
      "lib/server/mcp/tools.ts",
      "lib/server/mcp/page-tools.ts",
      "lib/server/mcp/auth.ts",
      "app/llms-full.txt/route.ts",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "lib/server/app-origin.ts",
      "lib/server/oauth/issuer.ts",
      "app/api/oauth/register/route.ts",
      "lib/server/oauth/metadata.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root (MIN-672 MCP availability and network guidance checked against route, origin, discovery, registration and local launcher source; no operational rerun)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review); agent:/root (inline-code syntax and unchanged-text review); agent:/root (MIN-672 en network guidance and terminology review)",
    "date": "2026-10-09"
  },
  "related": [
    "numo",
    "integration-troubleshooting"
  ],
  "aliases": [
    "external-minddy-mcp",
    "mcp-tool-reference"
  ],
  "tags": [
    "Connect an external assistant to minddy MCP",
    "Use minddy MCP safely and discover its current tools"
  ],
  "figures": [
    {
      "id": "external-minddy-mcp-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/external-minddy-mcp-workflow.png",
      "alt": "minddy MCP client picker for Claude, Codex and other assistants.",
      "caption": "Select your client to display its installation command or configuration.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        252
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "external-minddy-mcp-install-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/external-minddy-mcp-install-workflow.png",
      "alt": "Codex installation dialog on the local instance.",
      "caption": "Codex installation dialog. Use your own instance origin; the displayed command was not executed for this capture.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        560,
        364
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "external-minddy-mcp-workflow",
    "external-minddy-mcp-install-workflow"
  ]
}
---

minddy MCP lets an external assistant use minddy tools under your account’s access. Connect the assistant through the instance’s setup flow, review or revoke its access in account settings, and read the current tool schemas before changing issues, pages or routines.

## Connect an external assistant to minddy MCP {#external-minddy-mcp}

Open the instance's public MCP setup page and choose the instructions for your client. Use the endpoint displayed there, ending in `/api/mcp`. For self-hosting, use your instance origin, not the Cloud origin. The client must support the remote MCP connection and OAuth flow shown by the guide.

Complete sign-in in the browser and inspect the authorization request before granting access. The connection acts as your minddy account; it does not obtain access to projects you cannot use. Start with a read request for an issue you can already open, then check that the returned project is the intended one.

![minddy MCP client picker for Claude, Codex and other assistants.](/documentation/en/external-minddy-mcp-workflow.png)

### MCP availability and network access {#network-access}

MCP is included in self-hosted minddy and starts with the application. It works out of the box at `/api/mcp` on the instance origin configured with `MINDDY_PUBLIC_APP_URL`. OAuth discovery and dynamic client registration are included: you do not need a separate MCP server, a dedicated OAuth application or a minddy Cloud proxy. Connect your MCP client to your instance endpoint, then sign in and grant access through the browser consent flow.

Availability does not guarantee network reachability. Both the MCP client and the browser used for authorization must be able to reach the advertised MCP and OAuth URLs. If you configure an explicit `OAUTH_ISSUER` override, that origin must also be reachable. The client must support the connection, OAuth flow and chosen network path; some clients require HTTPS even on private networks.

- **Same computer:** `http://localhost:6463/api/mcp` works for a compatible client running on the computer hosting the local instance. `localhost` and `127.0.0.1` refer to the computer making the connection. The desktop local-instance launcher listens only on loopback; another computer or a hosted/cloud agent cannot reach it directly. Opening the server’s localhost URL on another computer points to that other computer.

- **LAN or VPN:** an instance configured as `http://192.168.1.50` advertises `http://192.168.1.50/api/mcp`. A client on the LAN, or connected through a VPN, can use it if the listening address, configured origin, application port, firewall and routing allow access. The browser must reach the same advertised authorization URLs. This requires a reachable server installation; changing the client URL alone does not expose a loopback-only process.

- **Outside the private network:** use a reachable HTTPS origin, for example `https://tickets.example.com/api/mcp`, or another network path supported by the client. A hosted agent needs its own route to the instance; a VPN on your browser’s computer alone does not provide that route. Hosting minddy locally does not automatically expose it to the Internet.

### Scope and revocation {#access}

External clients can use available minddy tools for issues, plans, comments, pages, feedback, cycles, routines and the task notebook within their authorized permissions. The MCP server is available on every Cloud plan; running the client's AI still depends on that client's configuration and costs.

Account settings' minddy MCP section lists external client access and its revocation controls. Revoke a client when you no longer trust or use it. This is separate from MCP for Numo, which connects Numo to other services. Never paste access tokens into issues, public feedback or screenshots.

![Codex installation dialog on the local instance.](/documentation/en/external-minddy-mcp-install-workflow.png)


## Use minddy MCP safely and discover its current tools {#mcp-tool-reference}

minddy exposes `/api/mcp` with Streamable HTTP, stateless tools and OAuth 2.1. Connect as your own account through browser consent; old static `mdyk_` keys are not accepted. Start with `minddy_list_projects` to obtain accessible project UUIDs, then read the connected server tool schemas. `/llms-full.txt` is generated from those registrations and provides the exact current parameters. Do not guess tools from an old copied list. Project-scoped tools recheck access and return stable error codes.

### Read issues before changing their plans {#issue-plans}

`minddy_get_issue` accepts an issue UUID, an issue identifier such as `DEMO-42`, or a bare issue number; `project_id` is supplied separately. Its `plan_tasks` provide zero-based `task_index` values. `minddy_update_plan_task` accepts a `tasks` batch with `pending`, `in_progress`, `completed` or `cancelled` states. The whole batch fails on an invalid index. Use `minddy_append_to_plan` for additions and `minddy_edit_issue_text` with a unique exact `old_string`/`new_string` for a passage. Re-read if the match is stale; replacing the entire plan can overwrite another person’s progress. Questions under `## Questions` do not count as plan tasks.

### Use revision guards and owner scope {#pages-and-routines}

`minddy_list_pages` maps hierarchy; `minddy_search_pages` finds title/body excerpts and `minddy_get_page` reads the full Markdown, comments and database values. Use append/edit tools for partial changes and current version guards for full replacement. Preserve file/image URLs exactly. `minddy_create_page` with `database=true` creates a database; `minddy_update_page_database` requires database revision for schema edits, previous value for cells and `preview`/`apply` tokens for conversions. Owner-only routine tools create, pause, retime or remove scheduled requests. Read existing routines first to avoid duplicates. Resource uploads through `minddy_add_resource` are capped at 10 MB; page tools do not invent file URLs.

### Verify the returned state {#example}

The sanitized example updates the first task of an already-read plan. Replace the project UUID and issue with values from discovery; `task_index` must come from the latest read. Confirm returned `plan_tasks` and `plan_progress`. On access errors, check the account/project authorization; on stale conflicts, read again and apply only the intended change. Do not retry an uncertain external mutation before checking its result.

```json
{
  "project_id": "00000000-0000-4000-8000-000000000001",
  "issue": "DEMO-42",
  "tasks": [{"task_index": 0, "state": "in_progress"}]
}
```
