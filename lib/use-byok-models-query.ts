"use client";

import { useQuery } from "@tanstack/react-query";
import {
  isByokCatalogProvider,
  type ByokCatalogEntry,
  type ByokCatalogProvider,
} from "@/lib/byok-model-catalog";
import type { ModelCatalogCapability } from "@/lib/model-catalog-capability";

/**
 * The native model list of one BYOK provider, for the admin "Models" tab
 * (MIN-416). Served by `/api/admin/byok-models` from the public OpenRouter
 * index — no provider API key involved. Long `staleTime`: a vendor catalog
 * moves slowly, exactly like the platform ones.
 */
export function useByokModelsQuery(
  provider: ByokCatalogProvider | null,
  capability: ModelCatalogCapability = "text",
) {
  const { data, isPending } = useQuery({
    queryKey: ["byok-models", provider, capability],
    enabled: isByokCatalogProvider(provider),
    queryFn: async (): Promise<ByokCatalogEntry[]> => {
      const params = new URLSearchParams({ provider: provider!, capability });
      const res = await fetch(`/api/admin/byok-models?${params}`);
      if (!res.ok) return [];
      const body = (await res.json()) as { models?: ByokCatalogEntry[] };
      return body.models ?? [];
    },
    staleTime: 60 * 60 * 1000,
  });
  return { models: data ?? [], loading: isPending };
}
