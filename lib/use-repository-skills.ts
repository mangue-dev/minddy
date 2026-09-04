"use client";

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";

import { getDesktopBridge, type DesktopBridge } from "@/lib/desktop/bridge";
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

export type RepositorySkillEnvironment = "cloud" | "local" | "worktree";
const NO_REPOSITORY_ALIASES: string[] = [];

async function fetchCloudRepositorySkills(
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

async function fetchCloudRepositorySkill(
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

export async function fetchRepositorySkills({
  projectId,
  environment,
  fullName,
  aliases,
  ref,
  bridge = getDesktopBridge(),
}: {
  projectId: string;
  environment: RepositorySkillEnvironment;
  fullName: string | null;
  aliases: string[];
  ref?: string | null;
  bridge?: Pick<DesktopBridge, "localRepoSkills"> | null;
}): Promise<RepositorySkillSummary[]> {
  if (environment === "cloud" || !bridge?.localRepoSkills) {
    return fetchCloudRepositorySkills(projectId, ref);
  }

  try {
    return await bridge.localRepoSkills({ projectId, fullName, aliases });
  } catch {
    // A deployed renderer may run inside a shell whose preload exposes the
    // method but whose main process predates its IPC handler. Keep linked-repo
    // skills usable until that shell is updated.
    return fetchCloudRepositorySkills(projectId, ref);
  }
}

export async function fetchRepositorySkill({
  projectId,
  environment,
  fullName,
  aliases,
  path,
  ref,
  bridge = getDesktopBridge(),
}: {
  projectId: string;
  environment: RepositorySkillEnvironment;
  fullName: string | null;
  aliases: string[];
  path: string;
  ref?: string | null;
  bridge?: Pick<DesktopBridge, "localRepoSkill"> | null;
}): Promise<RepositorySkill | null> {
  if (environment === "cloud" || !bridge?.localRepoSkill) {
    return fetchCloudRepositorySkill(projectId, path, ref);
  }

  try {
    return await bridge.localRepoSkill({ projectId, fullName, aliases, path });
  } catch {
    return fetchCloudRepositorySkill(projectId, path, ref);
  }
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
  ref: string | null = null,
) {
  const { link, loading: linkLoading } = useProjectGitLinkQuery(projectId);
  const fullName = link?.repo_full_name ?? null;
  const aliases = link?.repo_previous_names ?? NO_REPOSITORY_ALIASES;
  const discoveryReady = !linkLoading;
  const { data, isFetching, refetch } = useQuery({
    queryKey: [
      "repository-skills",
      projectId ?? "",
      environment,
      conversationKey ?? "new",
      ref,
      fullName ?? "",
      aliases.join("\n"),
    ],
    queryFn: () =>
      projectId
        ? fetchRepositorySkills({
            projectId,
            environment,
            fullName,
            aliases,
            ref,
          })
        : Promise.resolve([]),
    enabled: !!projectId && discoveryReady,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  const load = useCallback(
    (skill: RepositorySkillSummary) =>
      projectId
        ? fetchRepositorySkill({
            projectId,
            environment,
            fullName,
            aliases,
            path: skill.path,
            ref,
          })
        : Promise.resolve(null),
    [projectId, environment, fullName, aliases, ref],
  );
  return {
    skills: data ?? [],
    loading: !!projectId && isFetching,
    sync: refetch,
    load,
  };
}
