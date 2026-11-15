"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import type {
  RepositorySkill,
  RepositorySkillSummary,
} from "@/lib/repository-skills";
import { useProjectGitLinkQuery } from "@/lib/use-project-git-link-query";

interface RepositorySkillsResponse {
  skills?: RepositorySkillSummary[];
}

interface RepositorySkillResponse {
  skill?: RepositorySkill;
}

const NO_REPOSITORY_ALIASES: string[] = [];

export async function fetchRepositorySkills(
  projectId: string,
  ref?: string | null,
): Promise<RepositorySkillSummary[]> {
  const params = new URLSearchParams();
  if (ref) params.set("ref", ref);
  const query = params.size > 0 ? `?${params}` : "";
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/skills${query}`,
  );
  if (!response.ok) return [];
  const data = (await response.json()) as RepositorySkillsResponse;
  return Array.isArray(data.skills) ? data.skills : [];
}

export async function fetchRepositorySkill(
  projectId: string,
  path: string,
  ref?: string | null,
): Promise<RepositorySkill | null> {
  const params = new URLSearchParams({ path });
  if (ref) params.set("ref", ref);
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/skills?${params}`,
  );
  if (!response.ok) return null;
  const data = (await response.json()) as RepositorySkillResponse;
  return data.skill ?? null;
}

/**
 * The skills of the project's linked repository, as the next Numo turn will
 * see them. A fresh mount and every project, conversation or ref re-read the
 * repository instead of treating a previous conversation's inventory as
 * durable; so does a re-linked or renamed repository.
 */
export function useRepositorySkills(
  projectId: string | null,
  conversationKey: string | null = null,
  ref: string | null = null,
) {
  const { link, loading: linkLoading } = useProjectGitLinkQuery(projectId);
  const fullName = link?.repo_full_name ?? null;
  const aliases = link?.repo_previous_names ?? NO_REPOSITORY_ALIASES;
  const { data, isFetching, refetch } = useQuery({
    queryKey: [
      "repository-skills",
      projectId ?? "",
      conversationKey ?? "new",
      ref,
      fullName ?? "",
      aliases.join("\n"),
    ],
    queryFn: () => (projectId ? fetchRepositorySkills(projectId, ref) : Promise.resolve([])),
    enabled: !!projectId && !linkLoading,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  const load = useCallback(
    (skill: RepositorySkillSummary) => {
      const sourceProjectId = skill.projectId ?? projectId;
      return sourceProjectId
        ? fetchRepositorySkill(sourceProjectId, skill.path, sourceProjectId === projectId ? ref : null)
        : Promise.resolve(null);
    },
    [projectId, ref],
  );
  const skills = useMemo(
    () => (data ?? []).map((skill) => ({ ...skill, ...(projectId ? { projectId } : {}) })),
    [data, projectId],
  );
  return {
    skills,
    loading: !!projectId && isFetching,
    sync: refetch,
    load,
  };
}
