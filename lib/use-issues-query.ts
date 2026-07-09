"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { toast } from "mangue-ui";
import {
  createIssueApi,
  deleteIssueApi,
  fetchIssuesApi,
  updateIssueApi,
} from "./issues-api";
import { setIssueCategoriesApi } from "./categories-api";
import { useAuth } from "./auth-context";
import { autoAssignOnStart } from "./auto-assign-on-start";
import { useUndoHistory } from "./undo/undo-context";
import { buildBeforePatch, snapshotIssue } from "./undo/undo-core";
import type {
  CreateIssueInput,
  Issue,
  IssueRelation,
  IssueUpdateInput,
} from "./types";

const issuesKey = (projectId: string) => ["issues", projectId] as const;

// Freshness across clients (Numo, MCP, other members) comes from the central
// realtime bridge (lib/realtime-provider.tsx) invalidating ["issues", projectId].
export function useIssuesQuery(projectId: string | null) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Local undo history (MIN-35): every successful user mutation below records
  // its inverse. Undo/redo replays bypass this hook, so they never re-record.
  const { record } = useUndoHistory();

  // Per-issue debounce for category writes (see setCategories).
  const catTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const catLatest = useRef(new Map<string, string[]>());
  // category_ids at the start of a debounce window — the undo `before` set
  // (the cache is already patched by the time the PUT flushes).
  const catBefore = useRef(new Map<string, string[]>());

  const { data, isLoading, error } = useQuery({
    queryKey: issuesKey(projectId ?? ""),
    queryFn: () => fetchIssuesApi(projectId as string),
    enabled: !!projectId,
  });

  const invalidate = useCallback(() => {
    if (projectId) {
      void queryClient.invalidateQueries({ queryKey: issuesKey(projectId) });
    }
  }, [queryClient, projectId]);

  // Self-assign on start (Account → Preferences): when a status change moves an
  // unassigned issue into in_progress, claim it for the current user. Returns
  // the id to assign, or null to leave the assignee alone — a no-op unless it's
  // a genuine transition of an unassigned issue and the caller isn't already
  // setting the assignee in the same patch. Covers every status-changing path:
  // drag & drop (moveIssue), the status pickers, triage, and Shift+P copyPrompt.
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

  const createIssue = useCallback(
    async (input: CreateIssueInput) => {
      const issue = await createIssueApi(projectId as string, input);
      record({
        kind: "create",
        projectId: projectId as string,
        issueId: issue.id,
        snapshot: snapshotIssue(issue),
      });
      invalidate();
      return issue;
    },
    [projectId, invalidate, record]
  );

  // Optimistic: patch the cache immediately so edits (incl. inline card pickers)
  // feel instant; persist, reconcile via invalidate, and revert on failure.
  const updateIssue = useCallback(
    async (issueId: string, updates: IssueUpdateInput) => {
      const key = projectId ? issuesKey(projectId) : null;
      const previous = key ? queryClient.getQueryData<Issue[]>(key) : undefined;
      const current = previous?.find((i) => i.id === issueId);
      const assignee = startAssignee(current, updates.status, "assignee_id" in updates);
      const patch = assignee ? { ...updates, assignee_id: assignee } : updates;
      if (key) {
        queryClient.setQueryData<Issue[]>(key, (old) =>
          (old ?? []).map((i) => (i.id === issueId ? { ...i, ...patch } : i))
        );
      }
      try {
        const issue = await updateIssueApi(issueId, patch);
        // The final patch (injected assignee included) against the pre-edit issue.
        const before = current && projectId ? buildBeforePatch(current, patch) : null;
        if (before) {
          record({
            kind: "update",
            projectId: projectId as string,
            issueId,
            before,
            after: patch,
          });
        }
        invalidate();
        return issue;
      } catch (err) {
        if (key) queryClient.setQueryData(key, previous);
        throw err;
      }
    },
    [projectId, queryClient, invalidate, startAssignee, record]
  );

  const deleteIssue = useCallback(
    async (issueId: string) => {
      // Snapshot before the hard delete: the issue, the sub-issues it will
      // orphan (parent_id is SET NULL) and the relation rows that cascade —
      // everything the undo re-creation restores.
      const issues = projectId
        ? queryClient.getQueryData<Issue[]>(issuesKey(projectId))
        : undefined;
      const target = issues?.find((i) => i.id === issueId);
      await deleteIssueApi(issueId);
      if (target && projectId) {
        const relations = (
          queryClient.getQueryData<IssueRelation[]>([
            "issue-relations",
            projectId,
          ]) ?? []
        ).filter((r) => r.source_id === issueId || r.target_id === issueId);
        record({
          kind: "delete",
          projectId,
          issueId,
          snapshot: snapshotIssue(target),
          childIds: (issues ?? [])
            .filter((i) => i.parent_id === issueId)
            .map((i) => i.id),
          relations: relations.map(({ source_id, target_id, type }) => ({
            source_id,
            target_id,
            type,
          })),
        });
      }
      invalidate();
    },
    [projectId, queryClient, invalidate, record]
  );

  /**
   * Optimistic move for drag & drop: patch the cache immediately (so the card
   * jumps instantly), persist, and revert on failure. Realtime reconciles the
   * final state across clients.
   */
  const moveIssue = useCallback(
    async (
      issueId: string,
      patch: { status?: Issue["status"]; position: number }
    ) => {
      if (!projectId) return;
      const key = issuesKey(projectId);
      const previous = queryClient.getQueryData<Issue[]>(key);
      const assignee = startAssignee(
        previous?.find((i) => i.id === issueId),
        patch.status,
        false
      );
      const write = assignee ? { ...patch, assignee_id: assignee } : patch;
      queryClient.setQueryData<Issue[]>(key, (old) =>
        (old ?? []).map((i) => (i.id === issueId ? { ...i, ...write } : i))
      );
      try {
        await updateIssueApi(issueId, write);
        const current = previous?.find((i) => i.id === issueId);
        const before = current ? buildBeforePatch(current, write) : null;
        if (before) {
          record({ kind: "update", projectId, issueId, before, after: write });
        }
      } catch (err) {
        queryClient.setQueryData(key, previous);
        throw err;
      }
    },
    [projectId, queryClient, startAssignee, record]
  );

  // Optimistic + DEBOUNCED per issue: rapid category toggles patch the cache
  // instantly but coalesce into a single PUT with the final set. Firing a PUT
  // per toggle raced on the join table (concurrent delete-then-insert →
  // duplicate-key 500 + UI stutter). Errors are surfaced here, then the cache is
  // reconciled from the server.
  const setCategories = useCallback(
    async (issueId: string, categoryIds: string[]) => {
      const key = projectId ? issuesKey(projectId) : null;
      // First toggle of a debounce window: keep the pre-edit set for undo
      // (subsequent calls see an already-patched cache).
      if (key && !catTimers.current.has(issueId)) {
        const current = queryClient
          .getQueryData<Issue[]>(key)
          ?.find((i) => i.id === issueId);
        catBefore.current.set(issueId, current?.category_ids ?? []);
      }
      if (key) {
        queryClient.setQueryData<Issue[]>(key, (old) =>
          (old ?? []).map((i) =>
            i.id === issueId ? { ...i, category_ids: categoryIds } : i
          )
        );
      }
      catLatest.current.set(issueId, categoryIds);
      const pending = catTimers.current.get(issueId);
      if (pending) clearTimeout(pending);
      catTimers.current.set(
        issueId,
        setTimeout(() => {
          catTimers.current.delete(issueId);
          const ids = catLatest.current.get(issueId) ?? categoryIds;
          catLatest.current.delete(issueId);
          const before = catBefore.current.get(issueId);
          catBefore.current.delete(issueId);
          setIssueCategoriesApi(issueId, ids)
            .then(() => {
              const changed =
                before &&
                (before.length !== ids.length ||
                  before.some((id) => !ids.includes(id)));
              if (changed && projectId) {
                record({
                  kind: "categories",
                  projectId,
                  issueId,
                  before,
                  after: ids,
                });
              }
              invalidate();
            })
            .catch((err) => {
              toast.error((err as Error).message);
              invalidate();
            });
        }, 300)
      );
    },
    [projectId, queryClient, invalidate, record]
  );

  return {
    issues: (data ?? []) as Issue[],
    loading: isLoading,
    error: error as Error | null,
    createIssue,
    updateIssue,
    deleteIssue,
    moveIssue,
    setCategories,
  };
}
