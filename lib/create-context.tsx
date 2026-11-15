"use client";

import { expandParam } from "@/lib/ref-registry";
import { hasVisibleOpenDialog } from "@/lib/visible-overlays";
import { primeMobileKeyboard } from "@/lib/mobile-sheet-focus";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useProjects } from "@/lib/projects-context";
import { useOfferedProject } from "@/lib/use-offered-projects";
import { capabilitiesForProject } from "@/lib/use-project-capabilities";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { useMembersQuery } from "@/lib/use-members-query";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import { useObjectivesQuery } from "@/lib/use-objectives-query";
import { createObjectiveOptimistic } from "@/lib/optimistic-objective";
import { findCachedIssue } from "@/lib/optimistic/issue-writes";
import { issueIdentifier } from "@/lib/issue-constants";
import { useIssueMutations } from "@/lib/use-issue-mutations";
import { projectIdFromPath } from "@/lib/project-id-from-path";
import {
  defaultCreateProjectId,
  lastCreateProjectId,
} from "@/lib/last-create-project";
import { eventKey } from "@/lib/keyboard/event-key";
import { matchesModShiftCombo } from "@/lib/keyboard/mod-combo";
import {
  loadCreateIssueDialog,
  loadObjectiveDialog,
  preloadSurface,
} from "@/lib/lazy-app-surfaces";
import type { IssueStatus } from "@/lib/issue-constants";
import type { CreateObjectiveInput, Objective } from "@/lib/types";

// Deferred, like the assistant panel: keeps the create dialogs (markdown editor,
// dictation, attachments) out of every route's initial bundle. Loaded the first
// time a create action fires.
const CreateIssueDialog = dynamic(
  () => loadCreateIssueDialog().then((m) => m.CreateIssueDialog),
  { ssr: false }
);
const ObjectiveDialog = dynamic(
  () => loadObjectiveDialog().then((m) => m.ObjectiveDialog),
  { ssr: false }
);

interface OpenIssueOptions {
  /** Target project; defaults to the current route's project, else the last one
   *  a ticket was created in, else the first. */
  projectId?: string;
  status?: IssueStatus;
  objectiveId?: string | null;
  assigneeId?: string | null;
  /** Prefills a "sub-issue of" relation to this issue, shown in the form. */
  parentId?: string | null;
  /** Opens the dialog with the microphone already listening (global shortcut ⌘⇧D). */
  dictate?: boolean;
  /** Reopens this saved draft of `projectId` in the form (drafts tray, MIN-753). */
  draftId?: string;
}

interface OpenObjectiveOptions {
  /** Same defaulting as {@link OpenIssueOptions.projectId}. */
  projectId?: string;
  /** Prefills the name — a quick add from an objective picker passes the text
   *  typed in its search. */
  name?: string;
  /** Called with the created objective, so the picker that opened the dialog
   *  links it to its issue. Never called for a creation in ANOTHER project
   *  (split button): that objective cannot be linked. */
  onCreated?: (objective: Objective) => void;
  /** Same as {@link OpenIssueOptions.draftId}. */
  draftId?: string;
}

interface CreateContextValue {
  openCreateIssue: (opts?: OpenIssueOptions) => void;
  openCreateObjective: (opts?: OpenObjectiveOptions) => void;
  warmCreateIssue: () => void;
  warmCreateObjective: () => void;
  /** No project → nothing to create in; drives the header actions' disabled state. */
  canCreate: boolean;
}

const CreateContext = createContext<CreateContextValue | null>(null);

/** The objective the current project board is filtered to (`?objective=`), read
 *  at call time so a quick-created issue (the `C` shortcut, the header "New
 *  issue") inherits it without threading state through every trigger. */
function activeObjectiveIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return expandParam(new URLSearchParams(window.location.search).get("objective"));
}

/**
 * App-wide issue/objective creation (MIN-33). Mounts {@link CreateIssueDialog}
 * and {@link ObjectiveDialog} once so "New ticket/objective" works from
 * anywhere — the home page, the cross-project board, the header, the mobile "+"
 * — not just inside a project. The target project defaults to the current route,
 * else the last project a ticket was created in (see {@link lastCreateProjectId}),
 * else the first; both dialogs let the user retarget via their split button.
 * Issue creation is the shared optimistic writer (lib/use-issue-mutations.ts),
 * the one both boards use.
 *
 * The per-project board keeps its own local dialog for column-scoped presets
 * (a column's "+", objective mode, assigned-to-me) and the `C` shortcut.
 */
export function CreateProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { projects: allProjects } = useProjects();
  const { user } = useAuth();
  const tAccess = useTranslations("ProjectAccess");
  // Read through a ref: creation actions must keep a stable identity.
  const tAccessRef = useRef(tAccess);
  useLayoutEffect(() => { tAccessRef.current = tAccess; }, [tAccess]);
  // Creation targets only projects the viewer can write (MIN-693): a reader's
  // projects never appear in the dialogs' project picker nor as a default.
  const userId = user?.id ?? null;
  const projects = useMemo(
    () => allProjects.filter((p) => capabilitiesForProject(p, userId).canWrite),
    [allProjects, userId]
  );
  // Hidden projects (MIN-692) are not offered (MIN-751): neither listed in the
  // pickers nor chosen as the default target, unless the project is on screen
  // or explicitly requested. Requesting one still creates there.
  const isOffered = useOfferedProject();
  const offeredProjects = useMemo(() => projects.filter((p) => isOffered(p.id)), [projects, isOffered]);
  const targetInputs = useRef({ pathname, projects, offeredProjects });
  // Creation actions resolve the committed route when invoked. Publishing a
  // new action on every navigation wakes all closed card pickers, even inside
  // an Activity-hidden board. Layout synchronization avoids abandoned renders
  // changing the target used by an event on the still-visible route.
  useLayoutEffect(() => { targetInputs.current = { pathname, projects, offeredProjects }; }, [pathname, projects, offeredProjects]);
  const allProjectsRef = useRef(allProjects);
  useLayoutEffect(() => { allProjectsRef.current = allProjects; }, [allProjects]);

  // Project whose members/categories/objectives feed each dialog. Set on the
  // first open and left in place (dialogs stay mounted for reuse). One per
  // dialog: an objective quick-added from the open issue dialog's picker must
  // not move that issue form to another project mid-edit.
  const [issueTarget, setIssueTarget] = useState<string | null>(null);
  const [objectiveTarget, setObjectiveTarget] = useState<string | null>(null);
  const [issueMounted, setIssueMounted] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  // Whether the dialog opens dictating. Reset at EVERY opening: otherwise a
  // `C` typed after a ⌘⇧D would turn the microphone back on.
  const [issueDictate, setIssueDictate] = useState(false);
  // The draft the next opening restores — reset at every opening too, so a
  // later `C` opens a blank form.
  const [issueDraftId, setIssueDraftId] = useState<string | null>(null);
  const [objectiveDraftId, setObjectiveDraftId] = useState<string | null>(null);
  const [issuePresets, setIssuePresets] = useState<{
    status?: IssueStatus;
    objectiveId: string | null;
    assigneeId: string | null;
    parentId: string | null;
  }>({ objectiveId: null, assigneeId: null, parentId: null });
  const [objectiveOpen, setObjectiveOpen] = useState(false);
  const [objectiveMounted, setObjectiveMounted] = useState(false);
  // Prefilled name and recipient of the created objective, set by a picker's
  // quick add. The callback lives in a ref: it renders nothing, and it is
  // CONSUMED on creation — a later opening (shortcut `O`, header) must not link
  // its objective to the previous issue.
  const [objectiveName, setObjectiveName] = useState<string | undefined>(undefined);
  const objectiveCreatedRef = useRef<((objective: Objective) => void) | null>(null);

  const { members: issueMembers } = useMembersQuery(issueTarget, issueMounted && !!issueTarget);
  const { members: objectiveMembers } = useMembersQuery(
    objectiveTarget,
    objectiveMounted && !!objectiveTarget
  );
  const { categories } = useCategoriesQuery(issueMounted ? issueTarget : null);
  const { objectives } = useObjectivesQuery(issueMounted ? issueTarget : null);

  // Optimistic (MIN-40): the card appears in its project's cache and on the
  // aggregate board at once, and the dialog closes without waiting for the POST.
  const { createIssue: createIssueGlobal } = useIssueMutations("global");

  // Optimistic: the objective is in the project cache and the cross-project
  // board as soon as the dialog closes (lib/optimistic-objective.ts).
  const createObjectiveGlobal = useCallback(
    async (projectId: string, input: CreateObjectiveInput) => {
      const { objective, persisted } = createObjectiveOptimistic(queryClient, projectId, input);
      // A refusal is reported by the creation itself.
      persisted.catch(() => undefined);
      return objective;
    },
    [queryClient]
  );

  /** Creation from the dialog in its target project: what a picker's quick add
   *  waits for to link the objective to its issue. The link waits for the
   *  server row, which the issue's reference requires. */
  const createObjectiveForTarget = useCallback(
    async (projectId: string, input: CreateObjectiveInput) => {
      const { objective, persisted } = createObjectiveOptimistic(queryClient, projectId, input);
      const notify = objectiveCreatedRef.current;
      objectiveCreatedRef.current = null;
      if (notify) persisted.then(notify, () => undefined);
      else persisted.catch(() => undefined);
      return objective;
    },
    [queryClient]
  );

  const resolveTarget = useCallback(
    (projectId?: string, notify = false) => {
      const { pathname: currentPath, projects: currentProjects, offeredProjects: offered } = targetInputs.current;
      const requested = projectId ?? projectIdFromPath(currentPath);
      if (requested) {
        // Only projects the list knows as read-only are refused; an unknown
        // id (list still loading) keeps the historical behavior.
        const known = allProjectsRef.current.some((p) => p.id === requested);
        if (!known || currentProjects.some((p) => p.id === requested)) return requested;
        if (notify) {
          toast.info(tAccessRef.current("readOnlyToast"), { id: "read-only-project" });
        }
        return null;
      }
      // Outside a project, prefer the last creation target when it is still
      // accessible, then fall back to the current project's display order.
      // Every writable project hidden: creating still needs a target.
      return defaultCreateProjectId(offered.length > 0 ? offered : currentProjects, lastCreateProjectId());
    },
    []
  );

  const warmCreateIssue = useCallback(() => {
    preloadSurface(loadCreateIssueDialog);
    const pid = resolveTarget();
    if (!pid) return;
    setIssueTarget(pid);
    startTransition(() => setIssueMounted(true));
  }, [resolveTarget]);
  const warmCreateObjective = useCallback(() => {
    preloadSurface(loadObjectiveDialog);
    const pid = resolveTarget();
    if (!pid) return;
    setObjectiveTarget(pid);
    startTransition(() => setObjectiveMounted(true));
  }, [resolveTarget]);

  const openCreateIssue = useCallback(
    (opts?: OpenIssueOptions) => {
      const pid = resolveTarget(opts?.projectId, true);
      if (!pid) return;
      // The sheet focuses its first field once mounted; on a phone browser
      // only the opening tap can raise the keyboard for it.
      primeMobileKeyboard(document.activeElement);
      // On an objective-filtered board (/projects/[id]?objective=X), default the
      // new issue into that objective — so `C` and the header "New issue" land it
      // there like the column "+" already does. Only when the caller left the
      // objective unset AND we're creating in that same board's project (the
      // `?objective=` param belongs to the current route).
      const objectiveId =
        opts?.objectiveId !== undefined
          ? opts.objectiveId
          : pid === projectIdFromPath(targetInputs.current.pathname)
            ? activeObjectiveIdFromUrl()
            : null;
      setIssueTarget(pid);
      setIssuePresets({
        status: opts?.status,
        objectiveId,
        assigneeId: opts?.assigneeId ?? null,
        parentId: opts?.parentId ?? null,
      });
      setIssueDictate(opts?.dictate === true);
      setIssueDraftId(opts?.draftId ?? null);
      setIssueMounted(true);
      setIssueOpen(true);
    },
    [resolveTarget]
  );

  // The pill resolves the parent from the dialog's issues; this label only
  // stands in while they load.
  const parentRelationLabel = (projectId: string, issueId: string): string => {
    const parent = findCachedIssue(queryClient, projectId, issueId);
    const key = allProjectsRef.current.find((p) => p.id === projectId)?.key;
    return parent ? `${key ? issueIdentifier(key, parent.number) : `#${parent.number}`} ${parent.title}` : "";
  };

  const openCreateObjective = useCallback(
    (opts?: OpenObjectiveOptions) => {
      const pid = resolveTarget(opts?.projectId, true);
      if (!pid) return;
      // The sheet focuses its first field once mounted; on a phone browser
      // only the opening tap can raise the keyboard for it.
      primeMobileKeyboard(document.activeElement);
      setObjectiveTarget(pid);
      setObjectiveName(opts?.name?.trim() || undefined);
      objectiveCreatedRef.current = opts?.onCreated ?? null;
      setObjectiveDraftId(opts?.draftId ?? null);
      setObjectiveMounted(true);
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
      if (hasVisibleOpenDialog()) return;
      e.preventDefault();
      if (key === "c") openCreateIssue();
      else openCreateObjective();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [projects.length, openCreateIssue, openCreateObjective]);

  // ⌘⇧D everywhere: "new issue, by voice". The dictation shortcut, extended to
  // screens with nothing to dictate into: it opens the creation form with the
  // microphone already listening.
  //
  // It never takes the shortcut from a surface that already owns it: each
  // dictation button (issue panel, Objectives page, objective dialog, feedback,
  // the creation dialog itself) listens in the CAPTURE phase and calls
  // `preventDefault`. This listener runs in the bubble phase on the window, so
  // after them, and `defaultPrevented` says a closer microphone answered.
  useEffect(() => {
    if (projects.length === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!matchesModShiftCombo(e, "d")) return;
      if (e.defaultPrevented) return;
      // An open dialog or side panel holds the keyboard (same guard as `C`
      // and `O` above): no form is stacked on it.
      if (hasVisibleOpenDialog()) return;
      e.preventDefault();
      openCreateIssue({ dictate: true });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [projects.length, openCreateIssue]);

  // Only availability changes are render state; every action reads current
  // inputs when invoked, without broadcasting route changes to card pickers.
  const canCreate = projects.length > 0;
  // The dialogs' project picker: what may be offered, plus the target itself.
  const issuePickerProjects = useMemo(
    () => projects.filter((p) => p.id === issueTarget || offeredProjects.includes(p)),
    [projects, offeredProjects, issueTarget]
  );
  const objectivePickerProjects = useMemo(
    () => projects.filter((p) => p.id === objectiveTarget || offeredProjects.includes(p)),
    [projects, offeredProjects, objectiveTarget]
  );
  const value = useMemo(
    () => ({
      openCreateIssue,
      openCreateObjective,
      warmCreateIssue,
      warmCreateObjective,
      canCreate,
    }),
    [
      openCreateIssue,
      openCreateObjective,
      warmCreateIssue,
      warmCreateObjective,
      canCreate,
    ]
  );

  return (
    <CreateContext.Provider value={value}>
      {children}
      {issueTarget && issueMounted ? (
        <CreateIssueDialog
          open={issueOpen}
          onOpenChange={setIssueOpen}
          projectId={issueTarget}
          projects={issuePickerProjects}
          members={issueMembers}
          categories={categories}
          objectives={objectives}
          onCreate={(input) => createIssueGlobal(issueTarget, input)}
          onCreateInProject={createIssueGlobal}
          initialStatus={issuePresets.status}
          initialObjectiveId={issuePresets.objectiveId}
          initialAssigneeId={issuePresets.assigneeId}
          initialSubIssueOf={issuePresets.parentId ? {
            id: issuePresets.parentId,
            label: parentRelationLabel(issueTarget, issuePresets.parentId),
          } : null}
          autoDictate={issueDictate}
          initialDraftId={issueDraftId}
        />
      ) : null}
      {objectiveTarget && objectiveMounted ? (
        <ObjectiveDialog
          open={objectiveOpen}
          onOpenChange={(next) => {
            // Closed without creating: the picker callback dies with the dialog.
            if (!next) objectiveCreatedRef.current = null;
            setObjectiveOpen(next);
          }}
          members={objectiveMembers}
          projects={objectivePickerProjects}
          projectId={objectiveTarget}
          initialName={objectiveName}
          initialDraftId={objectiveDraftId}
          onCreate={(input) => createObjectiveForTarget(objectiveTarget, input)}
          onCreateInProject={createObjectiveGlobal}
          onUpdate={async () => {}}
        />
      ) : null}
    </CreateContext.Provider>
  );
}

export function useCreate(): CreateContextValue {
  const ctx = useContext(CreateContext);
  if (!ctx) throw new Error("useCreate must be used within CreateProvider");
  return ctx;
}

/** The same context, tolerated absent: components shared with the PUBLIC
 *  boards have nobody mounting the creation dialogs, and hide what needs them. */
export function useCreateOptional(): CreateContextValue | null {
  return useContext(CreateContext);
}
