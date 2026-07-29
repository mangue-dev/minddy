"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "mangue-ui";
import { fetchGlobalBoardApi } from "./global-board-api";
import {
  createIssueApi,
  deleteIssueApi,
  updateIssueApi,
} from "./issues-api";
import { setIssueCategoriesApi } from "./categories-api";
import { trackEvent } from "./analytics";
import {
  addIssueRelationApi,
  removeIssueRelationApi,
} from "./issue-relations-api";
import { buildOptimisticIssue } from "./optimistic-issue";
import { leavesCycleOnStatus } from "./cycle";
import { useAuth } from "./auth-context";
import { autoAssignOnStart } from "./auto-assign-on-start";
import { useUndoHistory } from "./undo/undo-context";
import { buildBeforePatch, snapshotIssue } from "./undo/undo-core";
import type {
  CreateIssueInput,
  GlobalBoardResponse,
  Issue,
  IssueRelation,
  IssueRelationType,
  IssueUpdateInput,
} from "./types";

/** Cache key for the aggregate cross-project board (MIN-29). */
export const GLOBAL_BOARD_KEY = ["me", "board"] as const;

/**
 * The cross-project "My/All" kanban's data + writes. Edits go through the
 * by-id issue APIs (which are project-agnostic), optimistically patch this
 * aggregate cache, then invalidate both it and the touched project's
 * `["issues", projectId]` cache so the project board reflects the change too.
 * Mirrors useIssuesQuery, including self-assign-on-start.
 */
export function useGlobalBoardQuery() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Local undo history (MIN-35) — mirrors useIssuesQuery: record after each
  // successful user write; undo/redo replays bypass the hook entirely.
  const { record } = useUndoHistory();

  const { data, isLoading } = useQuery({
    queryKey: GLOBAL_BOARD_KEY,
    queryFn: fetchGlobalBoardApi,
    // Pas de staleTime court : depuis MIN-89 le pont temps réel invalide cette
    // clé sur tout changement de ticket de N'IMPORTE lequel de mes projets (il
    // ne s'abonnait qu'au projet de l'URL, d'où ce rattrapage à l'horloge).
    // On garde donc le défaut global de 5 min — l'événement porte la fraîcheur.
  });

  const patchCache = useCallback(
    (issueId: string, patch: Partial<Issue>) => {
      queryClient.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, (old) =>
        old
          ? {
              ...old,
              issues: old.issues.map((i) =>
                i.id === issueId ? { ...i, ...patch } : i
              ),
            }
          : old
      );
    },
    [queryClient]
  );

  const invalidate = useCallback(
    (projectId?: string) => {
      void queryClient.invalidateQueries({ queryKey: GLOBAL_BOARD_KEY });
      if (projectId) {
        void queryClient.invalidateQueries({ queryKey: ["issues", projectId] });
      }
    },
    [queryClient]
  );

  // Self-assign on start — claim an unassigned issue moved into in_progress
  // (Account → Preferences), unless the same patch already sets an assignee.
  const startAssignee = useCallback(
    (
      current: Issue | undefined,
      nextStatus: Issue["status"] | undefined,
      patchHasAssignee: boolean
    ): string | null => {
      if (!current || patchHasAssignee) return null;
      return autoAssignOnStart({
        meta: user?.user_metadata,
        currentStatus: current.status,
        currentAssigneeId: current.assignee_id,
        nextStatus,
        userId: user?.id,
      });
    },
    [user]
  );

  const writeIssue = useCallback(
    async (
      issueId: string,
      updates: IssueUpdateInput,
      projectId: string,
      patchHasAssignee: boolean
    ) => {
      const prev = queryClient.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY);
      const current = prev?.issues.find((i) => i.id === issueId);
      const assignee = startAssignee(current, updates.status, patchHasAssignee);
      // Both server side-effects are mirrored here so the card doesn't flash:
      // starting an issue can self-assign it, and moving one to triage takes it
      // out of the cycle (triage and cycle exclude each other — MIN-32).
      const patch: IssueUpdateInput = {
        ...updates,
        ...(assignee ? { assignee_id: assignee } : {}),
        ...(leavesCycleOnStatus(current, updates.status) ? { cycle_id: null } : {}),
      };
      patchCache(issueId, patch as Partial<Issue>);
      // Single record point for updateIssue/moveIssue/setIssueCycle — recorded
      // with the optimistic patch so an instant ⌘Z works; retracted on failure.
      const request = updateIssueApi(issueId, patch, {
        surface: "global_board",
        previousStatus: current?.status ?? null,
      });
      const before = current ? buildBeforePatch(current, patch) : null;
      const rec = before
        ? record(
            { kind: "update", projectId, issueId, before, after: patch },
            request.then(
              () => undefined,
              () => undefined
            )
          )
        : null;
      try {
        await request;
        invalidate(projectId);
      } catch (err) {
        rec?.retract();
        if (prev) queryClient.setQueryData(GLOBAL_BOARD_KEY, prev);
        throw err;
      }
    },
    [queryClient, patchCache, invalidate, startAssignee, record]
  );

  // Inline card edits (status/priority/effort/assignee/due).
  const updateIssue = useCallback(
    (issueId: string, updates: IssueUpdateInput, projectId: string) =>
      writeIssue(issueId, updates, projectId, "assignee_id" in updates),
    [writeIssue]
  );

  // Drag & drop between columns (status change) or reorder (position).
  const moveIssue = useCallback(
    (
      issueId: string,
      patch: { status?: Issue["status"]; position: number },
      projectId: string
    ) => {
      // Un simple réordonnancement dans la même colonne n'est pas un
      // changement d'état : seul un vrai passage de colonne est tracké.
      const from = queryClient
        .getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)
        ?.issues.find((i) => i.id === issueId)?.status;
      if (patch.status && patch.status !== from) {
        trackEvent("issue_dragged", {
          from: from ?? "unknown",
          to: patch.status,
          scope: "global",
        });
      }
      return writeIssue(issueId, patch, projectId, false);
    },
    [writeIssue, queryClient]
  );

  const setCategories = useCallback(
    async (issueId: string, categoryIds: string[], projectId: string) => {
      const before =
        queryClient
          .getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)
          ?.issues.find((i) => i.id === issueId)?.category_ids ?? [];
      patchCache(issueId, { category_ids: categoryIds });
      // No debounce here — rapid toggles coalesce in the undo stack itself.
      const changed =
        before.length !== categoryIds.length ||
        before.some((id) => !categoryIds.includes(id));
      const request = setIssueCategoriesApi(issueId, categoryIds);
      if (changed) trackEvent("issue_category_changed", { count: categoryIds.length });
      const rec = changed
        ? record(
            { kind: "categories", projectId, issueId, before, after: categoryIds },
            request.then(
              () => undefined,
              () => undefined
            )
          )
        : null;
      try {
        await request;
        invalidate(projectId);
      } catch (err) {
        rec?.retract();
        toast.error((err as Error).message);
        invalidate(projectId);
      }
    },
    [queryClient, patchCache, invalidate, record]
  );

  const deleteIssue = useCallback(
    async (issueId: string, projectId: string) => {
      // Pre-delete snapshot for undo (see useIssuesQuery.deleteIssue) — here
      // the aggregate cache carries both the issues and the relation rows.
      const board = queryClient.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY);
      const target = board?.issues.find((i) => i.id === issueId);
      const request = deleteIssueApi(issueId, { surface: "global_board" });
      const rec =
        target && board
          ? record(
              {
                kind: "delete",
                projectId,
                issueId,
                snapshot: snapshotIssue(target),
                childIds: board.issues
                  .filter((i) => i.parent_id === issueId)
                  .map((i) => i.id),
                relations: board.relations
                  .filter((r) => r.source_id === issueId || r.target_id === issueId)
                  .map(({ source_id, target_id, type }) => ({
                    source_id,
                    target_id,
                    type,
                  })),
              },
              request.then(
                () => undefined,
                () => undefined
              )
            )
          : null;
      try {
        await request;
      } catch (err) {
        rec?.retract();
        throw err;
      }
      invalidate(projectId);
    },
    [queryClient, invalidate, record]
  );

  // Optimistic (MIN-40): insère la carte dans le board agrégé ET dans le cache
  // du projet immédiatement, remplace par la ligne serveur au succès, retire +
  // toast à l'échec. Le realtime réconcilie ; pas de refetch local.
  const createIssue = useCallback(
    async (projectId: string, input: CreateIssueInput) => {
      const projectKey = ["issues", projectId] as const;
      const optimistic = buildOptimisticIssue(
        input,
        projectId,
        user?.id ?? null,
        queryClient.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)?.issues ?? []
      );
      queryClient.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, (old) =>
        old ? { ...old, issues: [...old.issues, optimistic] } : old
      );
      queryClient.setQueryData<Issue[]>(projectKey, (old) =>
        old ? [...old, optimistic] : old
      );
      void createIssueApi(projectId, input).then(
        (issue) => {
          const swap = (i: Issue) => (i.id === optimistic.id ? issue : i);
          queryClient.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, (old) =>
            old ? { ...old, issues: old.issues.map(swap) } : old
          );
          queryClient.setQueryData<Issue[]>(projectKey, (old) => old?.map(swap));
          record({
            kind: "create",
            projectId,
            issueId: issue.id,
            snapshot: snapshotIssue(issue),
          });
        },
        (err) => {
          const drop = (i: Issue) => i.id !== optimistic.id;
          queryClient.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, (old) =>
            old ? { ...old, issues: old.issues.filter(drop) } : old
          );
          queryClient.setQueryData<Issue[]>(projectKey, (old) => old?.filter(drop));
          toast.error((err as Error).message);
        }
      );
      return optimistic;
    },
    [queryClient, user, record]
  );

  // Relations (MIN-25) on the cross-project board: the writes go through the
  // per-project routes; the board cache's `relations` slice is patched
  // immediately and the project's own ["issue-relations"] cache invalidated so
  // both boards stay in sync.
  const addRelation = useCallback(
    async (
      projectId: string,
      sourceId: string,
      type: IssueRelationType,
      targetId: string
    ) => {
      const created = await addIssueRelationApi(projectId, {
        source_id: sourceId,
        target_id: targetId,
        type,
      });
      // Record the server-normalized row (blocked_by is stored as an inverted
      // blocks), so a redo replays exactly what was persisted.
      record({
        kind: "relation-add",
        projectId,
        relationId: created.id,
        relation: {
          source_id: created.source_id,
          target_id: created.target_id,
          type: created.type,
        },
      });
      queryClient.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, (old) =>
        old
          ? {
              ...old,
              relations: [
                ...old.relations.filter((r) => r.id !== created.id),
                created,
              ],
            }
          : old
      );
      void queryClient.invalidateQueries({ queryKey: GLOBAL_BOARD_KEY });
      void queryClient.invalidateQueries({ queryKey: ["issue-relations", projectId] });
    },
    [queryClient, record]
  );

  const removeRelation = useCallback(
    async (projectId: string, relationId: string) => {
      const previous = queryClient.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY);
      const removed = previous?.relations.find((r) => r.id === relationId);
      queryClient.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, (old) =>
        old
          ? { ...old, relations: old.relations.filter((r) => r.id !== relationId) }
          : old
      );
      try {
        await removeIssueRelationApi(relationId);
        if (removed) {
          record({
            kind: "relation-remove",
            projectId,
            relationId,
            relation: {
              source_id: removed.source_id,
              target_id: removed.target_id,
              type: removed.type,
            },
          });
        }
        void queryClient.invalidateQueries({ queryKey: GLOBAL_BOARD_KEY });
        void queryClient.invalidateQueries({
          queryKey: ["issue-relations", projectId],
        });
      } catch (err) {
        if (previous) queryClient.setQueryData(GLOBAL_BOARD_KEY, previous);
        throw err;
      }
    },
    [queryClient, record]
  );

  // Add to / remove from the user's cycle (MIN-32). The optimistic patch
  // mirrors the server side-effect exactly — adding assigns the issue to me
  // (never a status bump) — so the card doesn't flash an empty assignee.
  const setIssueCycle = useCallback(
    (issueId: string, cycleId: string | null, projectId: string) => {
      const patch: IssueUpdateInput =
        cycleId && user?.id
          ? { cycle_id: cycleId, assignee_id: user.id }
          : { cycle_id: cycleId };
      return writeIssue(issueId, patch, projectId, true);
    },
    [writeIssue, user]
  );

  return {
    issues: (data?.issues ?? []) as Issue[],
    membersByProject: data?.members ?? {},
    categoriesByProject: data?.categories ?? {},
    objectivesByProject: data?.objectives ?? {},
    integrationsByProject: data?.integrations ?? {},
    relations: (data?.relations ?? []) as IssueRelation[],
    cycles: data?.cycles ?? null,
    loading: isLoading,
    updateIssue,
    moveIssue,
    setCategories,
    deleteIssue,
    createIssue,
    setIssueCycle,
    addRelation,
    removeRelation,
  };
}
