"use client";

import type { AiSurface } from "@/lib/ai-surfaces";
import { isAiSurfaceAvailable } from "@/lib/ai-surface-availability";
import { useAuth } from "@/lib/auth-context";
import { useRuntimeConfig } from "@/lib/runtime-config-provider";
import { useAiKeysQuery } from "@/lib/use-ai-keys-query";

/**
 * Whether the current account can use an AI surface on this deployment.
 *
 * A managed quota serves every surface. On an independent instance, the
 * account must instead have a BYOK provider enabled for the requested surface.
 */
export function useAiSurfaceAvailability(surface: AiSurface) {
  const { capabilities } = useRuntimeConfig();
  const { user, loading: authLoading } = useAuth();
  const managedAi = capabilities.managedAi?.configured === true;
  const readKeys = !managedAi && Boolean(user);
  const { keys, loading: keysLoading } = useAiKeysQuery({ enabled: readKeys });

  return {
    available: isAiSurfaceAvailable(managedAi, keys, surface),
    loading: !managedAi && (authLoading || (readKeys && keysLoading)),
  };
}
