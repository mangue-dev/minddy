"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAiKeysApi } from "./agent-keys-api";

export const aiKeysQueryKey = ["ai-keys"] as const;

/**
 * BYOK account keys (sanitized: provider + prefix, never the key).
 *
 * `enabled`: onboarding needs to know if a key exists (MIN-149), but
 * it is only visible for a new account. Without this safeguard, each display
 * of the home would draw this reading for everyone, while it is not useful
 * only at a stage that most accounts will never see. A request
 * disabled remains `pending` forever: it is `enabled` which closes
 * `loading` (see lib/query-provider.tsx), so that the caller does not wait for a
 * answer which will not come.
 */
export function useAiKeysQuery({ enabled = true }: { enabled?: boolean } = {}) {
  const { data, isPending } = useQuery({
    queryKey: aiKeysQueryKey,
    queryFn: fetchAiKeysApi,
    enabled,
  });
  return { keys: data?.keys ?? [], loading: enabled && isPending };
}
