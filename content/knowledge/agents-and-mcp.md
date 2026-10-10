---
id: agents-and-mcp
title: Numo and MCP
summary: Work with Numo in minddy and connect external agents or personal MCP tools.
category: automation
audience: both
tags: [agent, mcp, oauth, codex, claude, cursor]
lastReviewed: 2026-10-07
---

Numo is minddy's built-in conversation for understanding and acting on project work. The floating Numo button is the one place conversations live: it opens the Numo panel, adds the current page as context, and keeps every conversation reachable from its conversation list. Contextual actions such as **Hand to Numo** enter this same conversation instead of opening a separate agent destination, and links to the retired dedicated Numo page open the panel too.

Choose the conversation model and reasoning level in Numo's composer. When a request needs repository work, Numo delegates it to a code worker and shows its progress, changed files, checks, and pull request inside the conversation. **Account settings → AI** selects the worker engine. OpenCode uses the configured API code model and reasoning. In the private preview, enabled accounts can connect their own Codex or Claude Code subscription and select that native CLI for new workers; the CLI chooses its model and reasoning defaults. The worker clones the project's linked GitHub or GitLab repository into the configured hosted server sandbox. The connection is restored for new sandboxes; no local computer or permanently running sandbox is required.

The native preview exposes guarded Minddy tools through MCP. Provider-native built-in tools, image input and subagents are unavailable in these adapters. Numo reads the selected adapter capabilities and receives the frozen worker capabilities with its result. It mediates worker questions using reliable conversation context, or asks you when a decision is missing. Numo can use its own supported tools within your authorization; it does not invent unsupported harness operations.

Native authentication or subscription limits stop native work without switching to an API provider or another payer. Users reconnect the selected account or explicitly choose OpenCode. Existing workers keep their frozen engine. Native subscriptions fund native model usage; Numo calls and sandbox compute still follow Minddy usage and budget rules. Paid Claude Code execution remains unvalidated in this preview. The native connection controls include a two-sandbox access and Minddy-tool diagnostic; unobserved authentication renewal is reported separately.

Routines are scheduled Numo requests. Each occurrence starts a new Numo conversation with the saved instruction and project context. Numo can use Minddy tools directly and delegate repository work only when needed. The conversation records the result and any request for user input.

minddy also exposes an OAuth-based MCP server for external tools. Compatible coding agents can read issues and their context, update status and properties, write plans and comments, create linked issues and objectives, and work with project pages, feedback posts, cycles, routines, and the task notebook. The MCP setup page provides the endpoint and setup instructions for supported clients. The MCP server and Numo are available on every plan; available AI usage and model choices depend on the account plan or an optional personal API key.

## Connect Numo to an MCP server

In **Account settings → MCP for Numo**, choose a service or
select **Add another MCP server**. The catalog is a shortcut, not an allowlist:
unlisted public HTTPS servers work through the same connection flow, and the same
search also reaches servers in the public MCP registry. The catalog includes Gmail
and the other Google services (Drive, Calendar, Docs, Sheets, Slides, Chat,
Contacts), Notion, Linear, GitHub, GitLab, Atlassian, Slack, Figma, Asana, Canva,
Sentry, Supabase, Vercel, Stripe, HubSpot, Dropbox, Box, ClickUp, Airtable,
Webflow, and many more. Services open a connection dialog with
their configuration already filled in. Provider prerequisites and setup links
appear when needed.

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

Choose **Sign in** to add the service and open the provider's OAuth flow. In the desktop app, that flow opens in the system browser and returns to the app when it completes. An
installed OAuth connection that is not authenticated shows an orange triangle;
hover or focus it to see its status, then use **Reconnect** to try again. Minddy
supports discovery, dynamic registration, PKCE, and refresh tokens. Providers that
require an existing OAuth application can use the client ID and secret under
**Advanced settings → OAuth app settings**; register the callback URL shown there with the provider.
Google services are in developer preview and require an OAuth app and
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
