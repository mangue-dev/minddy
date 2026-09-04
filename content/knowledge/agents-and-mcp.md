---
id: agents-and-mcp
title: Agents and MCP
summary: Connect external agents to minddy and give Numo access to personal MCP tools.
category: automation
audience: both
tags: [agent, mcp, oauth, codex, claude, cursor]
lastReviewed: 2026-09-04
---

minddy exposes an OAuth-based MCP server. Compatible coding agents can read issues and their context, update status and properties, write plans and comments, create linked issues and objectives, and work with project pages. The MCP setup page provides the endpoint and setup instructions for supported clients.

Numo is the assistant built into minddy. The optional code agent works from an issue: in the cloud it clones a linked GitHub or GitLab repository into an isolated environment, and the desktop app can also run it on a local folder the user attaches, where the changes stay in the working copy. It can plan, implement, run checks, and attach its pull request to the issue. The MCP server and Numo are available on every plan; available AI usage and model choices depend on the account plan or an optional personal API key.

## Connect Numo to an MCP server

In **Account settings → MCP → Connect Numo to your tools**, choose a service or
select **Add another MCP server**. The catalog is a shortcut, not an allowlist:
unlisted public HTTPS servers work through the same connection flow. The catalog
includes Notion, Linear, Google Workspace, GitHub, Atlassian, Slack, Figma, Asana,
Canva, Sentry, Supabase, Vercel, and Stripe. Each entry links to its provider's
setup documentation and shows prerequisites. Provider endpoints were checked
against those documents on September 4, 2026.

Choose **Sign in with OAuth** to authorize in the provider's browser flow. Minddy
supports discovery, dynamic registration, PKCE, and refresh tokens. Providers that
require an existing OAuth application can use the client ID and secret under
**OAuth app settings**; register the callback URL shown there with the provider.
Google Workspace servers are in developer preview and require an OAuth app and
preview access. Slack requires an internal or Marketplace app, Asana requires a
registered MCP app, and Figma requires provider approval of the MCP client. An
entry in the catalog does not bypass these provider restrictions.

Alternatively, choose **Bearer token** or **No authentication**. Advanced settings
accept encrypted custom headers, such as `X-API-Key`, and legacy **SSE** transport;
**Streamable HTTP** is the default. URLs can include non-secret configuration
parameters such as Supabase's project scope. Put credentials in authentication or
custom headers, never in the URL. Local commands and private network endpoints
are not supported by this server-side connection flow.

Use **Test connection** to verify discovery. Connections belong to your account
and work across projects in Numo chat and agent sessions, including local agents.
Only connect servers you trust with the information and actions you ask Numo to
send. Remote descriptions and results cannot authorize additional actions.

Project routines use the project owner's connections, including saved OAuth
refresh tokens. An agent session steered by another member cannot use the
original owner's personal connections. A routine whose project ownership has
changed cannot use the previous owner's connections; start a new routine session
under the current owner.

Edit, disable, or remove a connection at any time. Disabling or removing stops
new calls; a request already sent may still finish. Secrets are encrypted with
`AI_KEY_ENCRYPTION_SECRET` and never returned to the browser or agent sandbox.
Blank credential fields preserve existing values. Changing the URL clears saved
credentials and headers. Use **Remove saved token** to clear a bearer token, or
enter `{}` in custom headers to remove them. Reconnect if OAuth access expires or
is revoked. Concurrent OAuth operations on the same connection are serialized by
a database lease to protect rotating refresh tokens.

Calls have a 30-second deadline, a 1 MiB transport limit, and a 64 KB tool-result
limit. Discovery is paginated. If a remote write times out, verify its outcome on
the server before retrying: it may already have completed.
