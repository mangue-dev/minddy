"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchPullRequestMembersApi, type PrEndpoint, type RepoMember } from "@/lib/agent-api";

/**
 * Les comptes de la forge mentionnables sur une PR (MIN-162).
 *
 * Chargés À LA DEMANDE — `enabled` ne passe à vrai qu'au premier `@` tapé, sur
 * le modèle de `use-numo-mentionables` : ouvrir une PR ne doit déclencher aucune
 * requête de plus, et la plupart des PR se lisent sans qu'on y écrive.
 *
 * `staleTime` long, et pas de refetch au retour de focus : une liste de
 * collaborateurs ne bouge pas pendant qu'on rédige un commentaire, et la
 * réponse porte déjà son propre cache HTTP.
 */
export function usePrMembersQuery(
  /** Base de la PR : `/api/pull-requests/{id}` ou la façade `/api/agent-runs/{id}/pr`. */
  endpoint: PrEndpoint | null,
  enabled: boolean,
): { members: RepoMember[]; loading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ["pr-members", endpoint],
    queryFn: () => fetchPullRequestMembersApi(endpoint as PrEndpoint),
    enabled: enabled && !!endpoint,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  return { members: data?.members ?? [], loading: isLoading };
}
