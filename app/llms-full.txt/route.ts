import { mcpToolCatalog } from "@/lib/server/mcp/catalog";
import { MCP_SERVER_INSTRUCTIONS } from "@/lib/server/mcp/instructions";
import { integrationWebhookDoc } from "@/lib/feedback/integration-contract";
import { issuesCsvDoc } from "@/lib/export/issues-csv";
import { MCP_ENDPOINT, SITE_URL } from "@/lib/site";

/**
 * `/llms-full.txt` (MIN-88) — la référence complète des outils MCP.
 *
 * Même parti pris que `/llms.txt` (voir son en-tête) : ce fichier sert à écrire
 * une intégration juste, pas à vendre le produit. Il ajoute ce que l'autre
 * résume — le mode d'emploi intégral que le serveur renvoie à l'initialisation,
 * et la signature de chaque outil, paramètre par paramètre.
 *
 * Entièrement DÉRIVÉ de `lib/server/mcp/` : renommer un outil ou rendre un
 * paramètre obligatoire se voit ici au déploiement suivant, sans rien à
 * mettre à jour.
 */
export function GET(): Response {
  const tools = mcpToolCatalog();

  const body = `# minddy MCP tool reference

Endpoint: \`${MCP_ENDPOINT}\` · Streamable HTTP, stateless, tools only.
Auth: OAuth 2.1 only (see ${SITE_URL}/llms.txt for the discovery flow).
Generated from the server's own tool registrations, so it cannot describe an API
minddy no longer exposes.

## Server instructions

${MCP_SERVER_INSTRUCTIONS}

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
 * Le webhook sortant — la seule partie de l'API qui ne se lit pas dans un
 * schéma d'outil : c'est une route que l'agent doit ÉCRIRE, pas appeler. Elle
 * vient donc en entier, depuis le même contrat que celui rendu par
 * `minddy_create_integration` et `minddy_configure_webhook`.
 */
function renderWebhook(): string {
  const w = integrationWebhookDoc();
  // Les blocs se séparent d'une ligne vide, les puces d'un simple retour : une
  // liste aérée est une liste « loose » en markdown, et se rend en paragraphes.
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
 * L'export CSV des tickets — la seule donnée de minddy qui circule en FICHIER.
 * Un agent à qui l'utilisateur tend « mon export » doit savoir ce qu'il tient
 * sans le déduire des trois premières lignes : d'où la table complète, tirée du
 * même module que l'écriture du fichier (`lib/export/issues-csv.ts`).
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
