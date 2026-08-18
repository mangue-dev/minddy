import "server-only";

import type { McpServer } from "@modelcontextprotocol/server";
import type { ZodTypeAny } from "zod";
import { registerMinddyTools } from "./tools";

/**
 * The catalog of MCP tools, READ SINCE THEIR ACTUAL RECORDING (MIN-88).
 *
 * `/llms.txt` and the MCP server card must list the minddy tools.
 * Copying them by hand would have guaranteed the drift: an added tool in
 * `tools.ts` would not appear anywhere, a renamed tool would lie, and a
 * code wizard would write an integration against an API that no longer exists.
 *
 * So we don't copy: we replay `registerMinddyTools` against one false
 * server which simply notes down what is recorded for it. The descriptions and
 * parameters are therefore, by construction, those that the server announces.
 *
 * No handler is executed — only the signature is kept.
 */

export interface CatalogTool {
  name: string;
  title?: string;
  description?: string;
  /** Input parameters, in declared order. */
  params: Array<{ name: string; required: boolean; description?: string }>;
  /** Is the tool advertised as having no side effects? */
  readOnly: boolean;
}

interface RegisterConfig {
  title?: string;
  description?: string;
  inputSchema?: { shape: Record<string, ZodTypeAny> };
  annotations?: { readOnlyHint?: boolean };
}

let cached: CatalogTool[] | null = null;

export function mcpToolCatalog(): CatalogTool[] {
  if (cached) return cached;

  const tools: CatalogTool[] = [];
  const recorder = {
    registerTool(name: string, config: RegisterConfig) {
      const schema = config.inputSchema?.shape ?? {};
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
    // `registerMinddyTools` only calls `registerTool`; all other access is
    // a contract change that we want to see fail loudly, not ignore.
  } as unknown as McpServer;

  registerMinddyTools(recorder);
  cached = tools;
  return tools;
}

/**
 * First sentence of a tool description — enough to fit on one line.
 *
 * Registry descriptions are up to five hundred characters long: this is the
 * good format for a model that chooses a tool, not for a list that one
 * goes through. `/llms.txt` and the public page `/mcp` therefore cut at the same
 * place, and in the same way.
 */
export function firstSentence(description: string | undefined): string {
  if (!description) return "";
  const end = description.indexOf(". ");
  return end === -1 ? description : description.slice(0, end + 1);
}
