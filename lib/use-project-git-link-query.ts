"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchGitLinkedProjectsApi,
  fetchProjectGitLinkApi,
} from "./git-integration-api";

export const projectGitLinkQueryKey = (projectId: string) =>
  ["project-git-link", projectId] as const;

/**
 * Volontairement HORS du préfixe `["projects", …]` : ce n'est pas la liste des
 * projets, c'est un jeu d'ids — et le RealtimeProvider surveille ce préfixe-là
 * pour savoir à quels topics s'abonner.
 */
export const GIT_LINKED_PROJECTS_KEY = ["git-linked-projects"] as const;

/**
 * Les projets où l'agent peut travailler : ceux qui ont un dépôt lié. Rendu en
 * `Set` — l'appelant filtre une liste de projets, il ne cherche pas un id.
 *
 * `loading` compte : tant que la réponse n'est pas là, l'ensemble est VIDE, et
 * un écran qui conclurait « aucun dépôt connecté » dessus se tromperait le temps
 * d'un aller-retour.
 */
export function useGitLinkedProjectsQuery() {
  const { data, isPending } = useQuery({
    queryKey: GIT_LINKED_PROJECTS_KEY,
    queryFn: fetchGitLinkedProjectsApi,
  });
  const projectIds = useMemo(
    () => new Set(data?.projectIds ?? []),
    [data],
  );
  return { projectIds, loading: isPending };
}

/** État de liaison git d'un projet (lien courant, owner, providers dispo). */
export function useProjectGitLinkQuery(projectId: string | null) {
  const enabled = !!projectId;
  const { data, isPending } = useQuery({
    queryKey: projectGitLinkQueryKey(projectId ?? ""),
    queryFn: () => fetchProjectGitLinkApi(projectId as string),
    enabled,
  });
  return {
    link: data?.link ?? null,
    isOwner: !!data?.isOwner,
    providers: data?.providers ?? [],
    loading: enabled && isPending,
  };
}
