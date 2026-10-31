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
  "revision": 16,
  "sourceRevision": 16,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-31",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "lib/server/mcp/catalog.ts",
      "lib/server/mcp/tools.ts",
      "lib/server/mcp/page-tools.ts",
      "lib/server/mcp/auth.ts",
      "app/llms-full.txt/route.ts",
      "lib/server/app-origin.ts",
      "lib/server/oauth/issuer.ts",
      "app/api/oauth/register/route.ts",
      "lib/server/oauth/metadata.ts",
      "lib/server/database-tool-schema.ts",
      "lib/server/page-databases.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "lib/server/issue-reads.ts",
      "components/settings/account-settings-page.tsx",
      "lib/server/project-stats.ts",
      "lib/project-stats.ts"
    ]
  },
  "review": {
    "revision": 16,
    "fact": "agent:claude (MIN-878: minddy_get_project_stats paragraph checked against lib/server/mcp/tools.ts, lib/server/project-stats.ts and lib/project-stats.ts; existing figures unaffected and kept)",
    "language": "agent:claude (en paragraph added; agent self-review, not human acceptance)",
    "date": "2026-10-31"
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
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-20",
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
      "alt": "Codex install step of the minddy MCP connection wizard, showing the minddy Cloud endpoint.",
      "caption": "This example connects to minddy Cloud. For self-hosting, use your own instance origin; the displayed command was not executed for this capture.",
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-21",
      "viewport": [
        560,
        308
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

In account settings, the minddy MCP section opens a two-step wizard for each client: copy the install command, configuration or server URL, then approve the client's sign-in. The second step says when minddy receives that access; until then, closing it only postpones the sign-in.

![minddy MCP client picker for Claude, Codex and other assistants.](/documentation/en/external-minddy-mcp-workflow.png)

### MCP availability and network access {#network-access}

MCP is included in self-hosted minddy and starts with the application. It works out of the box at `/api/mcp` on the instance origin configured with `MINDDY_PUBLIC_APP_URL`. OAuth discovery and dynamic client registration are included: you do not need a separate MCP server, a dedicated OAuth application or a minddy Cloud proxy. Connect your MCP client to your instance endpoint, then sign in and grant access through the browser consent flow.

Availability does not guarantee network reachability. Both the MCP client and the browser used for authorization must be able to reach the advertised MCP and OAuth URLs. If you configure an explicit `OAUTH_ISSUER` override, that origin must also be reachable. The client must support the connection, OAuth flow and chosen network path; some clients require HTTPS even on private networks.

- **Same computer:** `http://localhost:6463/api/mcp` works for a compatible client running on the computer hosting the local instance. `localhost` and `127.0.0.1` refer to the computer making the connection. The desktop local-instance launcher listens only on loopback; another computer or a hosted/cloud agent cannot reach it directly. Opening the server’s localhost URL on another computer points to that other computer.

- **LAN or VPN:** an instance configured as `http://192.168.1.50` advertises `http://192.168.1.50/api/mcp`. A client on the LAN, or connected through a VPN, can use it if the listening address, configured origin, application port, firewall and routing allow access. The browser must reach the same advertised authorization URLs. This requires a reachable server installation; changing the client URL alone does not expose a loopback-only process.

- **Outside the private network:** use a reachable HTTPS origin, for example `https://tickets.example.com/api/mcp`, or another network path supported by the client. A hosted agent needs its own route to the instance; a VPN on your browser’s computer alone does not provide that route. Hosting minddy locally does not automatically expose it to the Internet.

### Scope and revocation {#access}

External clients can use available minddy tools for issues, plans, comments, pages, feedback, cycles, routines and the task notebook within their authorized permissions. Tools follow your current role in each project on every call, so a role change applies without reconnecting. As a reader you get the read tools, plus the comment tools when the owner turned on **Can comment** for you. The MCP server is available on every Cloud plan; running the client's AI still depends on that client's configuration and costs.

Account settings' minddy MCP section lists external client access and its revocation controls. Revoke a client when you no longer trust or use it. This is separate from the **MCP for Numo** card in the **AI & Numo** tab, which connects Numo to other services. Never paste access tokens into issues, public feedback or screenshots.

![Codex install step of the minddy MCP connection wizard, showing the minddy Cloud endpoint.](/documentation/en/external-minddy-mcp-install-workflow.png)


## Use minddy MCP safely and discover its current tools {#mcp-tool-reference}

minddy exposes `/api/mcp` with Streamable HTTP, stateless tools and OAuth 2.1. Connect as your own account through browser consent; old static `mdyk_` keys are not accepted. Start with `minddy_list_projects` to obtain accessible project UUIDs, then read the connected server tool schemas. `/llms-full.txt` is generated from those registrations and provides the exact current parameters. Do not guess tools from an old copied list. Project-scoped tools recheck access and return stable error codes.

### Read issues before changing their plans {#issue-plans}

To find an issue, call `minddy_list_issues` with `query`: it matches title and description words, an identifier or a number. Text matches and exact identifiers come first; a descriptive query can then add issues of the same project found [by meaning](/docs/navigation#search-by-meaning), marked `match: "semantic"`. Read such an issue before acting on it. Search by meaning is charged to your account as **Issue search** and is skipped when you turned off **Index issues**.

`minddy_get_issue` accepts an issue UUID, an issue identifier such as `DEMO-42`, or a bare issue number; `project_id` is supplied separately. Its `plan_tasks` provide zero-based `task_index` values. `minddy_update_plan_task` accepts a `tasks` batch with `pending`, `in_progress`, `completed` or `cancelled` states. The whole batch fails on an invalid index. Use `minddy_append_to_plan` for additions and `minddy_edit_issue_text` with a unique exact `old_string`/`new_string` for a passage. Re-read if the match is stale; replacing the entire plan can overwrite another person’s progress. Questions under `## Questions` do not count as plan tasks.

`minddy_get_project_stats` reads the statistics of a project's General settings: issues per status; open, overdue, unassigned and stalled counts; the overdue and stalled issues themselves, most urgent first; the momentum over four weeks; the median lead time; issues created and completed per week; the top contributors; and the linked pull requests. A stalled issue is in progress or in review with no change for 14 days. The tool is read-only and open to every role, readers included.

To change several issues, send one `minddy_update_issues` call: `issues` with `fields` applies the same change to every issue, and `updates` adds issues that each get their own fields. One call takes up to 50 issues, each listed once, and reports `updated` and `failed` per issue, so one failure does not stop the others. Other repeated writes take a list of further items next to their usual fields: `links` for `minddy_link_issues`, `edits` for `minddy_edit_issue_text` and `minddy_edit_page_text` (applied in order; if one does not match, nothing is written), `pages` for `minddy_create_page` (pages under the same parent, such as database entries) and `feedback_post_ids` for `minddy_update_feedback`. `minddy_update_page` with `parent_page_id` moves a page in the tree, or to the root with `null`. The task notebook and objective descriptions are patched the same way: `minddy_edit_scratchpad_text` rewrites or removes passages of the notebook, and `minddy_update_objective` accepts `description_edits` instead of a whole `description`. `minddy_append_to_plan` with `field: "description"` adds a block at the end of an issue's description, and `description_append` does the same for an objective; an objective patch is refused, not applied, if the objective changed since it was read.

Reads that return text with images (`minddy_get_issue`, `minddy_get_objective`, `minddy_get_page`, `minddy_get_feedback`, `minddy_get_scratchpad`) list them under `images`, each with its `src` and alt text. Pass that `src` exactly to `minddy_get_image`: it checks your access to the image's project, or that a notebook image is yours, and returns the image inline up to 10 MB with a signed `download_url` valid about ten minutes. An image hosted outside minddy comes back as its URL only.

### Use revision guards and owner scope {#pages-and-routines}

`minddy_list_pages` maps hierarchy; `minddy_search_pages` finds title/body excerpts and `minddy_get_page` reads the full Markdown, comments and database values. Use append/edit tools for partial changes and current version guards for full replacement. Preserve file/image URLs exactly. `minddy_create_page` with `database=true` creates a database; `minddy_update_page_database` requires the database revision for schema edits and the previous value for cell edits. To fill a database in fewer calls, pass `values` to `minddy_create_page` to create an entry with its properties, or use `operation=values` to change several properties of one entry at once: every cell is written together or none is.

For a type conversion, use `operation=convert` with `propertyId`, `targetType`, `revision` and `preview=true`. Inspect `incompatibleCount`, then submit the same settings with `preview=false` and the returned `token`. Set `confirmLoss=true` only after the user explicitly authorizes clearing incompatible values.

Owner-only routine tools create, change, pause or remove routines with a schedule, an event or a new database entry as their trigger. Read existing routines first to avoid duplicates. Resource uploads through `minddy_add_resource` are capped at 10 MB; page tools do not invent file URLs.

### Verify the returned state {#example}

The sanitized example updates the first task of an already-read plan. Replace the project UUID and issue with values from discovery; `task_index` must come from the latest read. Confirm returned `plan_tasks` and `plan_progress`. On access errors, check the account/project authorization; on stale conflicts, read again and apply only the intended change. Do not retry an uncertain external mutation before checking its result.

```json
{
  "project_id": "00000000-0000-4000-8000-000000000001",
  "issue": "DEMO-42",
  "tasks": [{"task_index": 0, "state": "in_progress"}]
}
```


## Choose an objective for feedback {#feedback-objectives}

Feedback reads include `objective_id`; `minddy_list_feedback` accepts an optional objective filter (`null` selects requests without an objective). Use `minddy_link_feedback_objective` with `project_id`, `feedback_post_id` and `objective_id` only when the user explicitly requests the association; `null` clears it. The objective must be active and in the same project. Objective detail reads include `linked_feedback`. The owner can supply `objective_id` to `minddy_create_integration` for a feedback key, or change the default with `minddy_update_integration_objective`. Existing feedback keeps its choice. Promotion inherits the objective and categories, and Numo review never assigns an objective.
