"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "mangue-ui";
import { useProjects } from "@/lib/projects-context";
import { useAuth } from "@/lib/auth-context";
import { useMembersQuery } from "@/lib/use-members-query";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import { useObjectivesQuery } from "@/lib/use-objectives-query";
import { createIssueApi } from "@/lib/issues-api";
import { createObjectiveApi } from "@/lib/objectives-api";
import {
  insertIssueEverywhere,
  insertObjectiveEverywhere,
  issueWrites,
  mergeServerIssue,
  removeIssueEverywhere,
} from "@/lib/optimistic/issue-writes";
import { createIssueDeferred } from "@/lib/create-issue-deferred";
import { buildOptimisticIssue } from "@/lib/optimistic-issue";
import { useUndoHistory } from "@/lib/undo/undo-context";
import { snapshotIssue } from "@/lib/undo/undo-core";
import { projectIdFromPath } from "@/lib/project-id-from-path";
import {
  defaultCreateProjectId,
  lastCreateProjectId,
} from "@/lib/last-create-project";
import { eventKey } from "@/lib/keyboard/event-key";
import { matchesModShiftCombo } from "@/lib/keyboard/mod-combo";
import type { IssueStatus } from "@/lib/issue-constants";
import type {
  CreateIssueInput,
  CreateObjectiveInput,
  Issue,
  Objective,
} from "@/lib/types";

// Deferred, like the assistant panel: keeps the create dialogs (markdown editor,
// dictation, attachments) out of every route's initial bundle. Loaded the first
// time a create action fires.
const CreateIssueDialog = dynamic(
  () => import("@/components/create-issue-dialog").then((m) => m.CreateIssueDialog),
  { ssr: false }
);
const ObjectiveDialog = dynamic(
  () => import("@/components/objective-dialog").then((m) => m.ObjectiveDialog),
  { ssr: false }
);

interface OpenIssueOptions {
  /** Target project; defaults to the current route's project, else the last one
   *  a ticket was created in, else the first. */
  projectId?: string;
  status?: IssueStatus;
  objectiveId?: string | null;
  assigneeId?: string | null;
  /** Opens the already open microphone dialog (global shortcut ⌘⇧D). */
  dictate?: boolean;
}

interface OpenObjectiveOptions {
  /** Same defaulting as {@link OpenIssueOptions.projectId}. */
  projectId?: string;
  /** Prefills the name — quickly adding from a goal picker passes the
 * typed text into the search. */
  name?: string;
  /** Recalled with the created objective, so that the picker who opened the dialog
 * links to his ticket. Never recalled for a creation in ANOTHER project
 * (split button): the objective is not linkable. */
  onCreated?: (objective: Objective) => void;
}

interface CreateContextValue {
  openCreateIssue: (opts?: OpenIssueOptions) => void;
  openCreateObjective: (opts?: OpenObjectiveOptions) => void;
  /** No project → nothing to create in; drives the header actions' disabled state. */
  canCreate: boolean;
}

const CreateContext = createContext<CreateContextValue | null>(null);

/** The objective the current project board is filtered to (`?objective=`), read
 *  at call time so a quick-created issue (the `C` shortcut, the header "New
 *  issue") inherits it without threading state through every trigger. */
function activeObjectiveIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("objective") || null;
}

/**
 * App-wide issue/objective creation (MIN-33). Mounts {@link CreateIssueDialog}
 * and {@link ObjectiveDialog} once so "New ticket/objective" works from
 * anywhere — the home page, the cross-project board, the header, the mobile "+"
 * — not just inside a project. The target project defaults to the current route,
 * else the last project a ticket was created in (see {@link lastCreateProjectId}),
 * else the first; both dialogs let the user retarget via their split button.
 * Ticket creation is optimistic and goes through the write register en
 * wait + shared cache helpers (MIN-156), like `createIssue` des
 * two board hooks.
 *
 * The per-project board keeps its own local dialog for column-scoped presets
 * (a column's "+", objective mode, assigned-to-me) and the `C` shortcut.
 */
export function CreateProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { projects } = useProjects();
  const { user } = useAuth();
  // Local undo history (MIN-35): creations from the global dialog record too.
  const { record } = useUndoHistory();

  // Project whose members/categories/objectives feed the open dialog. Set on the
  // first open and left in place (dialogs stay mounted for reuse).
  const [target, setTarget] = useState<string | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  // Does the dialog open in dictation? Rested at EVERY opening, never
  // left lying around: otherwise a `C` typed after a ⌘⇧D would turn the microphone back on.
  const [issueDictate, setIssueDictate] = useState(false);
  const [issuePresets, setIssuePresets] = useState<{
    status?: IssueStatus;
    objectiveId: string | null;
    assigneeId: string | null;
  }>({ objectiveId: null, assigneeId: null });
  const [objectiveOpen, setObjectiveOpen] = useState(false);
  // Pre-filled name + recipient of the created objective, set by quick addition
  // of a picker. The callback lives in a ref: it does not redraw anything, and it is
  // CONSUMED upon creation — a subsequent opening (shortcut `O`, header) does not
  // must not link its objective to the previous ticket.
  const [objectiveName, setObjectiveName] = useState<string | undefined>(undefined);
  const objectiveCreatedRef = useRef<((objective: Objective) => void) | null>(null);

  const { members } = useMembersQuery(target, !!target);
  const { categories } = useCategoriesQuery(target);
  const { objectives } = useObjectivesQuery(target);

  // Optimistic (MIN-40): the card appears in the project cache AND the board
  // aggregated upon opening, the dialog closes without waiting for POST; reconciled
  // to success, removed + toast to failure. Realtime propagates to other clients.
  const createIssueGlobal = useCallback(
    async (projectId: string, input: CreateIssueInput) => {
      // Smart-fill (MIN-260): the server fills the ticket BEFORE inserting the
      // line, so no optimistic map — it would be empty for the duration of
      // remplissage. Cf. [create-issue-deferred](create-issue-deferred.ts).
      if (input.smart_fill) {
        createIssueDeferred({ queryClient, projectId, input, record });
        return null;
      }
      const optimistic = buildOptimisticIssue(
        input,
        projectId,
        user?.id ?? null,
        queryClient.getQueryData<Issue[]>(["issues", projectId]) ?? []
      );
      // Registered in the register BEFORE the patch (MIN-156): a GET response
      // played earlier can no longer make the newly created map disappear.
      const handle = issueWrites.begin({ kind: "insert", row: optimistic });
      insertIssueEverywhere(queryClient, projectId, optimistic);
      // The map names its line: the real-time echo of our creation is
      // recognized, not adopted alongside it (lib/optimistic-issue.ts).
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
          toast.error((err as Error).message);
        }
      );
      return optimistic;
    },
    [queryClient, user, record]
  );

  const createObjectiveGlobal = useCallback(
    async (projectId: string, input: CreateObjectiveInput) => {
      const objective = await createObjectiveApi(projectId, input);
      // Placed in the two caches that read it (project cache + board
      // cross-project) before invalidating: a ticket linked to this objective in the
      // stride displays its name and color immediately.
      insertObjectiveEverywhere(queryClient, projectId, objective);
      void queryClient.invalidateQueries({ queryKey: ["objectives", projectId] });
      return objective;
    },
    [queryClient]
  );

  /** Creation from the dialog, in the targeted project: this is what the quick addition
 * of a picker is waiting for to link the objective to his ticket. */
  const createObjectiveForTarget = useCallback(
    async (projectId: string, input: CreateObjectiveInput) => {
      const objective = await createObjectiveGlobal(projectId, input);
      const notify = objectiveCreatedRef.current;
      objectiveCreatedRef.current = null;
      notify?.(objective);
      return objective;
    },
    [createObjectiveGlobal]
  );

  const resolveTarget = useCallback(
    (projectId?: string) => {
      if (projectId) return projectId;
      const fromPath = projectIdFromPath(pathname);
      if (fromPath) return fromPath;
      // Outside of the project (reception, aggregate board, palette): the last project where a
      // ticket was created, not the first in the list — this one is just one
      // artefact du tri.
      return defaultCreateProjectId(projects, lastCreateProjectId());
    },
    [pathname, projects]
  );

  const openCreateIssue = useCallback(
    (opts?: OpenIssueOptions) => {
      const pid = resolveTarget(opts?.projectId);
      if (!pid) return;
      // On an objective-filtered board (/projects/[id]?objective=X), default the
      // new issue into that objective — so `C` and the header "New issue" land it
      // there like the column "+" already does. Only when the caller left the
      // objective unset AND we're creating in that same board's project (the
      // `?objective=` param belongs to the current route).
      const objectiveId =
        opts?.objectiveId !== undefined
          ? opts.objectiveId
          : pid === projectIdFromPath(pathname)
            ? activeObjectiveIdFromUrl()
            : null;
      setTarget(pid);
      setIssuePresets({
        status: opts?.status,
        objectiveId,
        assigneeId: opts?.assigneeId ?? null,
      });
      setIssueDictate(opts?.dictate === true);
      setIssueOpen(true);
    },
    [resolveTarget, pathname]
  );

  const openCreateObjective = useCallback(
    (opts?: OpenObjectiveOptions) => {
      const pid = resolveTarget(opts?.projectId);
      if (!pid) return;
      setTarget(pid);
      setObjectiveName(opts?.name?.trim() || undefined);
      objectiveCreatedRef.current = opts?.onCreated ?? null;
      setObjectiveOpen(true);
    },
    [resolveTarget]
  );

  // App-wide quick-create shortcuts (MIN-33): `C` = new issue, `O` = new
  // objective, from anywhere. Registered in the BUBBLE phase on purpose — the
  // hover field-shortcut (`O` = change an issue's objective) and the `G O`
  // navigation chord run in the capture phase and stopImmediatePropagation when
  // they own the key, so `O` only reaches here (and opens the create dialog)
  // when nothing else claimed it. `c` is absent from the field shortcuts, so it
  // always reaches here.
  useEffect(() => {
    if (projects.length === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const key = eventKey(e);
      if (key !== "c" && key !== "o") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      // A dialog / side panel (both Radix dialogs) owns the keyboard while open.
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      e.preventDefault();
      if (key === "c") openCreateIssue();
      else openCreateObjective();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [projects.length, openCreateIssue, openCreateObjective]);

  // ⌘⇧D everywhere: “new ticket, by voice”. This is the dictation shortcut,
  // extended to screens that had nothing to dictate — instead of doing nothing,
  // it opens the creation form with the microphone already open.
  //
  // He never TAKES the suit from whoever already wears it: each button of
  // dictation (ticket panel, Objectives page, objective dialog, return,
  // creation dialog itself) listens to it in the CAPTURE phase and does
  // `preventDefault`. This listener is in bubble phase, on the window:
  // so he goes AFTER them, and `defaultPrevented` tells him that a microphone more
  // close responded. Nothing to record, nothing to keep up to date.
  useEffect(() => {
    if (projects.length === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!matchesModShiftCombo(e, "d")) return;
      if (e.defaultPrevented) return;
      // An open dialog/side panel holds the keyboard (same guard as
      // `C` and `O` just above): we do not stack a form.
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      e.preventDefault();
      openCreateIssue({ dictate: true });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [projects.length, openCreateIssue]);

  // Value stored (MIN-315): this provider is crossed by the cascade which leaves
  // of `AuthProvider`, and its consumers go down to the cards on the board.
  const value = useMemo(
    () => ({
      openCreateIssue,
      openCreateObjective,
      canCreate: projects.length > 0,
    }),
    [openCreateIssue, openCreateObjective, projects.length]
  );

  return (
    <CreateContext.Provider value={value}>
      {children}
      {target && (
        <>
          <CreateIssueDialog
            open={issueOpen}
            onOpenChange={setIssueOpen}
            projectId={target}
            projects={projects}
            members={members}
            categories={categories}
            objectives={objectives}
            onCreate={(input) => createIssueGlobal(target, input)}
            onCreateInProject={createIssueGlobal}
            initialStatus={issuePresets.status}
            initialObjectiveId={issuePresets.objectiveId}
            initialAssigneeId={issuePresets.assigneeId}
            autoDictate={issueDictate}
          />
          <ObjectiveDialog
            open={objectiveOpen}
            onOpenChange={(next) => {
              // Closed without creating: the picker callback dies with the dialog.
              if (!next) objectiveCreatedRef.current = null;
              setObjectiveOpen(next);
            }}
            members={members}
            projects={projects}
            projectId={target}
            initialName={objectiveName}
            onCreate={(input) => createObjectiveForTarget(target, input)}
            onCreateInProject={createObjectiveGlobal}
            onUpdate={async () => {}}
          />
        </>
      )}
    </CreateContext.Provider>
  );
}

export function useCreate(): CreateContextValue {
  const ctx = useContext(CreateContext);
  if (!ctx) throw new Error("useCreate must be used within CreateProvider");
  return ctx;
}

/** Same context, but tolerated absent: the components shared with the board
 * PUBLIC (the boards) have no one to mount the creation dialogs, and
 * simply hide what depends on them. */
export function useCreateOptional(): CreateContextValue | null {
  return useContext(CreateContext);
}
