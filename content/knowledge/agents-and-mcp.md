---
id: agents-and-mcp
title: Numo and MCP
summary: Work with Numo in minddy and connect external agents or personal MCP tools.
category: automation
audience: both
tags: [agent, mcp, oauth, codex, claude, cursor]
lastReviewed: 2026-10-25
---

Numo is minddy's built-in conversation for understanding and acting on project work. The floating Numo button is the one place conversations live: it opens the Numo panel, adds the current page as context, and keeps every conversation reachable from its conversation list. Contextual actions such as **Ask Numo** enter this same conversation instead of opening a separate agent destination, and links to the retired dedicated Numo page open the panel too.

Choose the conversation model and reasoning level in Numo's composer. Numo organizes and tracks work: it reads and updates issues, plans, pages, objectives (including their comment threads), feedback, cycles and routines, and it can read, comment on, update and merge linked pull requests. Numo does not write code, push branches, run tests or open pull requests. To have code written, copy an issue's prompt for your own coding agent and connect that agent to minddy through MCP.

Numo can write a file to download (PDF, CSV, Markdown, text, HTML, JSON, XML, SVG or calendar), built from the conversation and the files added to it. The file shows as a card under its answer with **Download**, **Preview** and **Copy contents**, and selecting the card opens the preview; it stays in the user's private conversation storage until Numo is asked to attach it to an issue, an objective or a comment. PDFs use standard fonts, so characters outside Western European alphabets and emoji are left out.

Stopping Numo stops its turn. An external action already sent may still complete. Conversations that were waiting on code work from an earlier version are stopped automatically and return to idle.

Routines are scheduled Numo requests. Each occurrence starts a new Numo conversation with the saved instruction and project context. Numo uses Minddy tools and the owner's MCP connections; routines do not change repository code. The conversation records the result and any request for user input.

minddy also exposes an OAuth-based MCP server for external tools. This is how coding agents such as Claude Code, Codex or Cursor work with minddy: they can read issues and their context, update status and properties, write plans and comments, create linked issues and objectives, and work with project pages, feedback posts, cycles, routines, and the task notebook. The MCP setup page provides the endpoint and setup instructions for supported clients. When an MCP client or Numo searches a project's issues (`minddy_list_issues` with `query`, or Numo's issue search), text matches and exact identifiers come first; a descriptive query can then add issues of the same project found by meaning, marked `match: "semantic"`, which should be read before being relied on. That search by meaning is billed to the connected account as "Issue search" and is skipped when the account turned off "Index issues". The MCP server and Numo are available on every plan; available AI usage and model choices depend on the account plan or an optional personal API key.

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
`AI_KEY_ENCRYPTION_SECRET` and never returned to the browser.
Blank credential fields preserve existing values. Changing the URL clears saved
credentials and headers. Use **Remove saved token** to clear a bearer token, or
enter `{}` in custom headers to remove them. Reconnect if OAuth access expires or
is revoked. Concurrent OAuth operations on the same connection are serialized by
a database lease to protect rotating refresh tokens.

Calls have a 30-second deadline, a 1 MiB transport limit, and a 64 KB tool-result
limit. Discovery is paginated. If a remote write times out, verify its outcome on
the server before retrying: it may already have completed.
