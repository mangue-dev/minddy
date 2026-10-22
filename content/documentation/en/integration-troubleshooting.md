---
{
  "id": "integration-troubleshooting",
  "locale": "en",
  "title": "Connection troubleshooting",
  "summary": "minddy MCP connects an external assistant to minddy; personal MCP connections let Numo call another server.",
  "topic": "Technical concepts",
  "type": "troubleshooting",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "T08"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "desktop",
      "mobile",
      "full",
      "managed"
    ],
    "evidence": [
      "content/knowledge/agents-and-mcp.md",
      "docs/github-issue-sync.md",
      "lib/server/integration-auth.ts",
      "lib/mcp-authorization.ts",
      "lib/server/mcp-http.ts",
      "lib/server/mcp-client.ts",
      "lib/server/safe-fetch.ts",
      "app/api/mcp/route.ts"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, no correction needed; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (en changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:claude-code (en manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "api-and-webhooks",
    "minddy-mcp"
  ],
  "aliases": [],
  "tags": [
    "Recover an OAuth, MCP, webhook or Git connection failure"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Locate the failed connection {#integration-troubleshooting}

minddy MCP connects an external assistant to minddy; personal MCP connections let Numo call another server. They have different account tabs and credentials. For personal MCP, inspect the connection status in account settings and use its test/reconnect action. OAuth discovery, dynamic registration, PKCE and refresh are supported, but a catalog entry does not bypass provider approval, developer preview or registered-app requirements. Confirm current provider requirements before assuming a minddy defect.


## Reconnect without losing the access boundary {#oauth}

Register the exact displayed callback in the provider OAuth app when existing client credentials are required. Desktop OAuth opens in the system browser and returns to the app. Personal MCP connections used by Numo require public HTTPS; local commands and private network servers are unsupported. For an external assistant connecting to minddy MCP, see [network access for your instance](/docs/minddy-mcp#network-access). Put bearer tokens and custom secrets in authentication/headers, not query URLs. Changing the URL clears saved credentials and headers. Disabling/removing stops new calls, but a request already sent may finish. Routine connections belong to the current project owner; ownership changes cannot reuse the previous owner’s personal access.

## Inspect the outcome before repeating a call {#webhooks}

Calls from Numo to personal MCP servers have a 30-second deadline, 1 MiB transport limit and 64 KB result limit. A timeout does not prove a remote mutation failed. Check the destination before retrying. For API 401, verify key kind/instance and revocation without logging the key; wrong kind returns 403. For webhooks, inspect last status, public destination reachability, raw-body HMAC verification and `delivery_id` deduplication. Best-effort dropped deliveries have no durable retry queue. Preserve controlled codes and times, removing private content and credentials.

## Check provider permissions and synchronization {#git}

Git adapters target github.com and gitlab.com. Confirm the linked repository, installation access and selected connection channel. GitHub issue synchronization needs Issues read/write and Issues, Issue comments and Issue dependencies webhook subscriptions; existing installations must accept changed permissions. Older payload timestamps cannot overwrite newer local edits. Duplicate deliveries use remote identities to avoid repeats. Inline attachment URLs remain forge links rather than copied file bytes. Verify remote and local state before reconnecting or retrying a write and share only redacted diagnostics.
