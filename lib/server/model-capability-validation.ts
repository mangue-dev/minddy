import "server-only";

import { stripModelSuffix } from "@/lib/ai-model-config";
import { getPlatformModelCatalog } from "@/lib/server/agent/models-catalog";
import type { ModelCatalogCapability } from "@/lib/model-catalog-capability";

/**
 * Save-time capability gate for platform model fields that are not decision
 * models (MIN-717). An embedding field must name an embedding model and a
 * transcription field a transcription model: a chat id stored there would be
 * accepted by the dashboard, then refused by the provider on every call, so
 * indexing or dictation would degrade silently.
 *
 * The platform catalog is the evidence. When it cannot be loaded (self-hosted
 * without managed AI, OpenRouter unreachable) the choice cannot be verified
 * and is accepted: the runtime still degrades safely, and refusing every save
 * would lock the setting on instances that route through BYOK only.
 */
export type CapabilityValidation =
  | { ok: true; verified: boolean }
  | { ok: false; code: "capability_mismatch" };

export async function validateCatalogCapabilityChoice(
  model: string,
  capability: Exclude<ModelCatalogCapability, "text">,
  loadCatalog: typeof getPlatformModelCatalog = getPlatformModelCatalog,
): Promise<CapabilityValidation> {
  const catalog = await loadCatalog(capability).catch(() => []);
  if (catalog.length === 0) return { ok: true, verified: false };
  const base = stripModelSuffix(model.trim());
  return catalog.some((entry) => entry.id === base)
    ? { ok: true, verified: true }
    : { ok: false, code: "capability_mismatch" };
}
