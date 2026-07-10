"use client";

// Local undo/redo history à la Linear (MIN-35). ⌘Z / ⌘⇧Z replay the last
// user-initiated issue mutation in reverse / forward. The history lives in
// memory (per tab, never persisted or synced).
//
// Recording happens inside the client mutation hooks (use-issues-query,
// use-global-board-query, use-issue-relations-query, create-context) — the
// only paths direct UI edits take. Numo and MCP mutate server-side and reach
// the browser through the realtime bridge, so they are structurally excluded.
//
// The whole loop is optimistic so an edit can be undone the instant it's made:
// hooks record BEFORE their write settles (retracting the entry if it fails),
// and a replay patches the react-query caches synchronously, then queues its
// server write on a serial queue that waits for the recorded write (`settled`)
// — ordering is preserved without ever blocking the UI. Replays call the API
// wrappers directly (never the hooks), so applying an undo/redo is itself
// never recorded. While focus is on a typing target, ⌘Z stays with the
// native/TipTap undo.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import {
  createIssueApi,
  deleteIssueApi,
  updateIssueApi,
} from "@/lib/issues-api";
import { setIssueCategoriesApi } from "@/lib/categories-api";
import {
  addIssueRelationApi,
  removeIssueRelationApi,
} from "@/lib/issue-relations-api";
import { GLOBAL_BOARD_KEY } from "@/lib/use-global-board-query";
import { isTypingTarget } from "@/lib/keyboard/keyboard-context";
import {
  pushEntry,
  resolveAliased,
  type IssueSnapshot,
  type RelationSnapshot,
  type UndoAction,
  type UndoEntry,
} from "./undo-core";
import type {
  GlobalBoardResponse,
  Issue,
  IssueUpdateInput,
} from "@/lib/types";

/** Handle returned by record(): the canonical stack entry (rapid category
    toggles coalesce into one) and its retraction (write failed → drop it). */
export interface UndoRecord {
  entry: UndoEntry;
  retract: () => void;
}

interface UndoHistory {
  /** Record a user mutation the moment it's applied optimistically. `settled`
      is the write's own promise (never-throwing) — replays order after it. */
  record: (action: UndoAction, settled?: Promise<unknown>) => UndoRecord | null;
}

// Safe default so the hook is a no-op outside the provider (tests, share pages).
const UndoContext = createContext<UndoHistory>({ record: () => null });

/** Recording facade for the mutation hooks. No-op outside an UndoProvider. */
export function useUndoHistory(): UndoHistory {
  return useContext(UndoContext);
}

/** i18n key under `Undo.actions` for each entry kind. */
const ACTION_KEYS: Record<UndoEntry["kind"], string> = {
  update: "update",
  categories: "categories",
  create: "create",
  delete: "delete",
  "relation-add": "relationAdd",
  "relation-remove": "relationRemove",
};

export function UndoProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const t = useTranslations("Undo");
  const tRef = useRef(t);
  tRef.current = t;

  const undoStackRef = useRef<UndoEntry[]>([]);
  const redoStackRef = useRef<UndoEntry[]>([]);
  /** Original issue id → id of its latest re-creation. */
  const aliasRef = useRef(new Map<string, string>());
  /** Serial queue of replay writes — keeps them ordered without blocking UI. */
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const retract = useCallback((entry: UndoEntry) => {
    entry.dead = true;
    undoStackRef.current = undoStackRef.current.filter((e) => e !== entry);
    redoStackRef.current = redoStackRef.current.filter((e) => e !== entry);
  }, []);

  const record = useCallback(
    (action: UndoAction, settled?: Promise<unknown>): UndoRecord => {
      const entry = pushEntry(undoStackRef.current, {
        ...action,
        at: Date.now(),
      });
      entry.settled = settled;
      redoStackRef.current = [];
      return { entry, retract: () => retract(entry) };
    },
    [retract]
  );

  // ── Optimistic cache patches (both boards) — replays feel instant ────────

  const patchIssueCaches = useCallback(
    (projectId: string, issueId: string, patch: Partial<Issue>) => {
      queryClient.setQueryData<Issue[]>(["issues", projectId], (old) =>
        old?.map((i) => (i.id === issueId ? { ...i, ...patch } : i))
      );
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

  const removeIssueFromCaches = useCallback(
    (projectId: string, issueId: string) => {
      queryClient.setQueryData<Issue[]>(["issues", projectId], (old) =>
        old?.filter((i) => i.id !== issueId)
      );
      queryClient.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, (old) =>
        old
          ? { ...old, issues: old.issues.filter((i) => i.id !== issueId) }
          : old
      );
    },
    [queryClient]
  );

  const removeRelationFromCaches = useCallback(
    (projectId: string, relationId: string) => {
      queryClient.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, (old) =>
        old
          ? {
              ...old,
              relations: old.relations.filter((r) => r.id !== relationId),
            }
          : old
      );
      queryClient.setQueryData(
        ["issue-relations", projectId],
        (old: { id: string }[] | undefined) =>
          old?.filter((r) => r.id !== relationId)
      );
    },
    [queryClient]
  );

  /** What can be shown before the server confirms. Re-creations and relation
      re-adds need server-assigned ids, so they reconcile via invalidation. */
  const applyOptimistic = useCallback(
    (entry: UndoEntry, direction: "undo" | "redo") => {
      const alias = aliasRef.current;
      switch (entry.kind) {
        case "update":
          patchIssueCaches(
            entry.projectId,
            resolveAliased(alias, entry.issueId),
            (direction === "undo" ? entry.before : entry.after) as Partial<Issue>
          );
          break;
        case "categories":
          patchIssueCaches(entry.projectId, resolveAliased(alias, entry.issueId), {
            category_ids: direction === "undo" ? entry.before : entry.after,
          });
          break;
        case "create":
          if (direction === "undo") {
            removeIssueFromCaches(
              entry.projectId,
              resolveAliased(alias, entry.issueId)
            );
          }
          break;
        case "delete":
          if (direction === "redo") {
            removeIssueFromCaches(
              entry.projectId,
              resolveAliased(alias, entry.issueId)
            );
          }
          break;
        case "relation-add":
          if (direction === "undo") {
            removeRelationFromCaches(entry.projectId, entry.relationId);
          }
          break;
        case "relation-remove":
          if (direction === "redo") {
            removeRelationFromCaches(entry.projectId, entry.relationId);
          }
          break;
      }
    },
    [patchIssueCaches, removeIssueFromCaches, removeRelationFromCaches]
  );

  const invalidate = useCallback(
    (entry: UndoEntry) => {
      void queryClient.invalidateQueries({
        queryKey: ["issues", entry.projectId],
      });
      void queryClient.invalidateQueries({ queryKey: GLOBAL_BOARD_KEY });
      if (entry.kind !== "update" && entry.kind !== "categories") {
        void queryClient.invalidateQueries({
          queryKey: ["issue-relations", entry.projectId],
        });
      }
    },
    [queryClient]
  );

  /** Re-add a relation row with alias-resolved endpoints; returns the new row. */
  const readdRelation = useCallback(
    async (projectId: string, relation: RelationSnapshot) => {
      const alias = aliasRef.current;
      return addIssueRelationApi(projectId, {
        source_id: resolveAliased(alias, relation.source_id),
        target_id: resolveAliased(alias, relation.target_id),
        type: relation.type,
      });
    },
    []
  );

  /**
   * Re-create a deleted issue from its snapshot. The POST is the hard step;
   * position/cycle/duplicate (not carried by CreateIssueInput), child
   * re-linking and relations are best-effort fidelity on top.
   */
  const recreate = useCallback(
    async (
      projectId: string,
      oldId: string,
      snapshot: IssueSnapshot,
      childIds: string[],
      relations: RelationSnapshot[]
    ): Promise<Issue> => {
      const alias = aliasRef.current;
      const created = await createIssueApi(projectId, {
        title: snapshot.title,
        description: snapshot.description,
        plan: snapshot.plan,
        status: snapshot.status,
        priority: snapshot.priority,
        effort: snapshot.effort,
        assignee_id: snapshot.assignee_id,
        objective_id: snapshot.objective_id,
        parent_id: snapshot.parent_id
          ? resolveAliased(alias, snapshot.parent_id)
          : null,
        due_date: snapshot.due_date,
        category_ids: snapshot.category_ids,
      });
      alias.set(oldId, created.id);

      const followUp: IssueUpdateInput = { position: snapshot.position };
      if (snapshot.cycle_id) followUp.cycle_id = snapshot.cycle_id;
      if (snapshot.duplicate_of_id) {
        followUp.duplicate_of_id = resolveAliased(alias, snapshot.duplicate_of_id);
      }
      try {
        await updateIssueApi(created.id, followUp);
      } catch {
        // Best-effort — e.g. the cycle closed in the meantime.
      }
      for (const childId of childIds) {
        try {
          await updateIssueApi(resolveAliased(alias, childId), {
            parent_id: created.id,
          });
        } catch {
          // Best-effort — the child may have been deleted since.
        }
      }
      for (const relation of relations) {
        try {
          await readdRelation(projectId, relation);
        } catch {
          // Best-effort — the other issue may be gone.
        }
      }
      return created;
    },
    [readdRelation]
  );

  const applyServer = useCallback(
    async (entry: UndoEntry, direction: "undo" | "redo") => {
      const alias = aliasRef.current;
      switch (entry.kind) {
        case "update":
          await updateIssueApi(
            resolveAliased(alias, entry.issueId),
            direction === "undo" ? entry.before : entry.after
          );
          break;
        case "categories":
          await setIssueCategoriesApi(
            resolveAliased(alias, entry.issueId),
            direction === "undo" ? entry.before : entry.after
          );
          break;
        case "create":
          if (direction === "undo") {
            await deleteIssueApi(resolveAliased(alias, entry.issueId));
          } else {
            await recreate(entry.projectId, entry.issueId, entry.snapshot, [], []);
          }
          break;
        case "delete":
          if (direction === "undo") {
            await recreate(
              entry.projectId,
              entry.issueId,
              entry.snapshot,
              entry.childIds,
              entry.relations
            );
          } else {
            await deleteIssueApi(resolveAliased(alias, entry.issueId));
          }
          break;
        case "relation-add":
          if (direction === "undo") {
            await removeIssueRelationApi(entry.relationId);
          } else {
            const created = await readdRelation(entry.projectId, entry.relation);
            entry.relationId = created.id;
          }
          break;
        case "relation-remove":
          if (direction === "undo") {
            const created = await readdRelation(entry.projectId, entry.relation);
            entry.relationId = created.id;
          } else {
            await removeIssueRelationApi(entry.relationId);
          }
          break;
      }
      invalidate(entry);
    },
    [invalidate, recreate, readdRelation]
  );

  const run = useCallback(
    (direction: "undo" | "redo") => {
      const [from, to] =
        direction === "undo"
          ? [undoStackRef.current, redoStackRef.current]
          : [redoStackRef.current, undoStackRef.current];
      let entry: UndoEntry | undefined;
      do {
        entry = from.pop();
      } while (entry?.dead);
      if (!entry) return;

      // Instant feedback: patch the caches and toast now, write in the queue.
      applyOptimistic(entry, direction);
      to.push(entry);
      const action = tRef.current(`actions.${ACTION_KEYS[entry.kind]}`);
      toast.success(
        tRef.current(direction === "undo" ? "undone" : "redone", { action })
      );

      const queued = entry;
      queueRef.current = queueRef.current.then(async () => {
        if (queued.dead) return;
        try {
          // Never overtake the mutation being replayed (it may still be in flight).
          if (queued.settled) await queued.settled;
          await applyServer(queued, direction);
        } catch (err) {
          // Entry dropped: it no longer applies (e.g. deleted elsewhere) and
          // keeping it would wedge the stack; invalidation restores the truth.
          retract(queued);
          toast.error(
            tRef.current(direction === "undo" ? "undoFailed" : "redoFailed", {
              message: (err as Error).message,
            })
          );
          invalidate(queued);
        }
      });
    },
    [applyOptimistic, applyServer, retract, invalidate]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      if (e.key.toLowerCase() !== "z") return;
      // Text fields and TipTap keep their native undo while focused.
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      run(e.shiftKey ? "redo" : "undo");
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [run]);

  const value = useMemo<UndoHistory>(() => ({ record }), [record]);

  return <UndoContext.Provider value={value}>{children}</UndoContext.Provider>;
}
