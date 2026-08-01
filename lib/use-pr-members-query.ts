"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchPullRequestMembersApi, type RepoMember } from "@/lib/agent-api";

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
  prId: string | null,
  enabled: boolean,
): { members: RepoMember[]; loading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ["pr-members", prId],
    queryFn: () => fetchPullRequestMembersApi(prId as string),
    enabled: enabled && !!prId,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  return { members: data?.members ?? [], loading: isLoading };
}
