"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Add01Icon,
  AiAutoRotateIcon as CycleIcon,
  BotIcon,
  Book02Icon,
  CircleDotDashedIcon,
  Clock01Icon as FileClock,
  DollarCircleIcon,
  Download01Icon,
  File02Icon,
  GitPullRequestIcon,
  Home01Icon,
  InboxIcon,
  KeyboardIcon,
  MessageMultiple01Icon,
  ServerStack01Icon,
  Settings01Icon,
  StickyNote02Icon,
  Target01Icon,
  TaskEdit01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import type { AppIcon } from "@/components/icon";
import type { PaletteGroup, PaletteItem } from "@/components/header-search-pill";
import { BOARD_ICON, ROUTINE_ICON } from "@/components/feature-icons";
import { NumoIcon } from "@/components/numo-icon";
import { ProjectOrb, projectOrbIcon } from "@/components/project-orb";
import { ADMIN_SECTION_PARAM, useAdminSections } from "@/lib/admin-sections";
import { visibleAdminTabs, type AdminTabId } from "@/lib/admin-tabs";
import { projectPath } from "@/lib/app-urls";
import { useAssistantPanelActions } from "@/lib/assistant-panel-context";
import { useAuth } from "@/lib/auth-context";
import { useCreate } from "@/lib/create-context";
import { documentationPath } from "@/lib/documentation-core.mjs";
import { openInbox } from "@/lib/inbox-launcher";
import { useCheatsheet } from "@/lib/keyboard/keyboard-context";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { useProjects } from "@/lib/projects-context";
import { useScratchpad } from "@/lib/scratchpad-context";
import { settingsSectionHref, useSettingsSections, type SettingsSection } from "@/lib/settings-sections";
import type { Project } from "@/lib/types";
import { useAdminCapabilities } from "@/lib/use-admin-capabilities";
import { useAllDrafts } from "@/lib/use-all-drafts";
import { useAppRouter } from "@/lib/use-app-router";
import { usePlanGates } from "@/lib/use-billing-query";
import { useIsAdmin } from "@/lib/use-is-admin";

/** Right-aligned project tag shown on palette rows (orb + name), AutoKap-style. */
export function projectChip(project: Project) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
      <ProjectOrb seed={projectOrbSeed(project)} iconUrl={project.icon_url} className="size-3.5" />
      <span className="max-w-[9rem] truncate">{project.name}</span>
    </span>
  );
}

/** Numo's face, still (no perpetual blinking), in the palette's icon slot. */
const NumoNavIcon = ({ className }: { className?: string }) => (
  <NumoIcon animated={false} className={className} />
);
NumoNavIcon.displayName = "NumoNavIcon";

export interface ShellCommandInput {
  /** The project on screen, or null outside a project. */
  currentProject: Project | null;
  /** The projects the switchers show (hidden ones leave, the current one stays). */
  switcherProjects: Project[];
  projectById: Map<string, Project>;
  createPageFromPalette: (projectId: string) => void;
  createPageInNewTab: (projectId: string) => void;
  openExport: () => void;
}

/**
 * The command palette's static groups: creation, global destinations, project
 * switching and screens, settings cards and the admin dashboard. The data
 * groups (tickets, objectives, pages) and the workspace groups are built by the
 * shell, which owns their caches.
 */
export function useShellCommandGroups({
  currentProject,
  switcherProjects,
  projectById,
  createPageFromPalette,
  createPageInNewTab,
  openExport,
}: ShellCommandInput): PaletteGroup[] {
  const t = useTranslations("Nav");
  const locale = useLocale();
  const ti = useTranslations("Issue");
  const tk = useTranslations("Keyboard");
  const tScratch = useTranslations("Scratchpad");
  const tDrafts = useTranslations("Drafts");
  const tRoutines = useTranslations("Routines");
  const tExport = useTranslations("Export");
  const tProjects = useTranslations("Projects");
  const tPages = useTranslations("Pages");
  const tCommon = useTranslations("Common");
  const router = useAppRouter();
  const { user } = useAuth();
  const { projects, openCreateProject, projectDrafts, openProjectDraft } = useProjects();
  const { openCreateIssue, openCreateObjective } = useCreate();
  const { drafts: creationDrafts } = useAllDrafts();
  const { open: openScratchpad } = useScratchpad();
  const openAssistant = useAssistantPanelActions().open;
  const { setOpen: setCheatsheetOpen } = useCheatsheet();
  const { agentsAllowed, projectLimitReached } = usePlanGates();

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
        icon: TaskEdit01Icon,
        keywords: [...createKw, ti("entity"), currentProject.name, currentProject.key],
        meta: projectChip(currentProject),
        metaText: currentProject.name,
        contextId: currentProject.id,
        // The global single-key shortcut (lib/create-context) targets the
        // current project's dialog when one is open
        keys: ["C"],
        onSelect: () => openCreateIssue({ projectId: currentProject.id }),
      });
      createItems.push({
        key: "create-objective",
        label: t("newObjective"),
        icon: Target01Icon,
        keywords: [...createKw, currentProject.name, currentProject.key],
        meta: projectChip(currentProject),
        metaText: currentProject.name,
        contextId: currentProject.id,
        keys: ["O"],
        onSelect: () => openCreateObjective({ projectId: currentProject.id }),
      });
      // The page only follows the open project IN a project, unlike the
      // ticket: outside the project, the palette would not know in which wiki to write,
      // and the page cache is only loaded for the current project.
      createItems.push({
        key: "create-page",
        label: tPages("newPage"),
        icon: File02Icon,
        keywords: [
          ...createKw,
          "page",
          "wiki",
          "document",
          "doc",
          "note",
          currentProject.name,
          currentProject.key,
        ],
        meta: projectChip(currentProject),
        metaText: currentProject.name,
        contextId: currentProject.id,
        onSelect: () => createPageFromPalette(currentProject.id),
        onSelectInNewTab: () => createPageInNewTab(currentProject.id),
      });
    } else {
      // Outside a project, creation is GENERIC: one "New issue" line and one
      // "New objective", not a line per project — the dialogs pick the
      // project themselves. The global single-key shortcuts always apply.
      createItems.push({
        key: "create-issue",
        label: t("newIssue"),
        icon: TaskEdit01Icon,
        keywords: [...createKw, ti("entity")],
        keys: ["C"],
        onSelect: () => openCreateIssue(),
      });
      // Objective creation from anywhere (MIN-33): one entry — the dialog's split
      // button picks the target project.
      if (projects.length > 0) {
        createItems.push({
          key: "create-objective",
          label: t("newObjective"),
          icon: Target01Icon,
          keywords: createKw,
          keys: ["O"],
          onSelect: () => openCreateObjective(),
        });
      }
    }
    if (!projectLimitReached) {
      createItems.push({
        key: "create-project",
        label: t("newProject"),
        icon: Add01Icon,
        keywords: createKw,
        onSelect: openCreateProject,
      });
    }
    // Drafts live IN the “Create” group, under “New Project”:
    // a draft is a creation in progress, and both lines lead to the same
    // place — the wizard, new or reused. Putting them in “Go to” would have
    // ranked a modal among destinations.
    //
    // No plan lock here, unlike “New project”: resume
    // a draft is not created, and the ceiling is said to be created.
    for (const d of projectDrafts) {
      createItems.push({
        key: `resume-project-draft-${d.id}`,
        label: tProjects("draftResume", { name: d.name }),
        icon: FileClock,
        keywords: [...createKw, d.name, "brouillon", "draft", "reprendre", "resume"],
        onSelect: () => openProjectDraft(d),
      });
    }
    // Issue and objective drafts too (MIN-753): the bottom bar's drafts tray
    // is hidden on a phone, where the palette is their only way back.
    for (const d of creationDrafts) {
      const draftProject = projectById.get(d.projectId);
      const name = d.title.trim() || tDrafts("untitled");
      createItems.push({
        key: `resume-${d.kind}-draft-${d.id}`,
        label: d.kind === "issue" ? tDrafts("resumeIssue", { name }) : tDrafts("resumeObjective", { name }),
        icon: d.kind === "issue" ? TaskEdit01Icon : Target01Icon,
        keywords: [...createKw, name, "brouillon", "draft", "reprendre", "resume"],
        ...(draftProject ? { meta: projectChip(draftProject), metaText: draftProject.name, contextId: draftProject.id } : {}),
        onSelect: () => d.kind === "issue"
          ? openCreateIssue({ projectId: d.projectId, draftId: d.id })
          : openCreateObjective({ projectId: d.projectId, draftId: d.id }),
      });
    }
    groups.push({ key: "create", heading: tCommon("create"), items: createItems });

    // ── Go to (global) ────────────────────────────────────────────────
    // Every shortcut below mirrors keyboard-context's runChord (G then key);
    // when a chord changes there, it changes here too.
    groups.push({
      key: "goto",
      heading: t("goTo"),
      items: [
        { key: "go-documentation", label: t("documentation"), icon: Book02Icon,
          keywords: ["documentation", "docs", "help"],
          onSelect: () => window.open(documentationPath(null, locale), "_blank", "noopener,noreferrer") },
        { key: "go-home", label: t("home"), icon: Home01Icon, href: "/home", keys: ["G", "H"], entityType: "navigation", onSelect: () => router.push("/home") },
        { key: "go-inbox", label: t("inbox"), icon: InboxIcon, keys: ["G", "I"], onSelect: openInbox },
        {
          key: "open-notes",
          label: tScratch("open"),
          icon: StickyNote02Icon,
          keys: ["mod", "⇧", "K"],
          keywords: ["notes", "scratchpad", "todo", "tâches", "problems"],
          onSelect: () => openScratchpad("palette"),
        },
        ...(agentsAllowed
          ? [
              {
                key: "go-pull-requests",
                label: t("pullRequests"),
                icon: GitPullRequestIcon,
                href: "/pull-requests",
                keys: ["G", "R"],
                entityType: "navigation",
                onSelect: () => router.push("/pull-requests"),
              },
              {
                // Numo has no page of its own any more (the FAB hosts the whole
                // conversation): the entry, like its chord, OPENS the panel.
                key: "go-agents",
                label: t("agents"),
                icon: NumoNavIcon,
                keys: ["G", "J"],
                keywords: ["numo", "chat", "assistant", "conversation"],
                onSelect: () => openAssistant(),
              },
              {
                // ROUTINES (MIN-185) have their own page and their own
                // entry into primary navigation.
                key: "go-routines",
                label: tRoutines("title"),
                icon: ROUTINE_ICON,
                href: "/routines",
                keys: ["G", "U"],
                entityType: "navigation",
                keywords: [
                  "routine",
                  "routines",
                  "schedule",
                  "scheduled",
                  "cron",
                  "récurrent",
                  "programmé",
                  "planifié",
                ],
                onSelect: () => router.push("/routines"),
              },
            ]
          : []),
         {
          key: "go-all-global",
          label: t("allIssues"),
          icon: BOARD_ICON,
          href: "/all",
          keys: ["G", "B"],
          entityType: "navigation",
          onSelect: () => router.push("/all"),
        },
        {
          // The cycle is personal and cross-project: it lives on /all in mode
          // cycle (MIN-32), never assigned to a project — same destination as
          // the ↗ boards tab and the home map.
          key: "go-cycle",
          label: t("cycle"),
          icon: CycleIcon,
          href: "/all?view=cycle",
          entityType: "navigation",
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
          icon: Settings01Icon,
          href: "/settings",
          entityType: "navigation",
          onSelect: () => router.push("/settings"),
        },
        {
          // Take out your tickets in CSV — the gesture you come to look for in ⌘K
          // at Linear, and that we were therefore looking for here. The dialogue asks for
          // project and statutes; this line assumes nothing.
          key: "export-issues",
          label: tExport("title"),
          icon: Download01Icon,
          keywords: [
            "export",
            "exporter",
            "csv",
            "excel",
            "tableur",
            "spreadsheet",
            "download",
            "télécharger",
            "telecharger",
            "backup",
            "sauvegarde",
            "sortir",
          ],
          onSelect: openExport,
        },
        {
          key: "keyboard-shortcuts",
          label: tk("shortcutsTitle"),
          icon: KeyboardIcon,
          keys: ["?"],
          keywords: ["keyboard", "shortcuts", "raccourcis", "clavier", "cheatsheet", "help", "aide"],
          onSelect: () => setCheatsheetOpen(true),
        },
      ],
    });

    if (switcherProjects.length > 0) {
      // ── Projects (quick switch) ─────────────────────────────────────
      groups.push({
        key: "projects",
        heading: t("projects"),
        items: switcherProjects.map((p) => ({
          key: `project-${p.id}`,
          label: p.name,
          icon: projectOrbIcon(projectOrbSeed(p), p.icon_url),
          keywords: [p.key],
          entityType: "project",
          contextId: p.id,
          data: p,
          href: projectPath(p.id),
          onSelect: () => router.push(projectPath(p.id)),
        })),
      });

      // ── Pages (per-project navigation) ──────────────────────────────
      const pageItems: PaletteItem[] = [];
      for (const p of switcherProjects) {
        const base = projectPath(p.id);
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
            icon: BOARD_ICON,
            keywords: kw,
            meta: chip,
            metaText,
            href: base,
            contextId,
            entityType: "navigation",
            onSelect: () => router.push(base),
          },
          {
            key: `pg-obj-${p.id}`,
            label: t("objectives"),
            icon: Target01Icon,
            keywords: kw,
            meta: chip,
            metaText,
            href: `${base}/objectives`,
            contextId,
            entityType: "navigation",
            onSelect: () => router.push(`${base}/objectives`),
          },
          // Between Objectives and Triage, as in the sidebar: the palette says
          // the screens of a project in the order in which they are seen.
          {
            key: `pg-pages-${p.id}`,
            label: t("pages"),
            icon: File02Icon,
            keywords: [...kw, "wiki", "documentation", "doc"],
            meta: chip,
            metaText,
            href: `${base}/pages`,
            contextId,
            entityType: "navigation",
            onSelect: () => router.push(`${base}/pages`),
          },
          {
            key: `pg-triage-${p.id}`,
            label: t("triage"),
            icon: CircleDotDashedIcon,
            keywords: kw,
            meta: chip,
            metaText,
            href: `${base}/triage`,
            contextId,
            entityType: "navigation",
            onSelect: () => router.push(`${base}/triage`),
          },
          {
            key: `pg-feedback-${p.id}`,
            label: t("feedback"),
            icon: MessageMultiple01Icon,
            keywords: kw,
            meta: chip,
            metaText,
            href: `${base}/feedback`,
            contextId,
            entityType: "navigation",
            onSelect: () => router.push(`${base}/feedback`),
          },
          {
            key: `pg-set-${p.id}`,
            label: t("projectSettings"),
            icon: Settings01Icon,
            keywords: kw,
            meta: chip,
            metaText,
            href: `${base}/settings`,
            contextId,
            entityType: "navigation",
            onSelect: () => router.push(`${base}/settings`),
          },
        );
      }

      // “Go to” and not “Pages”: since MIN-270, a Page is an object of the
      // product (the wiki of a project). Keep this word for the SCREENS group
      // would put two different things under the same title, in the same list.
      groups.push({ key: "pages", heading: t("goTo"), items: pageItems });
    }

    return groups;
  }, [projects, switcherProjects, projectById, projectDrafts, openProjectDraft, creationDrafts, tDrafts, currentProject, createPageFromPalette, createPageInNewTab, router, openCreateProject, openCreateIssue, openCreateObjective, openScratchpad, openAssistant, agentsAllowed, projectLimitReached, openExport, locale, t, ti, tk, tPages, tScratch, tExport, tProjects, setCheatsheetOpen]);

  // ── Settings: one line per CARD, not per tab ───────────────────────
  // A settings tab is a column of cards, and people type the card's words
  // ("Cadence", "Act on your behalf"), not the tab's. A row opens the page,
  // selects the tab, scrolls to the card and highlights it
  // (lib/settings-sections.ts, components/settings-shell.tsx).
  //
  // Only the project on screen offers its sections: the same sections repeated
  // for every project would swamp the list. Another project's settings are one
  // step away through its "Project settings" row in the screens group.
  const settingsSections = useSettingsSections();
  // Admin dashboard tabs and sections (MIN-829), for administrators only: the
  // palette opens the tab, and a section lands on its card like a setting.
  const isAdmin = useIsAdmin();
  const adminSections = useAdminSections();
  const adminCapabilities = useAdminCapabilities({ enabled: isAdmin === true });
  const tAdmin = useTranslations("Admin");
  const adminGroups = useMemo<PaletteGroup[]>(() => {
    if (!isAdmin) return [];
    const tabIcons: Record<AdminTabId, AppIcon> = { accounts: UserGroupIcon, costs: DollarCircleIcon, models: BotIcon, instance: ServerStack01Icon };
    const tabs = visibleAdminTabs(adminCapabilities.configured("managedAi"), adminCapabilities.instanceOverrides);
    const tabRows: PaletteItem[] = tabs.map((tab) => ({
      key: `admin-tab-${tab}`,
      label: tAdmin(`tabs.${tab}`),
      icon: tabIcons[tab],
      keywords: [tAdmin("pageTitle"), "admin"],
      href: `/admin?tab=${tab}`,
      entityType: "navigation",
      onSelect: () => router.push(`/admin?tab=${tab}`),
    }));
    const sectionRows: PaletteItem[] = adminSections.filter((section) => tabs.includes(section.tab)).map((section) => {
      const href = `/admin?tab=${section.tab}&${ADMIN_SECTION_PARAM}=${section.id}`;
      return {
        key: `admin-section-${section.id}`,
        label: section.title,
        icon: section.icon,
        keywords: [...section.keywords, section.tabLabel, tAdmin("pageTitle")],
        href,
        entityType: "navigation",
        onSelect: () => router.push(href),
      };
    });
    return [{ key: "admin", heading: tAdmin("pageTitle"), items: [...tabRows, ...sectionRows] }];
  }, [isAdmin, adminSections, adminCapabilities, router, tAdmin]);
  const settingsGroups = useMemo<PaletteGroup[]>(() => {
    const row = (s: SettingsSection, project: Project | null): PaletteItem => ({
      key: `settings-${s.id}`,
      label: s.title,
      icon: s.icon,
      keywords: [
        ...s.keywords,
        // The tab is a search term in its own right: “cycles” must
        // find “Cadence”, which doesn’t have the word anywhere.
        s.tabLabel,
        // A single setting is also found by the card that holds it.
        ...(s.parentTitle ? [s.parentTitle] : []),
        ...(project ? [project.name, project.key] : []),
      ],
      // No trailing text: the tab name is noise on the row (it is in the
      // search keywords), and the project orb comes from `contextId`.
      contextId: project?.id,
      href: settingsSectionHref(s, project?.id),
      entityType: "navigation",
      onSelect: () => router.push(settingsSectionHref(s, project?.id)),
    });

    const groups: PaletteGroup[] = [
      {
        key: "settings-account",
        heading: t("accountSettings"),
        items: settingsSections
          .filter((s) => s.scope === "account")
          .map((s) => row(s, null)),
      },
    ];

    if (currentProject) {
      // “Leave project” and “Sensitive area” are mutually exclusive:
      // offering the second to someone who is not an owner would take them to a
      // tab where it does not exist.
      const isOwner = currentProject.owner_id === user?.id;
      groups.push({
        key: "settings-project",
        heading: t("projectSettings"),
        items: settingsSections
          .filter(
            (s) =>
              s.scope === "project" &&
              (!s.audience || s.audience === (isOwner ? "owner" : "member")),
          )
          .map((s) => row(s, currentProject)),
      });
    }

    return groups;
  }, [settingsSections, currentProject, user, router, t]);

  return useMemo(
    () => [...commandGroups, ...settingsGroups, ...adminGroups],
    [commandGroups, settingsGroups, adminGroups],
  );
}
