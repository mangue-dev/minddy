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
import { useUndoHistory, type UndoRecord } from "./undo/undo-context";
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
  // Local undo history (MIN-35): mutations record WITH their optimistic patch
  // (not after the server confirms — an instant ⌘Z must find the entry) and
  // retract if the write fails. Undo/redo replays bypass this hook entirely.
  const { record } = useUndoHistory();

  // Per-issue debounce for category writes (see setCategories).
  const catTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const catLatest = useRef(new Map<string, string[]>());
  // The open debounce window's undo entry — its `after` follows the toggles,
  // its `settled` resolves once the flush PUT lands (see setCategories).
  const catRec = useRef(
    new Map<string, { rec: UndoRecord; resolve: () => void }>()
  );
  // Last flush PUT per issue (never-throwing) — chained into the next window's
  // `settled` so an undo can't overtake a still-in-flight flush.
  const catFlush = useRef(new Map<string, Promise<unknown>>());

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
      // The final patch (injected assignee included) against the pre-edit issue.
      const request = updateIssueApi(issueId, patch);
      const before = current && projectId ? buildBeforePatch(current, patch) : null;
      const rec = before
        ? record(
            {
              kind: "update",
              projectId: projectId as string,
              issueId,
              before,
              after: patch,
            },
            request.then(
              () => undefined,
              () => undefined
            )
          )
        : null;
      try {
        const issue = await request;
        invalidate();
        return issue;
      } catch (err) {
        rec?.retract();
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
      const relations = (
        queryClient.getQueryData<IssueRelation[]>([
          "issue-relations",
          projectId,
        ]) ?? []
      ).filter((r) => r.source_id === issueId || r.target_id === issueId);
      const request = deleteIssueApi(issueId);
      const rec =
        target && projectId
          ? record(
              {
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
      const request = updateIssueApi(issueId, write);
      const current = previous?.find((i) => i.id === issueId);
      const before = current ? buildBeforePatch(current, write) : null;
      const rec = before
        ? record(
            { kind: "update", projectId, issueId, before, after: write },
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
      // First toggle of a debounce window: record right away (an instant ⌘Z
      // must find the entry) with a `settled` the flush resolves. Subsequent
      // toggles only move the entry's `after`.
      if (key && projectId && !catTimers.current.has(issueId)) {
        const current = queryClient
          .getQueryData<Issue[]>(key)
          ?.find((i) => i.id === issueId);
        let resolve: () => void = () => {};
        const flushed = new Promise<void>((r) => {
          resolve = r;
        });
        const priorFlush = catFlush.current.get(issueId);
        const rec = record(
          {
            kind: "categories",
            projectId,
            issueId,
            before: current?.category_ids ?? [],
            after: categoryIds,
          },
          priorFlush ? Promise.all([priorFlush, flushed]) : flushed
        );
        if (rec) catRec.current.set(issueId, { rec, resolve });
      } else {
        const held = catRec.current.get(issueId);
        if (held && held.rec.entry.kind === "categories") {
          held.rec.entry.after = categoryIds;
        }
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
          const held = catRec.current.get(issueId);
          catRec.current.delete(issueId);
          const request = setIssueCategoriesApi(issueId, ids);
          catFlush.current.set(
            issueId,
            request.then(
              () => undefined,
              () => undefined
            )
          );
          request
            .then(() => {
              if (held) {
                const entry = held.rec.entry;
                // The window toggled back to its starting set — drop the no-op.
                if (
                  entry.kind === "categories" &&
                  entry.before.length === ids.length &&
                  entry.before.every((id) => ids.includes(id))
                ) {
                  held.rec.retract();
                }
                held.resolve();
              }
              invalidate();
            })
            .catch((err) => {
              held?.rec.retract();
              held?.resolve();
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
