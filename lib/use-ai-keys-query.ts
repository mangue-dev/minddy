"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAiKeysApi } from "./agent-keys-api";

export const aiKeysQueryKey = ["ai-keys"] as const;

/**
 * Clés BYOK du compte (sanitisées : provider + préfixe, jamais la clé).
 *
 * `enabled` : l'onboarding a besoin de savoir si une clé existe (MIN-149), mais
 * il n'est visible que pour un compte neuf. Sans ce garde-fou, chaque affichage
 * de la home tirerait cette lecture pour tout le monde, alors qu'elle ne sert
 * qu'à une étape que la plupart des comptes ne verront jamais. Une requête
 * désactivée reste `pending` pour toujours : c'est `enabled` qui referme
 * `loading` (cf. lib/query-provider.tsx), pour que l'appelant n'attende pas une
 * réponse qui ne viendra pas.
 */
export function useAiKeysQuery({ enabled = true }: { enabled?: boolean } = {}) {
  const { data, isPending } = useQuery({
    queryKey: aiKeysQueryKey,
    queryFn: fetchAiKeysApi,
    enabled,
  });
  return { keys: data?.keys ?? [], loading: enabled && isPending };
}
