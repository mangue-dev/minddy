"use client";

import { useMemo, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createIssueApi, deleteIssueApi, updateIssueApi } from "./issues-api";
import { setIssueCategoriesApi } from "./categories-api";
import { createIssueDeferred } from "./create-issue-deferred";
import { buildOptimisticIssue } from "./optimistic-issue";
import { autoAssignOnStart } from "./auto-assign-on-start";
import { cycleMembershipPatch, leavesCycleOnStatus } from "./cycle";
import { trackEvent } from "./analytics";
import { useAuth } from "./auth-context";
import { useUndoHistory, type UndoRecord } from "./undo/undo-context";
import { buildBeforePatch, snapshotIssue, type UndoAction } from "./undo/undo-core";
import {
  cachedIssueRelations,
  cachedProjectIssues,
  findIssueAnywhere,
  insertIssueEverywhere,
  issueCachePatch,
  issueWrites,
  mergeServerIssue,
  patchIssueEverywhere,
  removeIssueEverywhere,
} from "./optimistic/issue-writes";
import type { PendingHandle } from "./optimistic/pending-writes";
import type { IssueStatus } from "./issue-constants";
import type { CreateIssueInput, Issue, IssueUpdateInput } from "./types";

/** Which board a write starts from: it names the analytics surface. */
export type IssueWriteScope = "project" | "global";

export type IssueMovePatch = { status?: IssueStatus; position: number };

/**
 * Every issue write of the boards, the issue panels and the app-wide create
 * dialog. Each one patches every cache that holds the issue at once, persists,
 * reconciles with the server row, and on failure rolls back only the fields it
 * touched and shows the error itself. None of them throws: a caller that must
 * know the outcome reads the resolved value (null or false on failure).
 *
 * The issue's project is read from its cached row, so the project board and
 * the cross-project board call every writer with the same arguments.
 */
export interface IssueMutations {
  /** Resolves to the optimistic card, or null for a Smart Fill creation,
   *  which shows no card until the server has filled it (MIN-260). */
  createIssue: (projectId: string, input: CreateIssueInput) => Promise<Issue | null>;
  updateIssue: (issueId: string, updates: IssueUpdateInput) => Promise<Issue | null>;
  /** Drag and drop, and its keyboard twin in the card menu. */
  moveIssue: (issueId: string, patch: IssueMovePatch) => Promise<Issue | null>;
  /** Adds the issue to a cycle (null removes it) — MIN-32. */
  setIssueCycle: (issueId: string, cycleId: string | null) => Promise<Issue | null>;
  /** Resolves once the debounced write of this toggle's window has landed. */
  setCategories: (issueId: string, categoryIds: string[]) => Promise<boolean>;
  deleteIssue: (issueId: string) => Promise<boolean>;
}

type Recorder = (
  action: UndoAction,
  settled?: Promise<unknown>,
  link?: string
) => UndoRecord | null;

type Viewer = { id: string; user_metadata?: Record<string, unknown> } | null;

/**
 * Rapid category toggles coalesce into one PUT with the final set: one PUT
 * per toggle raced on the join table (concurrent delete-then-insert, then a
 * duplicate-key 500 and a flickering card).
 */
export const CATEGORY_WRITE_DEBOUNCE_MS = 300;

/** One debounce window of category toggles on one issue. */
interface CategoryWindow {
  timer: ReturnType<typeof setTimeout>;
  projectId: string | null;
  before: string[];
  latest: string[];
  /** One register entry per toggle: merged by `seq`, the last one wins. */
  handles: PendingHandle[];
  rec: UndoRecord | null;
  /** Resolves the undo entry's `settled` once the PUT lands. */
  landed: () => void;
  waiters: Array<(ok: boolean) => void>;
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

const settledOf = (request: Promise<unknown>): Promise<undefined> =>
  request.then(
    () => undefined,
    () => undefined
  );

/** A batch that fails N times shows one toast per distinct message, not N. */
function showWriteError(err: unknown): void {
  const message = (err as Error).message;
  toast.error(message, { id: `issue-write-error:${message}` });
}

export function createIssueMutations({
  queryClient,
  record,
  viewer,
  scope,
}: {
  queryClient: QueryClient;
  record: Recorder;
  /** Read at call time, so the writers keep their identity across sign-in changes. */
  viewer: () => Viewer;
  scope: IssueWriteScope;
}): IssueMutations {
  const surface = scope === "project" ? "project_board" : "global_board";
  // The drag surface of the project board has its own analytics series; the
  // cross-project board reports its drags under its board surface.
  const moveSurface = scope === "project" ? "kanban_drag" : "global_board";

  // Starting an unassigned issue claims it for the viewer (Account →
  // Preferences), unless the same patch already sets the assignee. The server
  // does the same; mirroring it keeps the card from flashing.
  const startAssignee = (
    current: Issue,
    nextStatus: IssueStatus | undefined,
    patchHasAssignee: boolean
  ): string | null => {
    if (patchHasAssignee) return null;
    const user = viewer();
    return autoAssignOnStart({
      meta: user?.user_metadata,
      currentStatus: current.status,
      currentAssigneeId: current.assignee_id,
      nextStatus,
      userId: user?.id,
    });
  };

  async function writeIssue(
    issueId: string,
    updates: IssueUpdateInput,
    analyticsSurface: string
  ): Promise<Issue | null> {
    const current = findIssueAnywhere(queryClient, issueId);
    const assignee = current
      ? startAssignee(current, updates.status, "assignee_id" in updates)
      : null;
    // The server's two side effects, mirrored: starting an issue can assign
    // it, and moving it to triage takes it out of its cycle (MIN-32).
    const patch: IssueUpdateInput = {
      ...updates,
      ...(assignee ? { assignee_id: assignee } : {}),
      ...(leavesCycleOnStatus(current, updates.status) ? { cycle_id: null } : {}),
    };
    // Registered BEFORE the cache patch (MIN-156): from here on, no fetch
    // response that left earlier can replay the previous state.
    const handle = issueWrites.begin({
      kind: "patch",
      id: issueId,
      patch: issueCachePatch(patch),
    });
    if (current) {
      patchIssueEverywhere(queryClient, current.project_id, issueId, issueCachePatch(patch));
    }
    const request = updateIssueApi(issueId, patch, {
      surface: analyticsSurface,
      previousStatus: current?.status ?? null,
    });
    const before = current ? buildBeforePatch(current, patch) : null;
    // Recorded with the optimistic patch, so an instant ⌘Z finds the entry.
    const rec =
      current && before
        ? record(
            { kind: "update", projectId: current.project_id, issueId, before, after: patch },
            settledOf(request)
          )
        : null;
    try {
      // The server row is merged rather than refetched: one refetch per write
      // of a bulk edit is what opened the race window.
      const issue = await request;
      mergeServerIssue(queryClient, issue.project_id, issue);
      issueWrites.settle(handle, issue);
      return issue;
    } catch (err) {
      // Targeted rollback: only this write's fields return, so one failure in
      // a batch does not wipe the other writes' optimistic patches.
      issueWrites.fail(handle);
      rec?.retract();
      if (current && before) {
        patchIssueEverywhere(queryClient, current.project_id, issueId, before as Partial<Issue>);
      }
      showWriteError(err);
      return null;
    }
  }

  const categoryWindows = new Map<string, CategoryWindow>();
  // The last PUT per issue, chained into the next window's undo `settled` so
  // an undo cannot overtake a flush still in flight.
  const lastCategoryFlush = new Map<string, Promise<unknown>>();

  function flushCategories(issueId: string): void {
    const win = categoryWindows.get(issueId);
    if (!win) return;
    categoryWindows.delete(issueId);
    const ids = win.latest;
    const request = setIssueCategoriesApi(issueId, ids);
    lastCategoryFlush.set(issueId, settledOf(request));
    request.then(
      () => {
        // A window that toggled back to its starting set records nothing.
        if (sameSet(win.before, ids)) win.rec?.retract();
        else trackEvent("issue_category_changed", { count: ids.length });
        win.landed();
        // The PUT returns no row: the written set IS the truth, and realtime
        // reconciles the other clients.
        for (const handle of win.handles) issueWrites.settle(handle);
        for (const resolve of win.waiters) resolve(true);
      },
      (err) => {
        for (const handle of win.handles) issueWrites.fail(handle);
        win.rec?.retract();
        win.landed();
        if (win.projectId) {
          patchIssueEverywhere(queryClient, win.projectId, issueId, {
            category_ids: win.before,
          });
        }
        showWriteError(err);
        for (const resolve of win.waiters) resolve(false);
      }
    );
  }

  return {
    async createIssue(projectId, input) {
      if (input.smart_fill) {
        createIssueDeferred({ queryClient, projectId, input, record });
        return null;
      }
      const optimistic = buildOptimisticIssue(
        input,
        projectId,
        viewer()?.id ?? null,
        cachedProjectIssues(queryClient, projectId)
      );
      // Registered BEFORE the insert (MIN-156): a GET that left earlier can no
      // longer make the new card disappear.
      const handle = issueWrites.begin({ kind: "insert", row: optimistic });
      insertIssueEverywhere(queryClient, projectId, optimistic);
      // The row is born with the card's id, so the realtime echo of this
      // insert is recognized instead of added beside it (lib/optimistic-issue.ts).
      void createIssueApi(projectId, { ...input, id: optimistic.id }).then(
        (issue) => {
          insertIssueEverywhere(queryClient, projectId, issue);
          mergeServerIssue(queryClient, projectId, issue);
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
          showWriteError(err);
        }
      );
      return optimistic;
    },

    updateIssue: (issueId, updates) => writeIssue(issueId, updates, surface),

    moveIssue(issueId, patch) {
      // Reordering within a column is not a status change: only a real column
      // change is tracked.
      const from = findIssueAnywhere(queryClient, issueId)?.status;
      if (patch.status && patch.status !== from) {
        trackEvent("issue_dragged", { from: from ?? "unknown", to: patch.status, scope });
      }
      return writeIssue(issueId, patch, moveSurface);
    },

    setIssueCycle: (issueId, cycleId) =>
      writeIssue(issueId, cycleMembershipPatch(cycleId, viewer()?.id), surface),

    setCategories(issueId, categoryIds) {
      let win = categoryWindows.get(issueId);
      if (win) {
        clearTimeout(win.timer);
        if (win.rec?.entry.kind === "categories") win.rec.entry.after = categoryIds;
      } else {
        const current = findIssueAnywhere(queryClient, issueId);
        const before = current?.category_ids ?? [];
        let landed: () => void = () => {};
        const flushed = new Promise<void>((resolve) => {
          landed = resolve;
        });
        const prior = lastCategoryFlush.get(issueId);
        // The window's first toggle records at once (an instant ⌘Z must find
        // it); the next toggles only move its `after`.
        const rec = current
          ? record(
              {
                kind: "categories",
                projectId: current.project_id,
                issueId,
                before,
                after: categoryIds,
              },
              prior ? Promise.all([prior, flushed]) : flushed
            )
          : null;
        win = {
          timer: undefined as unknown as ReturnType<typeof setTimeout>,
          projectId: current?.project_id ?? null,
          before,
          latest: categoryIds,
          handles: [],
          rec,
          landed,
          waiters: [],
        };
        categoryWindows.set(issueId, win);
      }
      win.latest = categoryIds;
      win.handles.push(
        issueWrites.begin({ kind: "patch", id: issueId, patch: { category_ids: categoryIds } })
      );
      if (win.projectId) {
        patchIssueEverywhere(queryClient, win.projectId, issueId, { category_ids: categoryIds });
      }
      win.timer = setTimeout(() => flushCategories(issueId), CATEGORY_WRITE_DEBOUNCE_MS);
      const waiting = win;
      return new Promise<boolean>((resolve) => waiting.waiters.push(resolve));
    },

    async deleteIssue(issueId) {
      const target = findIssueAnywhere(queryClient, issueId);
      // Removed from every cache up front and registered first (MIN-156): a
      // read already in flight cannot bring the card back, and the realtime
      // echo of the trash is recognized as our own.
      const handle = issueWrites.begin({ kind: "remove", id: issueId });
      if (target) removeIssueEverywhere(queryClient, target.project_id, issueId);
      const request = deleteIssueApi(issueId, { surface });
      // What the undo re-creation restores: the issue, the sub-issues it
      // orphans and its relation rows.
      const rec = target
        ? record(
            {
              kind: "delete",
              projectId: target.project_id,
              issueId,
              snapshot: snapshotIssue(target),
              childIds: cachedProjectIssues(queryClient, target.project_id)
                .filter((i) => i.parent_id === issueId)
                .map((i) => i.id),
              relations: cachedIssueRelations(queryClient, target.project_id, issueId).map(
                ({ source_id, target_id, type, source_type, target_type }) => ({
                  source_id,
                  target_id,
                  type,
                  source_type,
                  target_type,
                })
              ),
            },
            settledOf(request)
          )
        : null;
      try {
        await request;
        issueWrites.settle(handle);
        return true;
      } catch (err) {
        issueWrites.fail(handle);
        rec?.retract();
        if (target) insertIssueEverywhere(queryClient, target.project_id, target);
        showWriteError(err);
        return false;
      }
    },
  };
}

/** {@link createIssueMutations} bound to this app's query client, undo history and viewer. */
export function useIssueMutations(scope: IssueWriteScope): IssueMutations {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { record } = useUndoHistory();
  const viewerRef = useRef<Viewer>(user ?? null);
  viewerRef.current = user ?? null;
  return useMemo(
    () =>
      createIssueMutations({ queryClient, record, viewer: () => viewerRef.current, scope }),
    [queryClient, record, scope]
  );
}
