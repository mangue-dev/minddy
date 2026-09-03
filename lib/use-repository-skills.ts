"use client";

import { useQuery } from "@tanstack/react-query";

import { getDesktopBridge } from "@/lib/desktop/bridge";
import type { RepositorySkillSummary } from "@/lib/repository-skills";
import { useProjectGitLinkQuery } from "@/lib/use-project-git-link-query";

interface RepositorySkillsResponse {
  skills?: RepositorySkillSummary[];
}

export type RepositorySkillEnvironment = "cloud" | "local" | "worktree";

async function fetchCloudRepositorySkills(
  projectId: string,
): Promise<RepositorySkillSummary[]> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/skills`);
  if (!response.ok) return [];
  const data = (await response.json()) as RepositorySkillsResponse;
  return Array.isArray(data.skills) ? data.skills : [];
}

/**
 * Synchronize the inventory for the checkout that the next Numo turn will use.
 * A fresh mount and every project, conversation, or environment key re-read the
 * source instead of treating the previous conversation's inventory as durable.
 */
export function useRepositorySkills(
  projectId: string | null,
  environment: RepositorySkillEnvironment = "cloud",
  conversationKey: string | null = null,
) {
  const { link, loading: linkLoading } = useProjectGitLinkQuery(projectId);
  const fullName = link?.repo_full_name ?? null;
  const aliases = link?.repo_previous_names ?? [];
  const local = environment !== "cloud";
  const bridge = getDesktopBridge();
  const discoveryReady =
    !linkLoading && (!local || !!bridge?.localRepoSkills);
  const { data, isFetching, refetch } = useQuery({
    queryKey: [
      "repository-skills",
      projectId ?? "",
      environment,
      conversationKey ?? "new",
      fullName ?? "",
      aliases.join("\n"),
    ],
    queryFn: () => {
      if (!projectId) return Promise.resolve([]);
      if (!local) return fetchCloudRepositorySkills(projectId);
      return bridge!.localRepoSkills!({ projectId, fullName, aliases });
    },
    enabled: !!projectId && discoveryReady,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  return {
    skills: data ?? [],
    loading: !!projectId && isFetching,
    sync: refetch,
  };
}
