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
 * qu'à une étape que la plupart des comptes ne verront jamais. Requête
 * désactivée = `loading` faux (react-query v5 : `isLoading = isPending &&
 * isFetching`), donc l'appelant n'attend pas une réponse qui ne viendra pas.
 */
export function useAiKeysQuery({ enabled = true }: { enabled?: boolean } = {}) {
  const { data, isLoading } = useQuery({
    queryKey: aiKeysQueryKey,
    queryFn: fetchAiKeysApi,
    enabled,
  });
  return { keys: data?.keys ?? [], loading: isLoading };
}
