"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { toast } from "mangue-ui";
import {
  createIssueApi,
  deleteIssueApi,
  issuesQueryFn,
  updateIssueApi,
} from "./issues-api";
import { setIssueCategoriesApi } from "./categories-api";
import {
  insertIssueEverywhere,
  issueWrites,
  mergeServerIssue,
  patchIssueEverywhere,
  removeIssueEverywhere,
  replaceIssueEverywhere,
} from "./optimistic/issue-writes";
import { trackEvent } from "./analytics";
import { buildOptimisticIssue } from "./optimistic-issue";
import { useAuth } from "./auth-context";
import { autoAssignOnStart } from "./auto-assign-on-start";
import { leavesCycleOnStatus } from "./cycle";
import { useUndoHistory, type UndoRecord } from "./undo/undo-context";
import { buildBeforePatch, snapshotIssue } from "./undo/undo-core";
import type { PendingHandle } from "./optimistic/pending-writes";
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
  // Les entrées du registre d'écritures ouvertes par la fenêtre (une par
  // toggle) et le jeu de catégories d'avant, pour la refermer au flush (MIN-156).
  const catHandles = useRef(new Map<string, PendingHandle[]>());
  const catBefore = useRef(new Map<string, string[]>());

  const { data, isLoading, error } = useQuery({
    queryKey: issuesKey(projectId ?? ""),
    queryFn: issuesQueryFn(projectId ?? ""),
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

  // Optimistic: insère une carte immédiatement (le dialog se ferme sans attendre
  // le POST), remplace par la ligne serveur au succès, retire + toast à l'échec.
  // Realtime réconcilie les autres clients ; localement pas de refetch.
  const createIssue = useCallback(
    async (input: CreateIssueInput) => {
      const pid = projectId as string;
      const key = issuesKey(pid);
      const optimistic = buildOptimisticIssue(
        input,
        pid,
        user?.id ?? null,
        queryClient.getQueryData<Issue[]>(key) ?? []
      );
      // Inscrite au registre AVANT le patch (MIN-156) : une réponse de GET
      // partie plus tôt ne peut plus faire disparaître la carte à peine créée.
      const handle = issueWrites.begin({ kind: "insert", row: optimistic });
      queryClient.setQueryData<Issue[]>(key, (old) => [...(old ?? []), optimistic]);
      // Et dans le board agrégé s'il est chargé : sans ça, /all ignorerait la
      // carte jusqu'à son prochain refetch (l'écho temps réel de notre propre
      // création ne l'invalide plus — MIN-156).
      insertIssueEverywhere(queryClient, pid, optimistic);
      void createIssueApi(pid, input).then(
        (issue) => {
          replaceIssueEverywhere(queryClient, pid, optimistic.id, issue);
          insertIssueEverywhere(queryClient, pid, issue);
          issueWrites.settle(handle, issue);
          record({
            kind: "create",
            projectId: pid,
            issueId: issue.id,
            snapshot: snapshotIssue(issue),
          });
        },
        (err) => {
          issueWrites.fail(handle);
          removeIssueEverywhere(queryClient, pid, optimistic.id);
          toast.error((err as Error).message);
        }
      );
      return optimistic;
    },
    [projectId, queryClient, user, record]
  );

  // Optimistic: patch the caches immediately so edits (incl. inline card
  // pickers) feel instant; persist, reconcile with the server row, and revert
  // the touched fields only on failure.
  const updateIssue = useCallback(
    async (issueId: string, updates: IssueUpdateInput) => {
      const current = projectId
        ? queryClient
            .getQueryData<Issue[]>(issuesKey(projectId))
            ?.find((i) => i.id === issueId)
        : undefined;
      const assignee = startAssignee(current, updates.status, "assignee_id" in updates);
      // Les deux effets de bord serveur, reflétés localement : démarrer un
      // ticket peut se l'attribuer, et le passer en triage le sort du cycle
      // (triage et cycle s'excluent — MIN-32).
      const patch: IssueUpdateInput = {
        ...updates,
        ...(assignee ? { assignee_id: assignee } : {}),
        ...(leavesCycleOnStatus(current, updates.status) ? { cycle_id: null } : {}),
      };
      // Registre d'abord (MIN-156), patch ensuite : entre les deux, aucune
      // réponse en vol ne peut se glisser et rejouer l'état d'avant.
      const handle = issueWrites.begin({
        kind: "patch",
        id: issueId,
        patch: patch as Partial<Issue>,
      });
      if (projectId) {
        patchIssueEverywhere(queryClient, projectId, issueId, patch as Partial<Issue>);
      }
      // The final patch (injected assignee included) against the pre-edit issue.
      const request = updateIssueApi(issueId, patch, {
        surface: "project_board",
        previousStatus: current?.status ?? null,
      });
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
        // Réconcilie l'optimiste avec la ligne serveur faisant autorité (assignee
        // injecté, completed_at, cycle_id…) SANS refetch de tout le projet à
        // chaque édition de champ. Le realtime propage le changement aux autres
        // clients ; localement le cache est déjà exact.
        if (projectId) mergeServerIssue(queryClient, projectId, issue);
        issueWrites.settle(handle, issue);
        return issue;
      } catch (err) {
        // Rollback CIBLÉ (MIN-156) : seuls les champs que cette écriture a
        // touchés reviennent en arrière. Restaurer le tableau entier écrasait
        // aussi les patchs optimistes des autres écritures du même lot — un
        // seul échec faisait clignoter toute la sélection.
        issueWrites.fail(handle);
        rec?.retract();
        if (projectId && before) {
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
    [projectId, queryClient, startAssignee, record]
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
      const request = deleteIssueApi(issueId, { surface: "project_board" });
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
      const moved = queryClient
        .getQueryData<Issue[]>(issuesKey(projectId))
        ?.find((i) => i.id === issueId);
      const assignee = startAssignee(moved, patch.status, false);
      // Mêmes reflets qu'au-dessus : auto-attribution au démarrage, sortie du
      // cycle sur un passage en triage.
      const write: IssueUpdateInput = {
        ...patch,
        ...(assignee ? { assignee_id: assignee } : {}),
        ...(leavesCycleOnStatus(moved, patch.status) ? { cycle_id: null } : {}),
      };
      const handle = issueWrites.begin({
        kind: "patch",
        id: issueId,
        patch: write as Partial<Issue>,
      });
      patchIssueEverywhere(queryClient, projectId, issueId, write as Partial<Issue>);
      // Glisser-déposer : la surface qui dit si le kanban sert vraiment.
      const request = updateIssueApi(issueId, write, {
        surface: "kanban_drag",
        previousStatus: moved?.status ?? null,
      });
      if (patch.status && patch.status !== moved?.status) {
        trackEvent("issue_dragged", {
          from: moved?.status ?? "unknown",
          to: patch.status,
          scope: "project",
        });
      }
      const before = moved ? buildBeforePatch(moved, write) : null;
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
        // Comme updateIssue : la ligne serveur remplace l'optimiste (position
        // recalculée, completed_at, assigné injecté) sans refetch.
        const issue = await request;
        mergeServerIssue(queryClient, projectId, issue);
        issueWrites.settle(handle, issue);
      } catch (err) {
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
    [projectId, queryClient, startAssignee, record]
  );

  // Optimistic + DEBOUNCED per issue: rapid category toggles patch the cache
  // instantly but coalesce into a single PUT with the final set. Firing a PUT
  // per toggle raced on the join table (concurrent delete-then-insert →
  // duplicate-key 500 + UI stutter). Errors are surfaced here, then the cache is
  // reconciled from the server.
  const setCategories = useCallback(
    async (issueId: string, categoryIds: string[]) => {
      // First toggle of a debounce window: record right away (an instant ⌘Z
      // must find the entry) with a `settled` the flush resolves. Subsequent
      // toggles only move the entry's `after`.
      if (projectId && !catTimers.current.has(issueId)) {
        const current = queryClient
          .getQueryData<Issue[]>(issuesKey(projectId))
          ?.find((i) => i.id === issueId);
        // Le jeu d'avant la fenêtre : c'est là que le cache revient si le PUT
        // groupé échoue, sans toucher aux autres champs du ticket.
        catBefore.current.set(issueId, current?.category_ids ?? []);
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
      if (projectId) {
        // Un toggle = une entrée au registre : elles se fusionnent par `seq`
        // croissant, donc le dernier état gagne, et le lot entier se referme à
        // la retombée du PUT groupé.
        const handles = catHandles.current.get(issueId) ?? [];
        handles.push(
          issueWrites.begin({
            kind: "patch",
            id: issueId,
            patch: { category_ids: categoryIds },
          })
        );
        catHandles.current.set(issueId, handles);
        patchIssueEverywhere(queryClient, projectId, issueId, {
          category_ids: categoryIds,
        });
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
          const handles = catHandles.current.get(issueId) ?? [];
          catHandles.current.delete(issueId);
          const rollbackTo = catBefore.current.get(issueId);
          catBefore.current.delete(issueId);
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
              // Le PUT ne renvoie pas la ligne : le jeu écrit EST la vérité.
              // On referme les entrées et on laisse le realtime réconcilier
              // (invalider ici relancerait le refetch qu'on cherche à éviter).
              for (const handle of handles) issueWrites.settle(handle);
            })
            .catch((err) => {
              for (const handle of handles) issueWrites.fail(handle);
              held?.rec.retract();
              held?.resolve();
              if (projectId && rollbackTo) {
                patchIssueEverywhere(queryClient, projectId, issueId, {
                  category_ids: rollbackTo,
                });
              }
              toast.error((err as Error).message);
            });
        }, 300)
      );
    },
    [projectId, queryClient, record]
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
