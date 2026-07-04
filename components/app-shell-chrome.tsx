"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AppShell,
  Sidebar,
  Header,
  HeaderSearch,
  MobileNav,
  CommandMenu,
  useCommandMenu,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  useTheme,
  type NavSection,
  type CommandMenuGroup,
} from "mangue-ui";
import { Home, Moon, Sun, LogOut, ChevronsUpDown, Plus, Folder, Inbox } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import { useNotifications } from "@/lib/use-notifications";
import { fetchIssuesApi } from "@/lib/issues-api";
import { issueIdentifier } from "@/lib/issue-constants";

function projectIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)/);
  return match ? match[1] : null;
}

function SidebarBrand() {
  return (
    <Link href="/home" className="px-1 font-display text-lg font-semibold tracking-tight">
      minddy
    </Link>
  );
}

function AccountMenu() {
  const { user, signOut } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const email = user?.email ?? "Compte";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm outline-none hover:bg-sidebar-accent focus-visible:bg-sidebar-accent">
        <span className="truncate text-muted-foreground">{email}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        <DropdownMenuItem onSelect={() => toggleTheme()}>
          {resolvedTheme === "dark" ? <Sun /> : <Moon />}
          Basculer le thème
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void signOut()}>
          <LogOut />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShellChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { open, setOpen } = useCommandMenu();
  const { projects, openCreateProject } = useProjects();
  const { unreadCount } = useNotifications();

  const currentProjectId = projectIdFromPath(pathname);
  const currentProject = projects.find((p) => p.id === currentProjectId) ?? null;

  // Shares the ["issues", projectId] cache with the board (no extra realtime
  // bridge) so ⌘K can search the current project's issues.
  const { data: projectIssues } = useQuery({
    queryKey: ["issues", currentProjectId ?? ""],
    queryFn: () => fetchIssuesApi(currentProjectId as string),
    enabled: !!currentProjectId,
  });

  const commandGroups = useMemo<CommandMenuGroup[]>(() => {
    const groups: CommandMenuGroup[] = [
      {
        heading: "Aller à",
        items: [
          { key: "go-home", label: "Home", icon: Home, onSelect: () => router.push("/home") },
          { key: "go-inbox", label: "Inbox", icon: Inbox, onSelect: () => router.push("/inbox") },
          { key: "cmd-new-project", label: "Nouveau Projet", icon: Plus, onSelect: openCreateProject },
        ],
      },
    ];
    if (projects.length > 0) {
      groups.push({
        heading: "Projets",
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
        heading: "Issues",
        items: projectIssues.map((i) => ({
          key: `cmd-issue-${i.id}`,
          label: i.title,
          keywords: [issueIdentifier(currentProject.key, i.number), String(i.number)],
          onSelect: () =>
            router.push(`/projects/${currentProject.id}?issue=${i.id}`),
        })),
      });
    }
    return groups;
  }, [projects, currentProject, projectIssues, router, openCreateProject]);
  const activeKey = pathname.startsWith("/home")
    ? "home"
    : pathname.startsWith("/inbox")
      ? "inbox"
      : currentProjectId
        ? `project-${currentProjectId}`
        : undefined;

  const sections = useMemo<NavSection[]>(
    () => [
      {
        items: [
          { key: "home", label: "Home", icon: Home, href: "/home" },
          {
            key: "inbox",
            label: "Inbox",
            icon: Inbox,
            href: "/inbox",
            badge:
              unreadCount > 0 ? (
                <span className="flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                  {unreadCount}
                </span>
              ) : undefined,
          },
        ],
      },
      {
        label: "Projets",
        items: [
          ...projects.map((p) => ({
            key: `project-${p.id}`,
            label: p.name,
            icon: Folder,
            href: `/projects/${p.id}`,
            badge: (
              <span className="font-mono text-[10px] text-muted-foreground">{p.key}</span>
            ),
          })),
          {
            key: "new-project",
            label: "Nouveau Projet",
            icon: Plus,
            onClick: openCreateProject,
          },
        ],
      },
    ],
    [projects, openCreateProject, unreadCount]
  );

  return (
    <>
      <AppShell
        sidebar={
          <Sidebar
            sections={sections}
            activeKey={activeKey}
            linkComponent={Link}
            header={<SidebarBrand />}
            footer={<AccountMenu />}
          />
        }
        header={
          <Header
            linkComponent={Link}
            center={<HeaderSearch onClick={() => setOpen(true)} />}
          />
        }
        mobileNav={
          <MobileNav sections={sections} activeKey={activeKey} linkComponent={Link} />
        }
      >
        {children}
      </AppShell>

      <CommandMenu
        open={open}
        onOpenChange={setOpen}
        groups={commandGroups}
        placeholder="Rechercher une issue, un projet…"
        emptyMessage="Aucun résultat."
      />
    </>
  );
}
