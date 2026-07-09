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
// Execution calls the API wrappers directly (never the hooks), so applying an
// undo/redo is itself never recorded; caches are reconciled by invalidation.
// While focus is on a typing target, ⌘Z stays with the native/TipTap undo.

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
import type { Issue, IssueUpdateInput } from "@/lib/types";

interface UndoHistory {
  record: (action: UndoAction) => void;
}

// Safe default so the hook is a no-op outside the provider (tests, share pages).
const UndoContext = createContext<UndoHistory>({ record: () => {} });

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
  /** An execution is in flight — further ⌘Z are consumed but ignored. */
  const busyRef = useRef(false);

  const record = useCallback((action: UndoAction) => {
    pushEntry(undoStackRef.current, { ...action, at: Date.now() });
    redoStackRef.current = [];
  }, []);

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

  const execute = useCallback(
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
    async (direction: "undo" | "redo") => {
      if (busyRef.current) return;
      const [from, to] =
        direction === "undo"
          ? [undoStackRef.current, redoStackRef.current]
          : [redoStackRef.current, undoStackRef.current];
      const entry = from.pop();
      if (!entry) return;
      busyRef.current = true;
      try {
        await execute(entry, direction);
        to.push(entry);
        const action = tRef.current(`actions.${ACTION_KEYS[entry.kind]}`);
        toast.success(
          tRef.current(direction === "undo" ? "undone" : "redone", { action })
        );
      } catch (err) {
        // Entry dropped: it no longer applies (e.g. deleted elsewhere) and
        // keeping it would wedge the stack.
        toast.error(
          tRef.current(direction === "undo" ? "undoFailed" : "redoFailed", {
            message: (err as Error).message,
          })
        );
      } finally {
        busyRef.current = false;
      }
    },
    [execute]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      if (e.key.toLowerCase() !== "z") return;
      // Text fields and TipTap keep their native undo while focused.
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      void run(e.shiftKey ? "redo" : "undo");
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [run]);

  const value = useMemo<UndoHistory>(() => ({ record }), [record]);

  return <UndoContext.Provider value={value}>{children}</UndoContext.Provider>;
}
