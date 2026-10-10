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
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-10",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
      "app/api/mcp/route.ts",
      "content/documentation/reviews/second-pass-ai-integrations-2026-10-10.md"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root/second_ai_integrations (second lightweight pre-merge source review; personal outbound MCP policy distinguished from incoming minddy MCP; no operational rerun)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review); agent:/root/second_ai_integrations (localized MCP scope and network-access cross-link review)",
    "date": "2026-10-10"
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
