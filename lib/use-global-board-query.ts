"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "mangue-ui";
import { globalBoardQueryFn } from "./global-board-api";
import {
  createIssueApi,
  deleteIssueApi,
  updateIssueApi,
} from "./issues-api";
import { setIssueCategoriesApi } from "./categories-api";
import {
  GLOBAL_BOARD_KEY,
  insertIssueEverywhere,
  issueWrites,
  mergeServerIssue,
  patchIssueEverywhere,
  removeIssueEverywhere,
  replaceIssueEverywhere,
} from "./optimistic/issue-writes";
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

/** Cache key for the aggregate cross-project board (MIN-29). Défini dans
    lib/optimistic/issue-writes.ts (que ce module importe), ré-exporté ici où
    tout le reste de l'app va le chercher. */
export { GLOBAL_BOARD_KEY };

/**
 * The cross-project "My/All" kanban's data + writes. Edits go through the
 * by-id issue APIs (which are project-agnostic) and patch this aggregate cache
 * AND the touched project's `["issues", projectId]` cache in place — la ligne
 * serveur y est fusionnée au retour du PATCH plutôt qu'invalidée (MIN-156) :
 * `/api/me/board` est une route lourde, et chaque refetch inutile était une
 * fenêtre de plus pour qu'une réponse en retard écrase l'édition en cours.
 * Mirrors useIssuesQuery, including self-assign-on-start.
 */
export function useGlobalBoardQuery() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Local undo history (MIN-35) — mirrors useIssuesQuery: record after each
  // successful user write; undo/redo replays bypass the hook entirely.
  const { record } = useUndoHistory();

  const { data, isPending } = useQuery({
    queryKey: GLOBAL_BOARD_KEY,
    queryFn: globalBoardQueryFn,
    // Pas de staleTime court : depuis MIN-89 le pont temps réel invalide cette
    // clé sur tout changement de ticket de N'IMPORTE lequel de mes projets (il
    // ne s'abonnait qu'au projet de l'URL, d'où ce rattrapage à l'horloge).
    // On garde donc le défaut global de 5 min — l'événement porte la fraîcheur.
  });

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
      const current = queryClient
        .getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)
        ?.issues.find((i) => i.id === issueId);
      const assignee = startAssignee(current, updates.status, patchHasAssignee);
      // Both server side-effects are mirrored here so the card doesn't flash:
      // starting an issue can self-assign it, and moving one to triage takes it
      // out of the cycle (triage and cycle exclude each other — MIN-32).
      const patch: IssueUpdateInput = {
        ...updates,
        ...(assignee ? { assignee_id: assignee } : {}),
        ...(leavesCycleOnStatus(current, updates.status) ? { cycle_id: null } : {}),
      };
      // Inscription au registre AVANT le patch (MIN-156) : à partir de là,
      // aucune réponse de fetch partie plus tôt ne peut rejouer l'état d'avant.
      const handle = issueWrites.begin({
        kind: "patch",
        id: issueId,
        patch: patch as Partial<Issue>,
      });
      patchIssueEverywhere(queryClient, projectId, issueId, patch as Partial<Issue>);
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
        // La ligne serveur entre dans les caches au lieu de les invalider :
        // c'est CE refetch-là qui, multiplié par N en édition groupée, ouvrait
        // la fenêtre de course. Le realtime porte le changement aux autres
        // clients ; ici le cache est déjà exact.
        const issue = await request;
        mergeServerIssue(queryClient, projectId, issue);
        issueWrites.settle(handle, issue);
      } catch (err) {
        // Rollback ciblé : seuls les champs de CETTE écriture reviennent en
        // arrière. Restaurer le board entier écrasait aussi les patchs
        // optimistes des N-1 autres écritures du lot.
        issueWrites.fail(handle);
        rec?.retract();
        if (before) {
          patchIssueEverywhere(
            queryClient,
            projectId,
            issueId,
            before as Partial<Issue>
          );
        }
        throw err;
      }
    },
    [queryClient, startAssignee, record]
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
      const handle = issueWrites.begin({
        kind: "patch",
        id: issueId,
        patch: { category_ids: categoryIds },
      });
      patchIssueEverywhere(queryClient, projectId, issueId, {
        category_ids: categoryIds,
      });
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
        // Le PUT ne renvoie pas la ligne : le jeu écrit EST la vérité, rien à
        // refetcher (le realtime réconcilie les autres clients).
        issueWrites.settle(handle);
      } catch (err) {
        issueWrites.fail(handle);
        rec?.retract();
        patchIssueEverywhere(queryClient, projectId, issueId, {
          category_ids: before,
        });
        toast.error((err as Error).message);
      }
    },
    [queryClient, record]
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
      const optimistic = buildOptimisticIssue(
        input,
        projectId,
        user?.id ?? null,
        queryClient.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)?.issues ?? []
      );
      const handle = issueWrites.begin({ kind: "insert", row: optimistic });
      insertIssueEverywhere(queryClient, projectId, optimistic);
      void createIssueApi(projectId, input).then(
        (issue) => {
          replaceIssueEverywhere(queryClient, projectId, optimistic.id, issue);
          insertIssueEverywhere(queryClient, projectId, issue);
          issueWrites.settle(handle, issue);
          record({
            kind: "create",
            projectId,
            issueId: issue.id,
            snapshot: snapshotIssue(issue),
          });
        },
        (err) => {
          issueWrites.fail(handle);
          removeIssueEverywhere(queryClient, projectId, optimistic.id);
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
    loading: isPending,
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
