"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  cn,
} from "mangue-ui";
import { ChevronsUpDown } from "lucide-react";
import { useProjects } from "@/lib/projects-context";
import { ProjectOrb } from "@/components/project-orb";
import type { Project } from "@/lib/types";

function projectIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)/);
  return match ? match[1] : null;
}

/** The section label for the current project route (drives the last crumb). */
function sectionFor(pathname: string): string | null {
  if (!/^\/projects\/[^/]+/.test(pathname)) return null;
  if (pathname.endsWith("/my")) return "Mes tickets";
  if (pathname.includes("/objectives")) return "Objectifs";
  if (pathname.includes("/settings")) return "Paramètres";
  if (pathname.includes("/triage")) return "Triage";
  return "Tous les tickets";
}

function ProjectChip({ project, className }: { project: Project; className?: string }) {
  return <ProjectOrb seed={project.id} className={cn("size-5", className)} />;
}

function ProjectSwitcher({ project }: { project: Project }) {
  const router = useRouter();
  const { projects } = useProjects();

  if (projects.length <= 1) {
    return (
      <Link
        href={`/projects/${project.id}`}
        className="flex items-center gap-2 text-sm font-medium shrink-0 transition-colors hover:text-muted-foreground"
      >
        <ProjectChip project={project} />
        <span className="max-w-[160px] truncate">{project.name}</span>
      </Link>
    );
  }

  return (
    <div className="flex h-8 shrink-0 items-center overflow-hidden rounded-lg border border-border">
      <Link
        href={`/projects/${project.id}`}
        className="flex items-center gap-2 self-stretch pl-2 pr-2 transition-colors hover:bg-accent/50"
      >
        <ProjectChip project={project} className="size-[18px]" />
        <span className="max-w-[140px] truncate text-sm font-medium">{project.name}</span>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Changer de Projet"
            className="flex h-full items-center self-stretch border-l border-border px-1.5 text-muted-foreground transition-colors hover:bg-accent/50"
          >
            <ChevronsUpDown className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {projects.map((p) => (
            <DropdownMenuItem key={p.id} onSelect={() => router.push(`/projects/${p.id}`)}>
              <ProjectChip project={p} className="size-4" />
              <span className="truncate">{p.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Separator() {
  return <span className="select-none text-muted-foreground/40">/</span>;
}

const levelVariants = {
  initial: { opacity: 0, x: -4 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -4 },
};

/**
 * One breadcrumb level (leading separator + content). Fades and slides in/out
 * as the navigation depth or identity changes — swap `levelKey` to replay the
 * animation. Mirrors AutoKap's BreadcrumbLevel; respects prefers-reduced-motion.
 */
function BreadcrumbLevel({
  show,
  levelKey,
  children,
}: {
  show: boolean;
  levelKey: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false} mode="wait">
      {show && (
        <motion.span
          key={levelKey}
          className="inline-flex min-w-0 items-center gap-2"
          {...(reduce
            ? {}
            : {
                variants: levelVariants,
                initial: "initial",
                animate: "animate",
                exit: "exit",
                transition: { duration: 0.15, ease: "easeOut" },
              })}
        >
          <Separator />
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

export function AppBreadcrumb() {
  const pathname = usePathname();
  const { projects } = useProjects();

  const currentProjectId = projectIdFromPath(pathname);
  const project = projects.find((p) => p.id === currentProjectId) ?? null;
  const section = sectionFor(pathname);
  const isHome = pathname.startsWith("/home");
  const isInbox = pathname.startsWith("/inbox");

  return (
    <nav className="flex min-w-0 items-center gap-2">
      <Link
        href="/home"
        className={cn(
          "shrink-0 text-sm font-medium transition-colors",
          isHome ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        Accueil
      </Link>

      <BreadcrumbLevel show={isInbox} levelKey="inbox">
        <span className="text-sm font-medium text-foreground">Inbox</span>
      </BreadcrumbLevel>

      <BreadcrumbLevel show={!!project} levelKey={`project-${project?.id ?? ""}`}>
        {project && <ProjectSwitcher project={project} />}
      </BreadcrumbLevel>

      <BreadcrumbLevel
        show={!!(project && section)}
        levelKey={`section-${section ?? ""}`}
      >
        <span className="truncate text-sm font-medium text-foreground">
          {section}
        </span>
      </BreadcrumbLevel>
    </nav>
  );
}
