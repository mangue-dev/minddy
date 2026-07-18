"use client";

import { useMemo, useState, type ComponentType } from "react";
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
} from "lucide-react";
import { useProjects } from "@/lib/projects-context";
import { useCreate } from "@/lib/create-context";
import { useScratchpad } from "@/lib/scratchpad-context";
import { useNotifications } from "@/lib/use-notifications";
import { fetchIssuesApi } from "@/lib/issues-api";
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
import type { Project } from "@/lib/types";
import { projectIdFromPath } from "@/lib/project-id-from-path";

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
  const isInbox = pathname.startsWith("/inbox");
  // Cross-project (Home-level) boards (MIN-29).
  const isMyGlobal = pathname === "/my";
  const isAllGlobal = pathname === "/all";

  // Shares the ["issues", projectId] cache with the board (no extra realtime
  // bridge) so search can list the current project's issues.
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
    updateObjective,
    deleteObjective,
  } = useObjectivesQuery(currentProjectId);
  const { members: projectMembers } = useMembersQuery(
    currentProjectId,
    !!currentProjectId
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
    createItems.push({
      key: "create-project",
      label: t("newProject"),
      icon: Plus,
      keywords: createKw,
      onSelect: openCreateProject,
    });
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
        {
          key: "go-all-global",
          label: t("allIssues"),
          icon: LayoutGrid,
          onSelect: () => router.push("/all"),
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
        pageItems.push(
          {
            key: `pg-tickets-${p.id}`,
            label: t("tickets"),
            icon: LayoutGrid,
            keywords: kw,
            meta: chip,
            metaText,
            onSelect: () => router.push(base),
          },
          {
            key: `pg-obj-${p.id}`,
            label: t("objectives"),
            icon: Target,
            keywords: kw,
            meta: chip,
            metaText,
            onSelect: () => router.push(`${base}/objectives`),
          },
          {
            key: `pg-triage-${p.id}`,
            label: t("triage"),
            icon: CircleDotDashed,
            keywords: kw,
            meta: chip,
            metaText,
            onSelect: () => router.push(`${base}/triage`),
          },
          {
            key: `pg-feedback-${p.id}`,
            label: t("feedback"),
            icon: MessagesSquare,
            keywords: kw,
            meta: chip,
            metaText,
            onSelect: () => router.push(`${base}/feedback`),
          },
          {
            key: `pg-set-${p.id}`,
            label: t("projectSettings"),
            icon: Settings,
            keywords: kw,
            meta: chip,
            metaText,
            onSelect: () => router.push(`${base}/settings`),
          },
        );
      }
      groups.push({ key: "pages", heading: t("pages"), items: pageItems });
    }

    // ── Issues (current project, tagged with identifier) ──────────────
    if (currentProject && projectIssues && projectIssues.length > 0) {
      groups.push({
        key: "issues",
        heading: ti("entityPlural"),
        items: projectIssues.map((i) => {
          const id = issueIdentifier(currentProject.key, i.number);
          return {
            key: `issue-${i.id}`,
            label: i.title,
            keywords: [id, String(i.number)],
            meta: identifierBadge(id),
            metaText: id,
            entityType: "issue",
            data: i,
            onSelect: () => router.push(`/projects/${currentProject.id}?issue=${i.id}`),
          };
        }),
      });
    }

    // ── Objectives (current project) ──────────────────────────────────
    // Selecting one opens its side panel in place — no navigation, the user
    // stays on the current page (see ObjectiveSidePanel mounted below).
    if (currentProject && projectObjectives.length > 0) {
      groups.push({
        key: "objectives",
        heading: t("objectives"),
        items: projectObjectives.map((o) => ({
          key: `objective-${o.id}`,
          label: o.name,
          icon: objectiveDotIcon(o.color),
          onSelect: () => {
            setPanelObjectiveId(o.id);
            setPanelMounted(true);
          },
        })),
      });
    }

    return groups;
  }, [projects, currentProject, projectIssues, projectObjectives, router, openCreateProject, openCreateIssue, openCreateObjective, openScratchpad, t, ti, tk, tScratch, setCheatsheetOpen]);

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
          {unreadCount}
        </span>
      ) : undefined,
  };

  const sections = useMemo<AppNavSection[]>(() => {
    if (currentProject) {
      const base = `/projects/${currentProject.id}`;
      return [
        {
          items: [
            inboxItem,
            {
              key: "pull-requests",
              label: t("pullRequests"),
              icon: GitPullRequest,
              href: "/pull-requests",
              active: pathname.startsWith("/pull-requests"),
              shortcut: "R",
              badge:
                openPrCount > 0 ? (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {openPrCount}
                  </span>
                ) : undefined,
            },
            {
              key: "agents",
              label: t("agents"),
              icon: NumoNavIcon,
              href: "/agents",
              active: pathname.startsWith("/agents"),
              showBadgeCollapsed: true,
              badge: anyAgentWorking ? (
                <Spinner className="size-3.5 text-muted-foreground" />
              ) : anyAgentUnread ? (
                <span
                  className="size-2 rounded-full bg-blue-500"
                  aria-label={t("agentsUnread")}
                />
              ) : undefined,
            },
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
          {
            key: "pull-requests",
            label: t("pullRequests"),
            icon: GitPullRequest,
            href: "/pull-requests",
            active: pathname.startsWith("/pull-requests"),
            shortcut: "R",
            badge:
              openPrCount > 0 ? (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {openPrCount}
                </span>
              ) : undefined,
          },
          {
            key: "agents",
            label: t("agents"),
            icon: NumoNavIcon,
            href: "/agents",
            active: pathname.startsWith("/agents"),
            showBadgeCollapsed: true,
            badge: anyAgentWorking ? (
              <Spinner className="size-3.5 text-muted-foreground" />
            ) : anyAgentUnread ? (
              <span
                className="size-2 rounded-full bg-blue-500"
                aria-label={t("agentsUnread")}
              />
            ) : undefined,
          },
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
          },
        ],
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject, pathname, projects, unreadCount, triageCount, feedbackCount, openPrCount, anyAgentWorking, anyAgentUnread, openCreateProject, t]);

  // Drives the sidebar's home ↔ project swap animation (stable within a project).
  const modeKey = currentProject ? `project-${currentProject.id}` : "home";

  // Account/global options (statistics, feedback, theme, sign out). On desktop
  // they live in the sidebar footer; on mobile they move into the menu sheet +
  // command palette from a single source so both stay in sync.
  const { menuSections: accountSections, commandGroup: accountCommandGroup } =
    useAccountActions();

  // Palette gains the account group (used by the desktop pill too). The mobile
  // menu sheet gains the account sections so it fully replaces the sidebar.
  const paletteGroups = useMemo(
    () => [...commandGroups, accountCommandGroup],
    [commandGroups, accountCommandGroup]
  );
  const mobileMenuSections = useMemo(
    () => [...sections, ...accountSections],
    [sections, accountSections]
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
              <HeaderSearchPill onOpen={() => setPaletteOpen(true)} />
              <NewMenu />
            </div>
          }
        />
      }
      mobileNav={
        <MobileNav
          sections={mobileMenuSections}
          commandGroups={paletteGroups}
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
          la recherche du nav mobile, tickets enrichis d'actions (⌘;). */}
      <CommandPalette
        groups={paletteGroups}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
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
