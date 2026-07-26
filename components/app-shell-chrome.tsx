"use client";

import { useCallback, useMemo, useState, type ComponentType } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { AppShell, Header, MobileNav, Spinner, cn } from "mangue-ui";
import {
  Home,
  ChevronLeft,
  Plus,
  Inbox,
  LayoutGrid,
  Target,
  CircleDotDashed,
  MessagesSquare,
  Settings,
  ListTodo,
  Keyboard,
  GitPullRequest,
  NotebookPen,
  IterationCw,
} from "lucide-react";
import { useProjects } from "@/lib/projects-context";
import { useCreate } from "@/lib/create-context";
import { useScratchpad } from "@/lib/scratchpad-context";
import { useNotifications } from "@/lib/use-notifications";
import { fetchIssuesApi } from "@/lib/issues-api";
import { useSearchIndex } from "@/lib/use-search-index";
import { mergeByProject } from "@/lib/palette-index-merge";
import { useObjectivesQuery } from "@/lib/use-objectives-query";
import { useMembersQuery } from "@/lib/use-members-query";
import { useAllPullRequestsQuery, useAgentSessionsQuery } from "@/lib/use-agent-runs";
import { useAgentReads } from "@/lib/use-agent-reads";
import { isAgentSessionUnread } from "@/lib/agent-api";
import { issueIdentifier } from "@/lib/issue-constants";
import { AppBreadcrumb } from "@/components/app-breadcrumb";
import {
  HeaderSearchPill,
  type PaletteGroup,
  type PaletteItem,
} from "@/components/header-search-pill";
import { NewMenu } from "@/components/new-menu";
import { ScratchpadTrigger } from "@/components/scratchpad/scratchpad-trigger";
import { UsageIndicator } from "@/components/usage-indicator";
import { usePlanGates } from "@/lib/use-billing-query";
import { CommandPalette } from "@/components/command-palette";
import { MobileNavActions } from "@/components/mobile-nav-actions";
import { MobileMenuFooter, useAccountActions } from "@/components/mobile-account";
import { ProjectOrb, projectOrbIcon } from "@/components/project-orb";
import { NumoIcon } from "@/components/numo-icon";
import {
  AppSidebar,
  type AppNavItem,
  type AppNavSection,
} from "@/components/app-sidebar";
import { useCheatsheet } from "@/lib/keyboard/keyboard-context";
import type {
  Project,
  SearchIndexIssue,
  SearchIndexObjective,
} from "@/lib/types";
import { projectIdFromPath } from "@/lib/project-id-from-path";

/**
 * How many rows from OTHER projects the mobile surfaces get, per data group.
 *
 * The desktop palette is virtualized (react-window mounts only visible rows),
 * so it takes the whole list. mangue-ui's MobileNav is not: its cmdk search
 * sheet and its "⋯" menu mount every item they're given, and cross-project
 * search would hand them thousands.
 */
const MOBILE_CROSS_PROJECT_ROWS = 100;

/** The project the user is in, complete (exactly what mobile had before
 *  MIN-91), plus the most recently updated rows from the other projects.
 *  `rows` arrives current-project-first, index order after (mergeByProject). */
function capForMobile<T extends { project_id: string }>(
  rows: T[],
  currentProjectId: string | null
): T[] {
  const capped: T[] = [];
  let others = 0;
  for (const r of rows) {
    if (currentProjectId && r.project_id === currentProjectId) {
      capped.push(r);
    } else if (others < MOBILE_CROSS_PROJECT_ROWS) {
      others++;
      capped.push(r);
    }
  }
  return capped.length === rows.length ? rows : capped;
}

// The objective side panel is heavy (markdown editor + activity timeline), so
// it's deferred like the create dialogs — the chunk loads the first time an
// objective is opened from the palette, not in every route's initial bundle.
const ObjectiveSidePanel = dynamic(
  () => import("@/components/objective-side-panel").then((m) => m.ObjectiveSidePanel),
  { ssr: false }
);

/** Right-aligned project tag shown on palette rows (orb + name), à la AutoKap. */
function projectChip(project: Project) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
      <ProjectOrb seed={project.id} iconUrl={project.icon_url} className="size-3.5" />
      <span className="max-w-[9rem] truncate">{project.name}</span>
    </span>
  );
}

// The palette icon slot renders `<Icon className="size-4 …" />` with no way to
// pass a color, so we hand it a per-color component (the objective's dot, like
// on the objectives page). Cache by color to keep component identity stable
// across renders — otherwise the dot remounts (mirrors projectOrbIcon).
const objectiveDotCache = new Map<string, ComponentType<{ className?: string }>>();

function objectiveDotIcon(color: string | null): ComponentType<{ className?: string }> {
  const key = color ?? "none";
  const cached = objectiveDotCache.get(key);
  if (cached) return cached;
  const Icon = ({ className }: { className?: string }) => (
    <span className={cn("flex items-center justify-center", className)} aria-hidden>
      <span
        className="size-2.5 rounded-full"
        style={{ backgroundColor: color ?? "var(--muted-foreground)" }}
      />
    </span>
  );
  Icon.displayName = `ObjectiveDotIcon(${key})`;
  objectiveDotCache.set(key, Icon);
  return Icon;
}

/** Visage de Numo en icône statique de nav/palette (pas de clignement perpétuel,
    comme les icônes de liste). Slotté là où les tabs lucide passent un `className`. */
const NumoNavIcon = ({ className }: { className?: string }) => (
  <NumoIcon animated={false} className={className} />
);
NumoNavIcon.displayName = "NumoNavIcon";

/** Muted monospace identifier badge, e.g. "MIND-42". */
function identifierBadge(id: string) {
  return (
    <span className="font-mono text-[0.7rem] font-medium tabular-nums text-muted-foreground/70">
      {id}
    </span>
  );
}

export function AppShellChrome({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Nav");
  const ti = useTranslations("Issue");
  const tk = useTranslations("Keyboard");
  const tScratch = useTranslations("Scratchpad");
  const tBilling = useTranslations("Billing");
  const { agentsAllowed, projectLimitReached } = usePlanGates();
  const pathname = usePathname();
  const router = useRouter();
  const { projects, openCreateProject } = useProjects();
  const { openCreateIssue, openCreateObjective } = useCreate();
  const { open: openScratchpad } = useScratchpad();
  const { unreadCount } = useNotifications();
  const { setOpen: setCheatsheetOpen } = useCheatsheet();

  // Command palette open state — shared by the header search pill and the
  // global shortcuts (⌘K / ⌘P / F, handled inside <CommandPalette>).
  const [paletteOpen, setPaletteOpen] = useState(false);

  const currentProjectId = projectIdFromPath(pathname);
  const currentProject = projects.find((p) => p.id === currentProjectId) ?? null;
  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects]
  );
  const isInbox = pathname.startsWith("/inbox");
  // Cross-project (Home-level) boards (MIN-29).
  const isMyGlobal = pathname === "/my";
  const isAllGlobal = pathname === "/all";

  // Shares the ["issues", projectId] cache with the board (no extra realtime
  // bridge). Since MIN-91 the palette lists every project's tickets from the
  // search index — this cache is what makes the CURRENT project's rows exact
  // (realtime-fresh) rather than as-of-the-snapshot.
  const { data: projectIssues } = useQuery({
    queryKey: ["issues", currentProjectId ?? ""],
    queryFn: () => fetchIssuesApi(currentProjectId as string),
    enabled: !!currentProjectId,
  });

  // Objectives feed both the palette list and the in-place side panel below.
  // useObjectivesQuery shares the ["objectives", projectId] cache (kept fresh by
  // realtime) and hands us the update/delete mutations the panel needs.
  const {
    objectives: projectObjectives,
    loading: objectivesLoading,
    updateObjective,
    deleteObjective,
  } = useObjectivesQuery(currentProjectId);
  const { members: projectMembers } = useMembersQuery(
    currentProjectId,
    !!currentProjectId
  );

  // Cross-project search (MIN-91): every ticket and objective of every project,
  // so ⌘K finds them from any page. Loaded once per tab on browser idle (or on
  // the first palette open), then merged with the current project's fresher
  // caches below.
  const {
    index: searchIndex,
    armNow: armSearchIndex,
    refreshIfStale: refreshSearchIndex,
  } = useSearchIndex();

  const paletteIssues = useMemo<SearchIndexIssue[]>(
    () =>
      mergeByProject(searchIndex?.issues ?? [], currentProjectId, projectIssues),
    [searchIndex, currentProjectId, projectIssues]
  );
  const paletteObjectives = useMemo<SearchIndexObjective[]>(
    () =>
      mergeByProject(
        searchIndex?.objectives ?? [],
        currentProjectId,
        // An empty array means "this project has none" — but it also means "not
        // loaded yet", and replacing the index's rows with that would blink the
        // current project's objectives out of the list. Keep the index until the
        // real answer lands.
        objectivesLoading ? null : projectObjectives
      ),
    [searchIndex, currentProjectId, projectObjectives, objectivesLoading]
  );

  // Objective whose side panel is open, driven by the palette. Opening it here
  // (rather than navigating to /objectives?open=) keeps the user on the current
  // page — the panel just slides over it. `panelMounted` latches on first open
  // so the deferred chunk loads lazily yet the slide-out animation still plays.
  const [panelObjectiveId, setPanelObjectiveId] = useState<string | null>(null);
  const [panelMounted, setPanelMounted] = useState(false);
  const panelObjective = panelObjectiveId
    ? projectObjectives.find((o) => o.id === panelObjectiveId) ?? null
    : null;

  // Triage is a hidden issue status — the sidebar counter derives from the
  // same issues cache the board and search already keep fresh.
  const triageCount = (projectIssues ?? []).filter((i) => i.status === "triage").length;

  // Feedback (MIN-37) : compteur des retours ouverts/prévus, via un endpoint
  // léger (le badge n'a pas besoin de la liste complète).
  const { data: feedbackCountData } = useQuery({
    queryKey: ["feedback-count", currentProjectId ?? ""],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${currentProjectId}/feedback/counts`);
      if (!r.ok) return { count: 0 };
      return (await r.json()) as { count: number };
    },
    enabled: !!currentProjectId,
    staleTime: 60_000,
  });
  const feedbackCount = feedbackCountData?.count ?? 0;

  // Pull Requests (MIN-66) : compteur des PR ouvertes de Numo. La liste est
  // globale (l'onglet pointe vers /pull-requests), donc on dérive le compte de
  // la même query que la page — même « ouverte » que son filtre : open, draft,
  // ou état pas encore synchronisé.
  const { pullRequests } = useAllPullRequestsQuery();
  const openPrCount = pullRequests.filter(
    (p) => p.pr_state === "open" || p.pr_state === "draft" || p.pr_state == null
  ).length;

  // Agents : un spinner sur l'onglet dès qu'une session TRAVAILLE (génération en
  // cours), tous projets confondus ; sinon une bulle bleue si au moins une session a
  // TERMINÉ sans avoir été consultée (le travail en cours prime sur le non-lu).
  const { sessions: agentSessions } = useAgentSessionsQuery();
  const { reads: agentReads } = useAgentReads();
  const anyAgentWorking = agentSessions.some((s) => s.working);
  const anyAgentUnread = agentSessions.some((s) => isAgentSessionUnread(s, agentReads));
  // Une session attend une réponse (ask_user) et n'est pas lue → point JAUNE
  // prioritaire sur le bleu « terminé, non lu ».
  const anyAgentAwaiting = agentSessions.some(
    (s) => s.awaitingInput && isAgentSessionUnread(s, agentReads),
  );

  const commandGroups = useMemo<PaletteGroup[]>(() => {
    const groups: PaletteGroup[] = [];
    const createKw = ["create", "créer", "new", "nouveau"];

    // ── Create (issue-first) ──────────────────────────────────────────
    // New issue is always the leading option. Inside a project it targets that
    // project; from anywhere else you pick which project to create it in.
    const createItems: PaletteItem[] = [];
    if (currentProject) {
      createItems.push({
        key: "create-issue",
        label: t("newIssue"),
        icon: ListTodo,
        keywords: [...createKw, ti("entity"), currentProject.name, currentProject.key],
        meta: projectChip(currentProject),
        metaText: currentProject.name,
        onSelect: () => openCreateIssue({ projectId: currentProject.id }),
      });
      createItems.push({
        key: "create-objective",
        label: t("newObjective"),
        icon: Target,
        keywords: [...createKw, currentProject.name, currentProject.key],
        meta: projectChip(currentProject),
        metaText: currentProject.name,
        onSelect: () => openCreateObjective({ projectId: currentProject.id }),
      });
    } else {
      for (const p of projects) {
        createItems.push({
          key: `create-issue-${p.id}`,
          label: t("newIssue"),
          icon: ListTodo,
          keywords: [...createKw, ti("entity"), p.name, p.key],
          meta: projectChip(p),
          metaText: p.name,
          onSelect: () => openCreateIssue({ projectId: p.id }),
        });
      }
      // Objective creation from anywhere (MIN-33): one entry — the dialog's split
      // button picks the target project.
      if (projects.length > 0) {
        createItems.push({
          key: "create-objective",
          label: t("newObjective"),
          icon: Target,
          keywords: createKw,
          onSelect: () => openCreateObjective(),
        });
      }
    }
    if (!projectLimitReached) {
      createItems.push({
        key: "create-project",
        label: t("newProject"),
        icon: Plus,
        keywords: createKw,
        onSelect: openCreateProject,
      });
    }
    groups.push({ key: "create", heading: t("create"), items: createItems });

    // ── Go to (global) ────────────────────────────────────────────────
    groups.push({
      key: "goto",
      heading: t("goTo"),
      items: [
        { key: "go-home", label: t("home"), icon: Home, onSelect: () => router.push("/home") },
        { key: "go-inbox", label: t("inbox"), icon: Inbox, onSelect: () => router.push("/inbox") },
        {
          key: "open-notes",
          label: tScratch("open"),
          icon: NotebookPen,
          keywords: ["notes", "scratchpad", "todo", "tâches", "problems"],
          onSelect: openScratchpad,
        },
        ...(agentsAllowed
          ? [
              {
                key: "go-pull-requests",
                label: t("pullRequests"),
                icon: GitPullRequest,
                onSelect: () => router.push("/pull-requests"),
              },
              {
                key: "go-agents",
                label: t("agents"),
                icon: NumoNavIcon,
                onSelect: () => router.push("/agents"),
              },
            ]
          : []),
        {
          key: "go-all-global",
          label: t("allIssues"),
          icon: LayoutGrid,
          onSelect: () => router.push("/all"),
        },
        {
          // Le cycle est personnel et cross-projet : il vit sur /all en mode
          // cycle (MIN-32), jamais scopé à un projet — même destination que
          // l'onglet ↗ des boards et la carte de la home.
          key: "go-cycle",
          label: t("cycle"),
          icon: IterationCw,
          keywords: [
            "cycle",
            "sprint",
            "semaine",
            "week",
            "quinzaine",
            "fortnight",
            "itération",
            "iteration",
          ],
          onSelect: () => router.push("/all?view=cycle"),
        },
        {
          key: "go-account-settings",
          label: t("accountSettings"),
          icon: Settings,
          onSelect: () => router.push("/settings"),
        },
        {
          key: "keyboard-shortcuts",
          label: tk("shortcutsTitle"),
          icon: Keyboard,
          keywords: ["keyboard", "shortcuts", "raccourcis", "clavier", "cheatsheet", "help", "aide"],
          onSelect: () => setCheatsheetOpen(true),
        },
      ],
    });

    if (projects.length > 0) {
      // ── Projects (quick switch) ─────────────────────────────────────
      groups.push({
        key: "projects",
        heading: t("projects"),
        items: projects.map((p) => ({
          key: `project-${p.id}`,
          label: p.name,
          icon: projectOrbIcon(p.id, p.icon_url),
          keywords: [p.key],
          contextId: p.id,
          onSelect: () => router.push(`/projects/${p.id}`),
        })),
      });

      // ── Pages (per-project navigation) ──────────────────────────────
      const pageItems: PaletteItem[] = [];
      for (const p of projects) {
        const base = `/projects/${p.id}`;
        const chip = projectChip(p);
        const metaText = p.name;
        const kw = [p.name, p.key];
        // contextId: with several projects the same five page names repeat, so
        // the current project's copies are the ones that should rank first.
        const contextId = p.id;
        pageItems.push(
          {
            key: `pg-tickets-${p.id}`,
            label: t("tickets"),
            icon: LayoutGrid,
            keywords: kw,
            meta: chip,
            metaText,
            contextId,
            onSelect: () => router.push(base),
          },
          {
            key: `pg-obj-${p.id}`,
            label: t("objectives"),
            icon: Target,
            keywords: kw,
            meta: chip,
            metaText,
            contextId,
            onSelect: () => router.push(`${base}/objectives`),
          },
          {
            key: `pg-triage-${p.id}`,
            label: t("triage"),
            icon: CircleDotDashed,
            keywords: kw,
            meta: chip,
            metaText,
            contextId,
            onSelect: () => router.push(`${base}/triage`),
          },
          {
            key: `pg-feedback-${p.id}`,
            label: t("feedback"),
            icon: MessagesSquare,
            keywords: kw,
            meta: chip,
            metaText,
            contextId,
            onSelect: () => router.push(`${base}/feedback`),
          },
          {
            key: `pg-set-${p.id}`,
            label: t("projectSettings"),
            icon: Settings,
            keywords: kw,
            meta: chip,
            metaText,
            contextId,
            onSelect: () => router.push(`${base}/settings`),
          },
        );
      }
      groups.push({ key: "pages", heading: t("pages"), items: pageItems });
    }

    return groups;
  }, [projects, currentProject, router, openCreateProject, openCreateIssue, openCreateObjective, openScratchpad, agentsAllowed, projectLimitReached, t, ti, tk, tScratch, setCheatsheetOpen]);

  // ── Data groups: tickets + objectifs, tous projets confondus (MIN-91) ────
  // Séparés des groupes de commandes ci-dessus parce qu'ils sont les seuls à
  // peser : quelques milliers de lignes, chacune avec ses éléments React
  // (badge d'identifiant, puce de projet). On les fabrique donc à la demande,
  // avec deux budgets — liste complète pour la palette desktop (virtualisée,
  // et qui ne rend rien tant qu'elle est fermée), liste plafonnée pour le nav
  // mobile (qui monte tout ce qu'on lui donne).
  const buildDataGroups = useCallback(
    (
      issues: SearchIndexIssue[],
      objectives: SearchIndexObjective[]
    ): PaletteGroup[] => {
      const groups: PaletteGroup[] = [];

      // L'identifiant porte la clé du projet (MIN-42 vs AKP-7), donc une ligne
      // dit d'où elle vient ; `contextId` fait remonter le projet courant.
      if (issues.length > 0) {
        groups.push({
          key: "issues",
          heading: ti("entityPlural"),
          items: issues.flatMap((i) => {
            const project = projectById.get(i.project_id);
            // Projet inconnu (supprimé, ou quitté) → rien pour étiqueter ni
            // router le ticket : on l'écarte plutôt que d'afficher « -12 ».
            if (!project) return [];
            const id = issueIdentifier(project.key, i.number);
            return [
              {
                key: `issue-${i.id}`,
                label: i.title,
                keywords: [id, String(i.number), project.name, project.key],
                meta: identifierBadge(id),
                metaText: id,
                entityType: "issue",
                contextId: i.project_id,
                data: i,
                onSelect: () => router.push(`/projects/${i.project_id}?issue=${i.id}`),
              },
            ];
          }),
        });
      }

      // Un objectif du projet courant ouvre son panneau latéral en place —
      // l'utilisateur reste sur sa page (ObjectiveSidePanel est monté plus bas
      // et ne porte que les données du projet courant). Un objectif d'ailleurs
      // navigue vers la page objectifs de SON projet, sur le deep-link des
      // notifications.
      if (objectives.length > 0) {
        groups.push({
          key: "objectives",
          heading: t("objectives"),
          items: objectives.flatMap((o) => {
            const project = projectById.get(o.project_id);
            if (!project) return [];
            return [
              {
                key: `objective-${o.id}`,
                label: o.name,
                icon: objectiveDotIcon(o.color),
                keywords: [project.name, project.key],
                meta: projectChip(project),
                metaText: project.name,
                contextId: o.project_id,
                onSelect: () => {
                  if (o.project_id === currentProjectId) {
                    setPanelObjectiveId(o.id);
                    setPanelMounted(true);
                    return;
                  }
                  router.push(`/projects/${o.project_id}/objectives?open=${o.id}`);
                },
              },
            ];
          }),
        });
      }

      return groups;
    },
    [projectById, currentProjectId, router, t, ti]
  );

  // Desktop: the full list, built only while the palette is open — closed, it
  // renders nothing, so building thousands of rows on every shell re-render
  // (notification polls, agent sessions…) would be pure waste.
  const desktopDataGroups = useMemo(
    () => (paletteOpen ? buildDataGroups(paletteIssues, paletteObjectives) : []),
    [paletteOpen, buildDataGroups, paletteIssues, paletteObjectives]
  );

  // Mobile: bounded, always ready (MobileNav's search sheet opens on its own).
  const mobileDataGroups = useMemo(
    () =>
      buildDataGroups(
        capForMobile(paletteIssues, currentProjectId),
        capForMobile(paletteObjectives, currentProjectId)
      ),
    [buildDataGroups, paletteIssues, paletteObjectives, currentProjectId]
  );

  const inboxItem: AppNavItem = {
    key: "inbox",
    label: t("inbox"),
    icon: Inbox,
    href: "/inbox",
    active: isInbox,
    shortcut: "I",
    badge:
      unreadCount > 0 ? (
        <span className="flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : undefined,
  };

  // Verrous de plan (MIN-72) : Agents & Pull Requests restent visibles mais
  // grisés quand le plan ne les inclut pas ; « Nouveau projet » se grise au
  // plafond. Partagés par les deux modes de la sidebar (projet / home).
  const pullRequestsItem: AppNavItem = {
    key: "pull-requests",
    label: t("pullRequests"),
    icon: GitPullRequest,
    href: "/pull-requests",
    active: pathname.startsWith("/pull-requests"),
    shortcut: "R",
    disabled: !agentsAllowed,
    tooltip: agentsAllowed ? undefined : tBilling("agentsGateTitle"),
    badge:
      agentsAllowed && openPrCount > 0 ? (
        <span className="text-xs tabular-nums text-muted-foreground">
          {openPrCount}
        </span>
      ) : undefined,
  };
  const agentsItem: AppNavItem = {
    key: "agents",
    label: t("agents"),
    icon: NumoNavIcon,
    href: "/agents",
    active: pathname.startsWith("/agents"),
    shortcut: "J",
    showBadgeCollapsed: true,
    disabled: !agentsAllowed,
    tooltip: agentsAllowed ? undefined : tBilling("agentsGateTitle"),
    badge:
      agentsAllowed && anyAgentWorking ? (
        <Spinner className="size-3.5 text-muted-foreground" />
      ) : agentsAllowed && anyAgentAwaiting ? (
        // Une session attend une réponse de l'utilisateur → point JAUNE.
        <span
          className="size-2 rounded-full bg-yellow-500"
          aria-label={t("agentsAwaiting")}
        />
      ) : agentsAllowed && anyAgentUnread ? (
        <span
          className="size-2 rounded-full bg-blue-500"
          aria-label={t("agentsUnread")}
        />
      ) : undefined,
  };

  const sections = useMemo<AppNavSection[]>(() => {
    if (currentProject) {
      const base = `/projects/${currentProject.id}`;
      return [
        {
          items: [
            inboxItem,
            pullRequestsItem,
            agentsItem,
            {
              key: "home-back",
              label: t("home"),
              icon: ChevronLeft,
              href: "/home",
              shortcut: "H",
            },
          ],
        },
        {
          items: [
            {
              key: "tickets",
              label: t("tickets"),
              icon: LayoutGrid,
              href: base,
              active: pathname === base,
              shortcut: "B",
            },
            {
              key: "objectives",
              label: t("objectives"),
              icon: Target,
              href: `${base}/objectives`,
              active: pathname.startsWith(`${base}/objectives`),
              shortcut: "O",
            },
            {
              key: "triage",
              label: t("triage"),
              icon: CircleDotDashed,
              href: `${base}/triage`,
              active: pathname.startsWith(`${base}/triage`),
              shortcut: "T",
              badge:
                triageCount > 0 ? (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {triageCount}
                  </span>
                ) : undefined,
            },
            {
              key: "feedback",
              label: t("feedback"),
              icon: MessagesSquare,
              href: `${base}/feedback`,
              active: pathname.startsWith(`${base}/feedback`),
              shortcut: "F",
              badge:
                feedbackCount > 0 ? (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {feedbackCount}
                  </span>
                ) : undefined,
            },
            {
              key: "settings",
              label: t("projectSettings"),
              icon: Settings,
              href: `${base}/settings`,
              active: pathname.startsWith(`${base}/settings`),
              shortcut: "S",
            },
          ],
        },
      ];
    }
    return [
      {
        items: [
          inboxItem,
          pullRequestsItem,
          agentsItem,
          {
            key: "home",
            label: t("home"),
            icon: Home,
            href: "/home",
            active: pathname.startsWith("/home"),
            shortcut: "H",
          },
          {
            key: "all-global",
            label: t("allIssues"),
            icon: LayoutGrid,
            href: "/all",
            active: pathname === "/all",
            shortcut: "B",
          },
        ],
      },
      {
        items: [
          ...projects.map((p) => ({
            key: `project-${p.id}`,
            label: p.name,
            icon: projectOrbIcon(p.id, p.icon_url),
            href: `/projects/${p.id}`,
          })),
          {
            key: "new-project",
            label: t("newProject"),
            icon: Plus,
            onClick: openCreateProject,
            disabled: projectLimitReached,
            tooltip: projectLimitReached
              ? tBilling("projectLimitTooltip")
              : undefined,
          },
        ],
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject, pathname, projects, unreadCount, triageCount, feedbackCount, openPrCount, anyAgentWorking, anyAgentUnread, openCreateProject, agentsAllowed, projectLimitReached, t]);

  // Drives the sidebar's home ↔ project swap animation (stable within a project).
  const modeKey = currentProject ? `project-${currentProject.id}` : "home";

  // Account/global options (statistics, feedback, theme, sign out). On desktop
  // they live in the sidebar footer; on mobile they move into the menu sheet +
  // command palette from a single source so both stay in sync.
  const { menuSections: accountSections, commandGroup: accountCommandGroup } =
    useAccountActions();

  // Palette = commandes + données + compte (used by the desktop pill too). The
  // mobile menu sheet gains the account sections so it fully replaces the
  // sidebar, and takes the capped data groups.
  const paletteGroups = useMemo(
    () => [...commandGroups, ...desktopDataGroups, accountCommandGroup],
    [commandGroups, desktopDataGroups, accountCommandGroup]
  );
  const mobilePaletteGroups = useMemo(
    () => [...commandGroups, ...mobileDataGroups, accountCommandGroup],
    [commandGroups, mobileDataGroups, accountCommandGroup]
  );

  const mobileMenuSections = useMemo(
    () => [...sections, ...accountSections],
    [sections, accountSections]
  );

  // Opening the palette arms the cross-project index if idle hasn't yet, and
  // revalidates it when the snapshot has aged (no-op while fresh).
  const handlePaletteOpenChange = useCallback(
    (next: boolean) => {
      setPaletteOpen(next);
      if (!next) return;
      armSearchIndex();
      refreshSearchIndex();
    },
    [armSearchIndex, refreshSearchIndex]
  );

  return (
    <AppShell
      sidebar={<AppSidebar sections={sections} modeKey={modeKey} />}
      header={
        <Header
          className="bg-sidebar backdrop-blur-none"
          left={<AppBreadcrumb />}
          right={
            // Desktop only — on mobile, Search moves to the navbar Search button
            // and "Nouveau" to the navbar "+", so the header collapses to the
            // two-stage breadcrumb (AppBreadcrumb handles its own mobile layout).
            <div className="hidden items-center gap-2 desktop:flex">
              <UsageIndicator />
              <ScratchpadTrigger />
              <HeaderSearchPill onOpen={() => handlePaletteOpenChange(true)} />
              <NewMenu />
            </div>
          }
        />
      }
      mobileNav={
        <MobileNav
          sections={mobileMenuSections}
          commandGroups={mobilePaletteGroups}
          actions={<MobileNavActions />}
          menuFooter={<MobileMenuFooter />}
          linkComponent={Link}
          searchPlaceholder={t("searchPlaceholder")}
          emptyMessage={t("noResults")}
        />
      }
    >
      {children}
      {/* Command palette (⌘K / ⌘P / F, header search pill) — mêmes groupes que
          la recherche du nav mobile, tickets enrichis d'actions (⌘;). L'index
          cross-projet sert aussi ces actions : membres et catégories du projet
          DU TICKET, qui n'est pas forcément celui de la page (MIN-91). */}
      <CommandPalette
        groups={paletteGroups}
        open={paletteOpen}
        onOpenChange={handlePaletteOpenChange}
        searchIndex={searchIndex}
      />
      {/* Objective side panel opened from the command palette — overlays the
          current page (Radix portals to body, so placement here is layout-safe). */}
      {currentProject && panelMounted && (
        <ObjectiveSidePanel
          objective={panelObjective}
          open={!!panelObjective}
          onOpenChange={(next) => {
            if (!next) setPanelObjectiveId(null);
          }}
          projectId={currentProject.id}
          members={projectMembers}
          issues={projectIssues ?? []}
          onUpdate={updateObjective}
          onDelete={deleteObjective}
        />
      )}
    </AppShell>
  );
}
