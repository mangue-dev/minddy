import { mcpToolCatalog } from "@/lib/server/mcp/catalog";
import { MCP_FULL_USAGE_GUIDE } from "@/lib/server/mcp/instructions";
import { integrationWebhookDoc } from "@/lib/feedback/integration-contract";
import { issuesCsvDoc } from "@/lib/export/issues-csv";
import { MCP_ENDPOINT, SITE_URL } from "@/lib/site";

/** Complete MCP usage and parameter reference derived from server registrations. */
export function GET(): Response {
  const tools = mcpToolCatalog();

  const body = `# minddy MCP tool reference

Endpoint: \`${MCP_ENDPOINT}\` · Streamable HTTP, stateless, tools only.
Auth: OAuth 2.1 only (see ${SITE_URL}/llms.txt for the discovery flow).
Generated from the server's own tool registrations, so it cannot describe an API
minddy no longer exposes.

For product and operator procedures, use the [documentation index](${SITE_URL}/docs/llms.txt).
It links to individual Markdown articles and localized indexes; this file covers MCP contracts.

## Full usage guide

${MCP_FULL_USAGE_GUIDE}

## Tools (${tools.length})

${tools.map(renderTool).join("\n\n")}

${renderWebhook()}

${renderIssuesCsv()}
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

/**
 * The outgoing webhook — the only part of the API that does not read into a
 * tool schema: this is a route that the agent must WRITE, not call. She
 * therefore comes in full, from the same contract as that rendered by
 * `minddy_create_integration` and `minddy_configure_webhook`.
 */
function renderWebhook(): string {
  const w = integrationWebhookDoc();
  // The blocks are separated by an empty line, the chips by a simple return: a
  // aerated list is a “loose” list in markdown, and is rendered in paragraphs.
  const list = (items: string[]) => items.join("\n");
  return [
    "## Webhooks (minddy → your app)",
    w.purpose,
    w.configure,
    "### Events",
    list(w.events.map((e) => `- \`${e.name}\`: ${e.when}`)),
    "### Scope",
    list(w.scopes.map((s) => `- \`${s.value}\`: ${s.meaning}`)),
    "### Request headers",
    list(Object.entries(w.headers).map(([name, value]) => `- \`${name}\`: ${value}`)),
    "### Verifying the signature",
    w.signature,
    "### Body",
    list(Object.entries(w.payload).map(([field, value]) => `- \`${field}\`: ${value}`)),
    "### Delivery",
    list(w.delivery.map((rule) => `- ${rule}`)),
  ].join("\n\n");
}

/**
 * CSV export of tickets — the only Minddy data that circulates in FILE.
 * An agent to whom the user hands “my export” must know what he is holding
 * without deducing it from the first three lines: hence the complete table, taken from
 * same module as writing the file (`lib/export/issues-csv.ts`).
 */
function renderIssuesCsv(): string {
  const doc = issuesCsvDoc();
  return [
    "## Issue CSV export",
    doc.purpose,
    doc.how,
    "### Columns, in file order",
    doc.columns.map((c) => `- \`${c.header}\`: ${c.meaning}`).join("\n"),
    "### Rules",
    doc.rules.map((rule) => `- ${rule}`).join("\n"),
    doc.omits,
  ].join("\n\n");
}

function renderTool(tool: ReturnType<typeof mcpToolCatalog>[number]): string {
  const lines = [`### \`${tool.name}\`${tool.readOnly ? " (read-only)" : ""}`];
  if (tool.title) lines.push(`**${tool.title}**`);
  if (tool.description) lines.push(tool.description);

  if (tool.params.length === 0) {
    lines.push("No parameters.");
  } else {
    lines.push("Parameters:");
    for (const param of tool.params) {
      const flag = param.required ? "required" : "optional";
      const description = param.description ? `: ${param.description}` : "";
      lines.push(`- \`${param.name}\` (${flag})${description}`);
    }
  }

  return lines.join("\n\n");
}
