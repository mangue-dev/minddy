"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  AppShell,
  Header,
  MobileNav,
  toast,
  type NavSection,
  type NavItem,
  type CommandMenuGroup,
} from "mangue-ui";
import {
  Home,
  ChevronLeft,
  Plus,
  Folder,
  Inbox,
  LayoutGrid,
  CircleUser,
  Target,
  Filter,
  Settings,
} from "lucide-react";
import { useProjects } from "@/lib/projects-context";
import { useNotifications } from "@/lib/use-notifications";
import { fetchIssuesApi } from "@/lib/issues-api";
import { issueIdentifier } from "@/lib/issue-constants";
import { AppBreadcrumb } from "@/components/app-breadcrumb";
import { HeaderSearchPill } from "@/components/header-search-pill";
import { NewMenu } from "@/components/new-menu";
import { projectOrbIcon } from "@/components/project-orb";
import { AppSidebar } from "@/components/app-sidebar";

function projectIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)/);
  return match ? match[1] : null;
}

export function AppShellChrome({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Nav");
  const ti = useTranslations("Issue");
  const pathname = usePathname();
  const router = useRouter();
  const { projects, openCreateProject } = useProjects();
  const { unreadCount } = useNotifications();

  const currentProjectId = projectIdFromPath(pathname);
  const currentProject = projects.find((p) => p.id === currentProjectId) ?? null;
  const isInbox = pathname.startsWith("/inbox");

  // Shares the ["issues", projectId] cache with the board (no extra realtime
  // bridge) so search can list the current project's issues.
  const { data: projectIssues } = useQuery({
    queryKey: ["issues", currentProjectId ?? ""],
    queryFn: () => fetchIssuesApi(currentProjectId as string),
    enabled: !!currentProjectId,
  });

  const commandGroups = useMemo<CommandMenuGroup[]>(() => {
    const groups: CommandMenuGroup[] = [
      {
        heading: t("goTo"),
        items: [
          { key: "go-home", label: t("home"), icon: Home, onSelect: () => router.push("/home") },
          { key: "go-inbox", label: t("inbox"), icon: Inbox, onSelect: () => router.push("/inbox") },
          { key: "cmd-new-project", label: t("newProject"), icon: Plus, onSelect: openCreateProject },
        ],
      },
    ];
    if (projects.length > 0) {
      groups.push({
        heading: t("projects"),
        items: projects.map((p) => ({
          key: `cmd-project-${p.id}`,
          label: p.name,
          icon: Folder,
          keywords: [p.key],
          onSelect: () => router.push(`/projects/${p.id}`),
        })),
      });
    }
    if (currentProject && projectIssues && projectIssues.length > 0) {
      groups.push({
        heading: ti("entityPlural"),
        items: projectIssues.map((i) => ({
          key: `cmd-issue-${i.id}`,
          label: i.title,
          keywords: [issueIdentifier(currentProject.key, i.number), String(i.number)],
          onSelect: () => router.push(`/projects/${currentProject.id}?issue=${i.id}`),
        })),
      });
    }
    return groups;
  }, [projects, currentProject, projectIssues, router, openCreateProject, t, ti]);

  const inboxItem: NavItem = {
    key: "inbox",
    label: t("inbox"),
    icon: Inbox,
    href: "/inbox",
    active: isInbox,
    badge:
      unreadCount > 0 ? (
        <span className="flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
          {unreadCount}
        </span>
      ) : undefined,
  };

  const sections = useMemo<NavSection[]>(() => {
    if (currentProject) {
      const base = `/projects/${currentProject.id}`;
      return [
        {
          items: [
            inboxItem,
            { key: "home-back", label: t("home"), icon: ChevronLeft, href: "/home" },
          ],
        },
        {
          items: [
            {
              key: "my",
              label: t("myIssues"),
              icon: CircleUser,
              href: `${base}/my`,
              active: pathname === `${base}/my`,
            },
            {
              key: "all",
              label: t("allIssues"),
              icon: LayoutGrid,
              href: base,
              active: pathname === base,
            },
            {
              key: "objectives",
              label: t("objectives"),
              icon: Target,
              href: `${base}/objectives`,
              active: pathname.startsWith(`${base}/objectives`),
            },
            {
              key: "triage",
              label: t("triage"),
              icon: Filter,
              onClick: () => toast(t("triageComingSoon")),
            },
            {
              key: "settings",
              label: t("projectSettings"),
              icon: Settings,
              href: `${base}/settings`,
              active: pathname.startsWith(`${base}/settings`),
            },
          ],
        },
      ];
    }
    return [
      {
        items: [
          inboxItem,
          { key: "home", label: t("home"), icon: Home, href: "/home", active: pathname.startsWith("/home") },
        ],
      },
      {
        items: [
          ...projects.map((p) => ({
            key: `project-${p.id}`,
            label: p.name,
            icon: projectOrbIcon(p.id),
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
  }, [currentProject, pathname, projects, unreadCount, openCreateProject, t]);

  // Drives the sidebar's home ↔ project swap animation (stable within a project).
  const modeKey = currentProject ? `project-${currentProject.id}` : "home";

  return (
    <AppShell
      sidebar={<AppSidebar sections={sections} modeKey={modeKey} />}
      header={
        <Header
          className="bg-sidebar backdrop-blur-none"
          left={<AppBreadcrumb />}
          right={
            <div className="flex items-center gap-2">
              <HeaderSearchPill groups={commandGroups} />
              <NewMenu />
            </div>
          }
        />
      }
      mobileNav={<MobileNav sections={sections} linkComponent={Link} />}
    >
      {children}
    </AppShell>
  );
}
