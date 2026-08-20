import type { AiSurface } from "@/lib/ai-surfaces";

/** Browser-safe subset of a sanitized account AI key. */
export interface AiSurfaceKey {
  validated_at: string | null;
  enabled_surfaces: AiSurface[];
}

/** A managed quota or a validated, surface-enabled BYOK key can serve the request. */
export function isAiSurfaceAvailable(
  managedAi: boolean,
  keys: readonly AiSurfaceKey[],
  surface: AiSurface,
): boolean {
  return managedAi || keys.some(
    (key) => key.validated_at !== null && key.enabled_surfaces.includes(surface),
  );
}
