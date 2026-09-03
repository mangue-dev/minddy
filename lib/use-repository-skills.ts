"use client";

import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import type { RepositorySkillSummary } from "./repository-skills";

interface RepositorySkillsResponse {
  skills?: RepositorySkillSummary[];
}

async function fetchRepositorySkills(
  projectId: string,
): Promise<RepositorySkillSummary[]> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/skills`);
  if (!response.ok) return [];
  const data = (await response.json()) as RepositorySkillsResponse;
  return Array.isArray(data.skills) ? data.skills : [];
}

/** Load the repository inventory only after “/” or “+” asks to show skills. */
export function useRepositorySkills(projectId: string | null) {
  const [requested, setRequested] = useState(false);
  const { data, isFetching } = useQuery({
    queryKey: ["repository-skills", projectId ?? ""],
    queryFn: () => fetchRepositorySkills(projectId as string),
    enabled: !!projectId && requested,
    staleTime: 60_000,
  });
  const request = useCallback((active: boolean) => {
    if (active) setRequested(true);
  }, []);
  return {
    skills: data ?? [],
    loading: !!projectId && requested && isFetching,
    request,
  };
}
