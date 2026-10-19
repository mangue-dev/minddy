"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useAuth } from "./auth-context";
import { fetchHiddenProjectIdsApi, setProjectHiddenApi } from "./hidden-projects-api";
import type { Project } from "./types";

export const HIDDEN_PROJECTS_KEY = ["hidden-projects"] as const;

const EMPTY: string[] = [];

export interface UseHiddenProjectsResult {
  /** The ids of the projects I hid; empty until the read resolves. */
  hiddenProjectIds: ReadonlySet<string>;
  isHidden: (projectId: string) => boolean;
  /**
   * Hides or shows one project for me. The navigation updates at once and
   * returns to its previous state when the save fails, with an error toast.
   */
  setProjectHidden: (project: Pick<Project, "id" | "name">, hidden: boolean) => Promise<boolean>;
}

/**
 * Personal project visibility (MIN-692), shared by the sidebar, the project
 * settings and the account's Hidden projects section through one query
 * cache. Every surface reads the same account-stored preference, so a change
 * made from one entry point is reflected by the others.
 *
 * A failed read hides nothing: the navigation falls back to every project
 * rather than losing some of them.
 */
export function useHiddenProjects(): UseHiddenProjectsResult {
  const t = useTranslations("Projects");
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: HIDDEN_PROJECTS_KEY,
    queryFn: fetchHiddenProjectIdsApi,
    enabled: !!user?.id,
  });
  const ids = data ?? EMPTY;
  const hiddenProjectIds = useMemo(() => new Set(ids), [ids]);
  const isHidden = useCallback((projectId: string) => hiddenProjectIds.has(projectId), [hiddenProjectIds]);

  const setProjectHidden = useCallback(
    async (project: Pick<Project, "id" | "name">, hidden: boolean) => {
      await queryClient.cancelQueries({ queryKey: HIDDEN_PROJECTS_KEY });
      const previous = queryClient.getQueryData<string[]>(HIDDEN_PROJECTS_KEY);
      queryClient.setQueryData<string[]>(HIDDEN_PROJECTS_KEY, (current = []) =>
        hidden
          ? (current.includes(project.id) ? current : [...current, project.id])
          : current.filter((id) => id !== project.id),
      );
      try {
        await setProjectHiddenApi(project.id, hidden);
        toast.success(t(hidden ? "hiddenToast" : "shownToast", { name: project.name }));
        return true;
      } catch {
        // Undo this project's change only. Restoring the snapshot itself
        // would be a no-op when the list never loaded (`setQueryData` ignores
        // `undefined`), leaving the project hidden after a failed save.
        const wasHidden = previous?.includes(project.id) ?? false;
        queryClient.setQueryData<string[]>(HIDDEN_PROJECTS_KEY, (current = []) => {
          const without = current.filter((id) => id !== project.id);
          return wasHidden ? [...without, project.id] : without;
        });
        toast.error(t(hidden ? "hideFailed" : "showFailed"));
        return false;
      } finally {
        void queryClient.invalidateQueries({ queryKey: HIDDEN_PROJECTS_KEY });
      }
    },
    [queryClient, t],
  );

  return useMemo(
    () => ({ hiddenProjectIds, isHidden, setProjectHidden }),
    [hiddenProjectIds, isHidden, setProjectHidden],
  );
}

/**
 * The projects the default navigation lists: every project I did not hide,
 * plus the one on screen, so opening a hidden project by link still shows
 * where I am without bringing it back into the list afterwards.
 */
export function visibleNavigationProjects(
  projects: Project[],
  hiddenProjectIds: ReadonlySet<string>,
  currentProjectId?: string | null,
): Project[] {
  if (hiddenProjectIds.size === 0) return projects;
  return projects.filter((p) => !hiddenProjectIds.has(p.id) || p.id === currentProjectId);
}
