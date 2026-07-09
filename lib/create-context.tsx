"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useProjects } from "@/lib/projects-context";
import { useMembersQuery } from "@/lib/use-members-query";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import { useObjectivesQuery } from "@/lib/use-objectives-query";
import { createIssueApi } from "@/lib/issues-api";
import { createObjectiveApi } from "@/lib/objectives-api";
import { GLOBAL_BOARD_KEY } from "@/lib/use-global-board-query";
import { useUndoHistory } from "@/lib/undo/undo-context";
import { snapshotIssue } from "@/lib/undo/undo-core";
import { projectIdFromPath } from "@/lib/project-id-from-path";
import type { IssueStatus } from "@/lib/issue-constants";
import type { CreateIssueInput, CreateObjectiveInput } from "@/lib/types";

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
  /** Target project; defaults to the current route's project, else the first. */
  projectId?: string;
  status?: IssueStatus;
  objectiveId?: string | null;
  assigneeId?: string | null;
}

interface OpenObjectiveOptions {
  /** Target project; defaults to the current route's project, else the first. */
  projectId?: string;
}

interface CreateContextValue {
  openCreateIssue: (opts?: OpenIssueOptions) => void;
  openCreateObjective: (opts?: OpenObjectiveOptions) => void;
  /** No project → nothing to create in; drives the header actions' disabled state. */
  canCreate: boolean;
}

const CreateContext = createContext<CreateContextValue | null>(null);

/**
 * App-wide issue/objective creation (MIN-33). Mounts {@link CreateIssueDialog}
 * and {@link ObjectiveDialog} once so "Nouveau ticket/objectif" works from
 * anywhere — the home page, the cross-project board, the header, the mobile "+"
 * — not just inside a project. The target project defaults to the current route
 * (else the first project); both dialogs let the user retarget via their split
 * button. Writes go through the by-project APIs + cache invalidation (the same
 * non-optimistic path the project board already uses), so a project board
 * sharing the `["issues", projectId]` cache reflects the new row on refetch.
 *
 * The per-project board keeps its own local dialog for column-scoped presets
 * (a column's "+", objective mode, assigned-to-me) and the `C` shortcut.
 */
export function CreateProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { projects } = useProjects();
  // Local undo history (MIN-35): creations from the global dialog record too.
  const { record } = useUndoHistory();

  // Project whose members/categories/objectives feed the open dialog. Set on the
  // first open and left in place (dialogs stay mounted for reuse).
  const [target, setTarget] = useState<string | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [issuePresets, setIssuePresets] = useState<{
    status?: IssueStatus;
    objectiveId: string | null;
    assigneeId: string | null;
  }>({ objectiveId: null, assigneeId: null });
  const [objectiveOpen, setObjectiveOpen] = useState(false);

  const { members } = useMembersQuery(target, !!target);
  const { categories } = useCategoriesQuery(target);
  const { objectives } = useObjectivesQuery(target);

  const createIssueGlobal = useCallback(
    async (projectId: string, input: CreateIssueInput) => {
      const issue = await createIssueApi(projectId, input);
      record({
        kind: "create",
        projectId,
        issueId: issue.id,
        snapshot: snapshotIssue(issue),
      });
      void queryClient.invalidateQueries({ queryKey: ["issues", projectId] });
      void queryClient.invalidateQueries({ queryKey: GLOBAL_BOARD_KEY });
      return issue;
    },
    [queryClient, record]
  );

  const createObjectiveGlobal = useCallback(
    async (projectId: string, input: CreateObjectiveInput) => {
      const objective = await createObjectiveApi(projectId, input);
      void queryClient.invalidateQueries({ queryKey: ["objectives", projectId] });
      return objective;
    },
    [queryClient]
  );

  const resolveTarget = useCallback(
    (projectId?: string) =>
      projectId ?? projectIdFromPath(pathname) ?? projects[0]?.id ?? null,
    [pathname, projects]
  );

  const openCreateIssue = useCallback(
    (opts?: OpenIssueOptions) => {
      const pid = resolveTarget(opts?.projectId);
      if (!pid) return;
      setTarget(pid);
      setIssuePresets({
        status: opts?.status,
        objectiveId: opts?.objectiveId ?? null,
        assigneeId: opts?.assigneeId ?? null,
      });
      setIssueOpen(true);
    },
    [resolveTarget]
  );

  const openCreateObjective = useCallback(
    (opts?: OpenObjectiveOptions) => {
      const pid = resolveTarget(opts?.projectId);
      if (!pid) return;
      setTarget(pid);
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
      const key = e.key.toLowerCase();
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

  return (
    <CreateContext.Provider
      value={{ openCreateIssue, openCreateObjective, canCreate: projects.length > 0 }}
    >
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
          />
          <ObjectiveDialog
            open={objectiveOpen}
            onOpenChange={setObjectiveOpen}
            members={members}
            projects={projects}
            projectId={target}
            onCreate={(input) => createObjectiveGlobal(target, input)}
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
