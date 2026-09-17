---
id: agents-and-mcp
title: Numo and MCP
summary: Work with Numo in minddy and connect external agents or personal MCP tools.
category: automation
audience: both
tags: [agent, mcp, oauth, codex, claude, cursor]
lastReviewed: 2026-09-17
---

Numo is minddy's built-in conversation for understanding and acting on project work. The **Numo** page is the main place to start or find conversations. The floating Numo button is a compact view of that same experience: it adds the current page as context, and a conversation started there remains available on the Numo page. Contextual actions such as **Hand to Numo** also enter this common conversation instead of opening a separate agent destination.

Choose the conversation model and reasoning level in Numo's composer. When a request needs repository work, Numo delegates it to a code worker and shows its progress, changed files, checks, and pull request inside the conversation. The worker always uses the code model and reasoning level configured in **Account settings → AI**. It clones the project's linked GitHub or GitLab repository into the configured server sandbox; it does not run in a folder on the user's computer.

Routines are scheduled Numo requests. Each occurrence starts a new Numo conversation with the saved instruction and project context. Numo can use Minddy tools directly and delegate repository work only when needed. The conversation records the result and any request for user input.

minddy also exposes an OAuth-based MCP server for external tools. Compatible coding agents can read issues and their context, update status and properties, write plans and comments, create linked issues and objectives, and work with project pages. The MCP setup page provides the endpoint and setup instructions for supported clients. The MCP server and Numo are available on every plan; available AI usage and model choices depend on the account plan or an optional personal API key.

## Connect Numo to an MCP server

In **Account settings → MCP for Numo**, choose a service or
select **Add another MCP server**. The catalog is a shortcut, not an allowlist:
unlisted public HTTPS servers work through the same connection flow. The catalog
includes Notion, Linear, Google Workspace, GitHub, Atlassian, Slack, Figma, Asana,
Canva, Sentry, Supabase, Vercel, and Stripe. Services open a connection dialog with
their configuration already filled in. Provider prerequisites and setup links
appear when needed. Provider endpoints were checked
against those documents on September 4, 2026.

Numo can do this setup for you in a conversation: ask it to configure a service
("configure the Notion MCP") and it resolves the service in the catalog, checks
the provider's current prerequisites online first (an OAuth app to register, a
developer-preview or approval program, per-service restrictions), then creates
the connection enabled and waiting for authentication. It answers with the exact
remaining step — usually the provider's OAuth authorization link to open right
away, or where to enter credentials such as a bearer token or an OAuth app's
client id and secret. Connections created this way appear in Account settings →
MCP for Numo like any other, where they can be edited, tested, disabled or
removed. An unattended routine cannot create connections: this setup only runs
in a conversation with you.

Choose **Connect** to add the service and open the provider's OAuth flow. In the desktop app, that flow opens in the system browser and returns to the app when it completes. An
installed OAuth connection that is not authenticated shows an orange triangle;
hover or focus it to see its status, then use **Connect** to try again. Minddy
supports discovery, dynamic registration, PKCE, and refresh tokens. Providers that
require an existing OAuth application can use the client ID and secret under
**Advanced settings → OAuth app settings**; register the callback URL shown there with the provider.
Google Workspace servers are in developer preview and require an OAuth app and
preview access. Slack requires an internal or Marketplace app, Asana requires a
registered MCP app, and Figma requires provider approval of the MCP client. An
entry in the catalog does not bypass these provider restrictions.

Alternatively, choose **Bearer token** or **No authentication** in advanced settings. These settings
accept encrypted custom headers, such as `X-API-Key`, and legacy **SSE** transport;
**Streamable HTTP** is the default. URLs can include non-secret configuration
parameters such as Supabase's project scope. Put credentials in authentication or
custom headers, never in the URL. Local commands and private network endpoints
are not supported by this server-side connection flow.

Use the connection's menu to edit, test, disable or remove it. **Minddy MCP** is
the separate account tab for connecting external assistants such as Claude or
Codex to Minddy. Connections for Numo belong to your account and work across
projects in Numo conversations and scheduled requests.
Only connect servers you trust with the information and actions you ask Numo to
send. Remote descriptions and results cannot authorize additional actions.

Project routines use the project owner's connections, including saved OAuth
refresh tokens. A conversation continued by another member cannot use the
original owner's personal connections. A routine whose project ownership has
changed cannot use the previous owner's connections; start a new occurrence
under the current owner.

Edit, disable, or remove a connection at any time. Disabling or removing stops
new calls; a request already sent may still finish. Secrets are encrypted with
`AI_KEY_ENCRYPTION_SECRET` and never returned to the browser or code-worker sandbox.
Blank credential fields preserve existing values. Changing the URL clears saved
credentials and headers. Use **Remove saved token** to clear a bearer token, or
enter `{}` in custom headers to remove them. Reconnect if OAuth access expires or
is revoked. Concurrent OAuth operations on the same connection are serialized by
a database lease to protect rotating refresh tokens.

Calls have a 30-second deadline, a 1 MiB transport limit, and a 64 KB tool-result
limit. Discovery is paginated. If a remote write times out, verify its outcome on
the server before retrying: it may already have completed.
