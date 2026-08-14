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
  /** Ouvre le dialog micro déjà ouvert (raccourci global ⌘⇧D). */
  dictate?: boolean;
}

interface OpenObjectiveOptions {
  /** Same defaulting as {@link OpenIssueOptions.projectId}. */
  projectId?: string;
  /** Préremplit le nom — l'ajout rapide depuis un picker d'objectif y passe le
   *  texte tapé dans la recherche. */
  name?: string;
  /** Rappelé avec l'objectif créé, pour que le picker qui a ouvert le dialog le
   *  lie à son ticket. Jamais rappelé pour une création dans un AUTRE projet
   *  (bouton scindé) : l'objectif n'y est pas liable. */
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
 * and {@link ObjectiveDialog} once so "Nouveau ticket/objectif" works from
 * anywhere — the home page, the cross-project board, the header, the mobile "+"
 * — not just inside a project. The target project defaults to the current route,
 * else the last project a ticket was created in (see {@link lastCreateProjectId}),
 * else the first; both dialogs let the user retarget via their split button.
 * La création de ticket est optimiste et passe par le registre d'écritures en
 * attente + les helpers de cache partagés (MIN-156), comme `createIssue` des
 * deux hooks de board.
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
  // Le dialog s'ouvre-t-il en dictée ? Reposé à CHAQUE ouverture, jamais
  // laissé traîner : sinon un `C` tapé après un ⌘⇧D rallumerait le micro.
  const [issueDictate, setIssueDictate] = useState(false);
  const [issuePresets, setIssuePresets] = useState<{
    status?: IssueStatus;
    objectiveId: string | null;
    assigneeId: string | null;
  }>({ objectiveId: null, assigneeId: null });
  const [objectiveOpen, setObjectiveOpen] = useState(false);
  // Nom prérempli + destinataire de l'objectif créé, posés par l'ajout rapide
  // d'un picker. Le rappel vit dans une ref : il ne redessine rien, et il est
  // CONSOMMÉ à la création — une ouverture suivante (raccourci `O`, en-tête) ne
  // doit pas relier son objectif au ticket d'avant.
  const [objectiveName, setObjectiveName] = useState<string | undefined>(undefined);
  const objectiveCreatedRef = useRef<((objective: Objective) => void) | null>(null);

  const { members } = useMembersQuery(target, !!target);
  const { categories } = useCategoriesQuery(target);
  const { objectives } = useObjectivesQuery(target);

  // Optimistic (MIN-40) : la carte apparaît dans le cache du projet ET le board
  // agrégé dès l'ouverture, le dialog se ferme sans attendre le POST ; réconcilié
  // au succès, retiré + toast à l'échec. Le realtime propage aux autres clients.
  const createIssueGlobal = useCallback(
    async (projectId: string, input: CreateIssueInput) => {
      // Smart-fill (MIN-260) : le serveur remplit le ticket AVANT d'insérer la
      // ligne, donc pas de carte optimiste — elle serait vide le temps du
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
      // Inscrite au registre AVANT le patch (MIN-156) : une réponse de GET
      // partie plus tôt ne peut plus faire disparaître la carte à peine créée.
      const handle = issueWrites.begin({ kind: "insert", row: optimistic });
      insertIssueEverywhere(queryClient, projectId, optimistic);
      // La carte nomme sa ligne : l'écho temps réel de notre création est
      // reconnu, pas adopté à côté d'elle (lib/optimistic-issue.ts).
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
      // Posé dans les deux caches qui le lisent (cache du projet + board
      // cross-projet) avant d'invalider : un ticket lié à cet objectif dans la
      // foulée affiche son nom et sa couleur tout de suite.
      insertObjectiveEverywhere(queryClient, projectId, objective);
      void queryClient.invalidateQueries({ queryKey: ["objectives", projectId] });
      return objective;
    },
    [queryClient]
  );

  /** Création depuis le dialog, dans le projet visé : c'est celle que l'ajout
   *  rapide d'un picker attend pour lier l'objectif à son ticket. */
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
      // Hors projet (accueil, board agrégé, palette) : le dernier projet où un
      // ticket a été créé, pas le premier de la liste — celui-ci n'est qu'un
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

  // ⌘⇧D partout : « nouveau ticket, à la voix ». C'est le raccourci de dictée,
  // étendu aux écrans qui n'avaient rien à dicter — au lieu de ne rien faire,
  // il ouvre le formulaire de création avec le micro déjà ouvert.
  //
  // Il ne PREND jamais la combinaison à qui la porte déjà : chaque bouton de
  // dictée (panneau du ticket, page Objectifs, dialog d'objectif, retour,
  // dialog de création lui-même) l'écoute en phase de CAPTURE et fait
  // `preventDefault`. Ce listener-ci est en phase de bulle, sur la fenêtre :
  // il passe donc APRÈS eux, et `defaultPrevented` lui dit qu'un micro plus
  // proche a répondu. Rien à recenser, rien à tenir à jour.
  useEffect(() => {
    if (projects.length === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!matchesModShiftCombo(e, "d")) return;
      if (e.defaultPrevented) return;
      // Un dialog / panneau latéral ouvert tient le clavier (même garde que
      // `C` et `O` juste au-dessus) : on ne lui empile pas un formulaire.
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      e.preventDefault();
      openCreateIssue({ dictate: true });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [projects.length, openCreateIssue]);

  // Value mémoïsée (MIN-315) : ce provider est traversé par la cascade qui part
  // d'`AuthProvider`, et ses consommateurs descendent jusqu'aux cartes du board.
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
              // Fermé sans créer : le rappel du picker meurt avec le dialog.
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

/** Même contexte, mais toléré absent : les composants partagés avec le board
 *  PUBLIC (les cartes) n'ont personne pour monter les dialogs de création, et
 *  cachent simplement ce qui en dépend. */
export function useCreateOptional(): CreateContextValue | null {
  return useContext(CreateContext);
}
