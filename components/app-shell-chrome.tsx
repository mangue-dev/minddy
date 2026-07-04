"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "mangue-ui";
import { Home, Moon, Sun, LogOut, ChevronsUpDown, Plus, Folder } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";

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
  const { open, setOpen } = useCommandMenu();
  const { projects, openCreateProject } = useProjects();

  const currentProjectId = projectIdFromPath(pathname);
  const activeKey = pathname.startsWith("/home")
    ? "home"
    : currentProjectId
      ? `project-${currentProjectId}`
      : undefined;

  const sections = useMemo<NavSection[]>(
    () => [
      { items: [{ key: "home", label: "Home", icon: Home, href: "/home" }] },
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
    [projects, openCreateProject]
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
        groups={[]}
        placeholder="Rechercher…"
        emptyMessage="La recherche arrivera avec les issues."
      />
    </>
  );
}
