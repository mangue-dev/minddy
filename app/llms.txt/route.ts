import { firstSentence, mcpToolCatalog } from "@/lib/server/mcp/catalog";
import {
  WEBHOOK_SIGNATURE_HEADER,
  integrationWebhookDoc,
} from "@/lib/feedback/integration-contract";
import { EXPORT_HEADERS } from "@/lib/export/issues-csv";
import { MCP_ENDPOINT, SITE_URL } from "@/lib/site";

/**
 * `/llms.txt` (MIN-88) — and it talks about the MCP SERVER, not the product.
 *
 * Google published an optimization guide for AI on May 15, 2026 which says
 * explicitly that `llms.txt`, “AI” markup and Markdown versions do not
 * are of no use for AI Overviews or AI Mode: it is the same index and the same
 * classification than traditional search. A marketing `llms.txt` would therefore be a
 * file that nobody reads.
 *
 * The format, on the other hand, has proven itself for a specific use, that for
 * which Stripe, Vercel, Cloudflare and Anthropic publish it: allowing a
 * code wizard to write an integration RIGHT the first time. It is
 * exactly what Minddy needs — the agent we want to connect is the same
 * kind of agent as the one reading this file.
 *
 * It therefore only contains what is used for this: the endpoint, the mode
 * authentication, the hierarchy of objects, and the list of tools. THE
 * Parameter details live in `/llms-full.txt`.
 *
 * Everything is DERIVED from `lib/server/mcp/`: this file cannot describe an API
 * that the server no longer exposes.
 */
export function GET(): Response {
  const tools = mcpToolCatalog();
  const webhook = integrationWebhookDoc();

  const body = `# minddy

> A minimal issue tracker with a first-class MCP server. Projects hold issues;
> objectives group issues around a goal; an issue can carry an implementation
> plan whose markdown checkboxes are trackable tasks. Agents read and write
> minddy over MCP, as the user who authorised them.

This file is written for coding assistants wiring an agent to minddy. For the
product itself, see ${SITE_URL}.

## Connecting

- Endpoint: \`${MCP_ENDPOINT}\`
- Transport: Streamable HTTP (stateless, tools only: no SSE, no server
  notifications)
- Auth: **OAuth 2.1 only**. There are no static API keys. On a request without a
  valid bearer, the server answers \`401\` with \`WWW-Authenticate\` and
  \`resource_metadata\`, which points at
  \`${SITE_URL}/.well-known/oauth-protected-resource\`; the client discovers the
  authorization server from
  \`${SITE_URL}/.well-known/oauth-authorization-server\` and opens a browser for
  consent. Dynamic client registration is supported.
- Server card: \`${SITE_URL}/.well-known/mcp/server-card.json\`

Claude Code, for example:

\`\`\`
claude mcp add --scope user --transport http minddy ${MCP_ENDPOINT}
\`\`\`

## Model

${MCP_SERVER_MODEL}

## Tools

${tools.map((tool) => `- \`${tool.name}\`${tool.readOnly ? " (read-only)" : ""}: ${firstSentence(tool.description)}`).join("\n")}

## Webhooks

minddy also calls YOU. An integration key created with
\`minddy_create_integration\` can carry an outgoing webhook — set it with
\`minddy_configure_webhook\` — and minddy then POSTs signed JSON to your endpoint
when issues move. It is how an app learns that a human triaged what it pushed:
do not poll for that.

- Events: ${webhook.events.map((e) => `\`${e.name}\``).join(", ")}
- Scope: ${webhook.scopes.map((s) => `\`${s.value}\``).join(" or ")} — ${webhook.scopes[0].value} means only the issues that key created
- Signature: \`${WEBHOOK_SIGNATURE_HEADER}: sha256=<hex>\`. ${webhook.signature}

Full payload, headers and delivery guarantees: ${SITE_URL}/llms-full.txt

## Issue CSV export

Users can export their issues as a CSV file (⌘K → “Export issues as CSV”, scoped
to one project or all of them, filtered by status). If someone hands you one,
these are its columns, in this order:

${EXPORT_HEADERS.map((h) => `\`${h}\``).join(", ")}

Statuses, priorities and efforts are written as the RAW values listed above, not
as translated labels. minddy reads the file back, so an export is also how a
backlog moves from one project to another. Column meanings and the exact CSV
grammar: ${SITE_URL}/llms-full.txt

## More

- Full tool reference, with every parameter: ${SITE_URL}/llms-full.txt
- Setup guide, one ready-to-paste block per agent: ${SITE_URL}/mcp
- Terms: ${SITE_URL}/terms
- Privacy: ${SITE_URL}/privacy
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

/**
 * The hierarchy, in three lines. Deliberately written here rather than derived
 * from the MCP instructions: those are 3,800 characters in one continuous block,
 * which is the right format for a model during a session but unreadable at the
 * top of an integration file. `/llms-full.txt` serves the full version.
 */
const MCP_SERVER_MODEL = `- **Project**: the workspace. Everything else belongs to one.
- **Objective**: groups a project's issues around a goal.
- **Issue**: \`<PROJECT KEY>-<number>\`, e.g. \`MIND-42\`. Statuses: triage,
  backlog, todo, in_progress, in_review, done, canceled, duplicate. Priorities:
  none, low, medium, high, urgent. Efforts: xs, s, m, l, xl.
- **Plan**: markdown on an issue. \`- [ ]\` pending, \`- [~]\` in progress,
  \`- [x]\` done, \`- [-]\` cancelled. Checkboxes under a \`## Questions\`
  heading are open questions, not work, and never count towards progress.
- **Cycle**: the key owner's personal, cross-project fortnight.
- **Scratchpad**: the key owner's personal notes doc, same checkbox markdown.
- **Feedback**: user requests on a public board, separate from issues, with
  votes and a public status; can be promoted into an issue.`;
