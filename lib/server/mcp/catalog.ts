import "server-only";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodTypeAny } from "zod";
import { registerMinddyTools } from "./tools";

/**
 * Le catalogue des outils MCP, LU DEPUIS LEUR ENREGISTREMENT RÉEL (MIN-88).
 *
 * `/llms.txt` et la carte de serveur MCP doivent lister les outils de minddy.
 * Les recopier à la main aurait garanti la dérive : un outil ajouté dans
 * `tools.ts` n'apparaîtrait nulle part, un outil renommé mentirait, et un
 * assistant de code écrirait une intégration contre une API qui n'existe plus.
 *
 * Alors on ne recopie pas : on rejoue `registerMinddyTools` contre un faux
 * serveur qui se contente de noter ce qu'on lui enregistre. Les descriptions et
 * les paramètres sont donc, par construction, ceux que le serveur annonce.
 *
 * Aucun handler n'est exécuté — on ne garde que la signature.
 */

export interface CatalogTool {
  name: string;
  title?: string;
  description?: string;
  /** Paramètres d'entrée, dans l'ordre déclaré. */
  params: Array<{ name: string; required: boolean; description?: string }>;
  /** L'outil est-il annoncé comme sans effet de bord ? */
  readOnly: boolean;
}

interface RegisterConfig {
  title?: string;
  description?: string;
  inputSchema?: Record<string, ZodTypeAny>;
  annotations?: { readOnlyHint?: boolean };
}

let cached: CatalogTool[] | null = null;

export function mcpToolCatalog(): CatalogTool[] {
  if (cached) return cached;

  const tools: CatalogTool[] = [];
  const recorder = {
    registerTool(name: string, config: RegisterConfig) {
      const schema = config.inputSchema ?? {};
      tools.push({
        name,
        title: config.title,
        description: config.description,
        readOnly: config.annotations?.readOnlyHint === true,
        params: Object.entries(schema).map(([param, zod]) => ({
          name: param,
          required: !zod.isOptional(),
          description: zod.description,
        })),
      });
    },
    // `registerMinddyTools` n'appelle que `registerTool` ; tout autre accès est
    // un changement de contrat qu'on veut voir échouer bruyamment, pas ignorer.
  } as unknown as McpServer;

  registerMinddyTools(recorder);
  cached = tools;
  return tools;
}

/**
 * Première phrase d'une description d'outil — de quoi tenir sur une ligne.
 *
 * Les descriptions du registre font jusqu'à cinq cents caractères : c'est le
 * bon format pour un modèle qui choisit un outil, pas pour une liste qu'on
 * parcourt. `/llms.txt` et la page publique `/mcp` coupent donc au même
 * endroit, et de la même façon.
 */
export function firstSentence(description: string | undefined): string {
  if (!description) return "";
  const end = description.indexOf(". ");
  return end === -1 ? description : description.slice(0, end + 1);
}
