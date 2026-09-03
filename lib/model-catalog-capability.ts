/** Model families exposed by capability-aware admin catalog pickers. */
export const MODEL_CATALOG_CAPABILITIES = ["text", "transcription", "embedding"] as const;

export type ModelCatalogCapability = (typeof MODEL_CATALOG_CAPABILITIES)[number];

export function isModelCatalogCapability(
  value: string | null | undefined,
): value is ModelCatalogCapability {
  return (MODEL_CATALOG_CAPABILITIES as readonly string[]).includes(value ?? "");
}

/** Capability required by a configured runtime model. */
export function modelCatalogCapabilityForKey(key: string): ModelCatalogCapability {
  if (key === "transcription_model") return "transcription";
  if (key === "feedback_embedding_model") return "embedding";
  return "text";
}
