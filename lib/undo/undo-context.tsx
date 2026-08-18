"use client";

// Local undo/redo history a la Linear (MIN-35). ⌘Z / ⌘⇧Z replay the last
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
import { restoreTrashItemApi } from "@/lib/trash-api";
import {
  addIssueRelationApi,
  removeIssueRelationApi,
} from "@/lib/issue-relations-api";
import {
  GLOBAL_BOARD_KEY,
  issueWrites,
  patchIssueEverywhere,
  removeIssueEverywhere,
} from "@/lib/optimistic/issue-writes";
import { isTypingTarget } from "@/lib/keyboard/keyboard-context";
import { eventKey } from "@/lib/keyboard/event-key";
import {
  pushEntry,
  resolveAliased,
  type IssueSnapshot,
  type RelationSnapshot,
  type UndoAction,
  type UndoEntry,
} from "./undo-core";
import type { PendingHandle } from "@/lib/optimistic/pending-writes";
import type {
  GlobalBoardResponse,
  Issue,
  IssueUpdateInput,
} from "@/lib/types";
import type { MessageKey } from "@/lib/i18n-keys";
import { trackEvent } from "@/lib/analytics";

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
/** FULL keys (`actions.*`) rather than suffixes glued back to the
 * calling point: this is what allows TypeScript to check them against the
 * catalog — a `actions.` + suffix is ​​just a string to it. */
const ACTION_KEYS: Record<UndoEntry["kind"], MessageKey<"Undo">> = {
  update: "actions.update",
  categories: "actions.categories",
  create: "actions.create",
  delete: "actions.delete",
  "relation-add": "actions.relationAdd",
  "relation-remove": "actions.relationRemove",
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
  //
  // The patches themselves live in lib/optimistic/issue-writes.ts, shared
  // with write hooks; here we just open the registry entry
  // which protects them from a late response, and close it on replay.

  const patchIssueCaches = useCallback(
    (projectId: string, issueId: string, patch: Partial<Issue>) =>
      patchIssueEverywhere(queryClient, projectId, issueId, patch),
    [queryClient]
  );

  const removeIssueFromCaches = useCallback(
    (projectId: string, issueId: string) =>
      removeIssueEverywhere(queryClient, projectId, issueId),
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
 re-adds need server-assigned ids, so they reconcile via invalidation.
 Returns the write register entry opened by THIS replay: it
 belongs to the replay, not the history entry. A ⌘Z followed by a ⌘⇧Z
 before the first one has reached the server opens two, and each
 must be closed by its own turn - keeping it on the entry
 lost the first one, which then remained "in flight" forever and
 replayed its patch on all subsequent responses (MIN-156). */
  const applyOptimistic = useCallback(
    (entry: UndoEntry, direction: "undo" | "redo"): PendingHandle | null => {
      const alias = aliasRef.current;
      switch (entry.kind) {
        case "update": {
          const id = resolveAliased(alias, entry.issueId);
          const patch = (
            direction === "undo" ? entry.before : entry.after
          ) as Partial<Issue>;
          const handle = issueWrites.begin({ kind: "patch", id, patch });
          patchIssueCaches(entry.projectId, id, patch);
          return handle;
        }
        case "categories": {
          const id = resolveAliased(alias, entry.issueId);
          const patch = {
            category_ids: direction === "undo" ? entry.before : entry.after,
          };
          const handle = issueWrites.begin({ kind: "patch", id, patch });
          patchIssueCaches(entry.projectId, id, patch);
          return handle;
        }
        case "create":
          if (direction === "undo") {
            const id = resolveAliased(alias, entry.issueId);
            const handle = issueWrites.begin({ kind: "remove", id });
            removeIssueFromCaches(entry.projectId, id);
            return handle;
          }
          return null;
        case "delete":
          if (direction === "redo") {
            const id = resolveAliased(alias, entry.issueId);
            const handle = issueWrites.begin({ kind: "remove", id });
            removeIssueFromCaches(entry.projectId, id);
            return handle;
          }
          return null;
        case "relation-add":
          if (direction === "undo") {
            removeRelationFromCaches(entry.projectId, entry.relationId);
          }
          return null;
        case "relation-remove":
          if (direction === "redo") {
            removeRelationFromCaches(entry.projectId, entry.relationId);
          }
          return null;
      }
    },
    [patchIssueCaches, removeIssueFromCaches, removeRelationFromCaches]
  );

  /** Closes the register entry opened by the replay: `settled` when
 the writing was successful (the responses left after it are authentic), forgotten
 when it failed (the invalidation which follows restores the truth). */
  const closePending = useCallback(
    (pending: PendingHandle | null, outcome: "settled" | "failed") => {
      if (!pending) return;
      if (outcome === "settled") issueWrites.settle(pending);
      else issueWrites.fail(pending);
    },
    []
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
            // Since MIN-133, delete puts in trash: cancel, it's
            // restore THE SAME line — its number, its comments, its
            // attachments and its history return with it. There
            // re-creation of before made an impoverished copy AND left
            // the original in the trash, in duplicate. She remains in rescue
            // for the line already purged by hand in the meantime (404).
            try {
              await restoreTrashItemApi("issue", resolveAliased(alias, entry.issueId));
            } catch {
              await recreate(
                entry.projectId,
                entry.issueId,
                entry.snapshot,
                entry.childIds,
                entry.relations
              );
            }
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
      const pending = applyOptimistic(entry, direction);
      to.push(entry);
      const action = tRef.current(ACTION_KEYS[entry.kind]);
      toast.success(
        tRef.current(direction === "undo" ? "undone" : "redone", { action })
      );

      const queued = entry;
      queueRef.current = queueRef.current.then(async () => {
        if (queued.dead) {
          closePending(pending, "failed");
          return;
        }
        try {
          // Never overtake the mutation being replayed (it may still be in flight).
          if (queued.settled) await queued.settled;
          await applyServer(queued, direction);
          // Closed AFTER the invalidation of `applyServer`: a refetch left
          // before this point keeps the overlay, so cannot replay the state
          // before replay.
          closePending(pending, "settled");
        } catch (err) {
          // Entry dropped: it no longer applies (e.g. deleted elsewhere) and
          // keeping it would wedge the stack; invalidation restores the truth.
          closePending(pending, "failed");
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
    [applyOptimistic, applyServer, closePending, retract, invalidate]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      if (eventKey(e) !== "z") return;
      // Text fields and TipTap keep their native undo while focused.
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const direction = e.shiftKey ? "redo" : "undo";
      trackEvent("undo_triggered", { action: direction });
      run(direction);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [run]);

  const value = useMemo<UndoHistory>(() => ({ record }), [record]);

  return <UndoContext.Provider value={value}>{children}</UndoContext.Provider>;
}
