import "server-only";

import { listOpenRouterIndex } from "./openrouter-index";
import {
  byokModelsForProvider,
  type ByokCatalogEntry,
  type ByokCatalogProvider,
} from "@/lib/byok-model-catalog";

/**
 * The native model list of a BYOK provider (MIN-416), for the admin
 * "Models" tab. Derived from the public OpenRouter index — no provider API
 * key is needed (Anthropic's own `/v1/models` requires one), and the index
 * mirrors the three vendors' catalogs within hours, so the list stays
 * current without maintenance.
 *
 * Best-effort like every reader of the index: on upstream failure the list
 * is empty and the picker falls back to its free-text entry.
 */
export async function getByokModelCatalog(
  provider: ByokCatalogProvider,
): Promise<ByokCatalogEntry[]> {
  return byokModelsForProvider(await listOpenRouterIndex(), provider);
}
