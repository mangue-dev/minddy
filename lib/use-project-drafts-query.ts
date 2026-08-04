"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./auth-context";
import {
  deleteProjectDraftApi,
  fetchProjectDraftsApi,
  saveProjectDraftApi,
} from "./project-drafts-api";
import type { ProjectDraft, ProjectDraftInput } from "./project-draft";

const DRAFTS_KEY = ["project-drafts"] as const;

export interface UseProjectDraftsResult {
  /** Mes brouillons, du plus récent au plus ancien (l'ordre de la barre latérale). */
  drafts: ProjectDraft[];
  saveDraft: (draft: ProjectDraftInput) => Promise<ProjectDraft>;
  deleteDraft: (id: string) => Promise<void>;
}

/**
 * Les brouillons de création de projet (monté une fois via `ProjectsProvider`).
 *
 * Pas de pont temps réel : un brouillon est strictement personnel et n'est écrit
 * que par l'onglet où le wizard tourne — l'invalidation qui suit chaque écriture
 * suffit. Un autre onglet le verra à son prochain montage.
 */
export function useProjectDrafts(): UseProjectDraftsResult {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: DRAFTS_KEY,
    queryFn: fetchProjectDraftsApi,
    enabled: !!user?.id,
  });

  const saveDraft = useCallback(
    async (draft: ProjectDraftInput) => {
      const saved = await saveProjectDraftApi(draft);
      await queryClient.invalidateQueries({ queryKey: DRAFTS_KEY });
      return saved;
    },
    [queryClient]
  );

  const deleteDraft = useCallback(
    async (id: string) => {
      await deleteProjectDraftApi(id);
      await queryClient.invalidateQueries({ queryKey: DRAFTS_KEY });
    },
    [queryClient]
  );

  return { drafts: data ?? [], saveDraft, deleteDraft };
}
