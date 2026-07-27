import { mcpToolCatalog } from "@/lib/server/mcp/catalog";
import { MCP_SERVER_INSTRUCTIONS } from "@/lib/server/mcp/instructions";
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

  const body = `# minddy — MCP tool reference

Endpoint: \`${MCP_ENDPOINT}\` · Streamable HTTP, stateless, tools only.
Auth: OAuth 2.1 only (see ${SITE_URL}/llms.txt for the discovery flow).
Generated from the server's own tool registrations — it cannot describe an API
minddy no longer exposes.

## Server instructions

${MCP_SERVER_INSTRUCTIONS}

## Tools (${tools.length})

${tools.map(renderTool).join("\n\n")}
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

function renderTool(tool: ReturnType<typeof mcpToolCatalog>[number]): string {
  const lines = [`### \`${tool.name}\`${tool.readOnly ? " — read-only" : ""}`];
  if (tool.title) lines.push(`**${tool.title}**`);
  if (tool.description) lines.push(tool.description);

  if (tool.params.length === 0) {
    lines.push("No parameters.");
  } else {
    lines.push("Parameters:");
    for (const param of tool.params) {
      const flag = param.required ? "required" : "optional";
      const description = param.description ? ` — ${param.description}` : "";
      lines.push(`- \`${param.name}\` (${flag})${description}`);
    }
  }

  return lines.join("\n\n");
}
