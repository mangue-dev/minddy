"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  cn,
} from "mangue-ui";
import { ChevronsUpDown, ChevronLeft, Home } from "lucide-react";
import { useProjects } from "@/lib/projects-context";
import { ProjectOrb } from "@/components/project-orb";
import type { Project } from "@/lib/types";
import { projectIdFromPath } from "@/lib/project-id-from-path";

/** The section translation key for the current project route (drives the last crumb). */
function sectionKeyFor(pathname: string): string | null {
  if (!/^\/projects\/[^/]+/.test(pathname)) return null;
  if (pathname.includes("/objectives")) return "objectives";
  if (pathname.includes("/settings")) return "settings";
  if (pathname.includes("/triage")) return "triage";
  if (pathname.includes("/feedback")) return "feedback";
  return "tickets";
}

function ProjectChip({ project, className }: { project: Project; className?: string }) {
  return <ProjectOrb seed={project.id} className={cn("size-5", className)} />;
}

function ProjectSwitcher({ project }: { project: Project }) {
  const t = useTranslations("Nav");
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
            aria-label={t("switchProject")}
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

/**
 * Mobile header (<desktop): the trail collapses to two "temps" — a back button
 * pointing at the parent level, plus the current level centred (à la AutoKap).
 * At the project root the current level is the ProjectSwitcher itself.
 */
function MobileBreadcrumb({
  project,
  section,
  sectionKey,
  isInbox,
  isAccountSettings,
  isStatistics,
  isAdmin,
  isAllGlobal,
  isPullRequests,
}: {
  project: Project | null;
  section: string | null;
  sectionKey: string | null;
  isInbox: boolean;
  isAccountSettings: boolean;
  isStatistics: boolean;
  isAdmin: boolean;
  isAllGlobal: boolean;
  isPullRequests: boolean;
}) {
  const t = useTranslations("Nav");
  const tc = useTranslations("Common");

  // Resolve the two beats: the parent (back target, shown as its icon — home or
  // the project orb, like AutoKap) and the current level (centred).
  const homeIcon = <Home className="size-[18px] shrink-0" />;
  let backHref: string | null = null;
  let backIcon: React.ReactNode = null;
  let current: React.ReactNode;

  if (isInbox) {
    backHref = "/home";
    backIcon = homeIcon;
    current = <CurrentLabel>{t("inbox")}</CurrentLabel>;
  } else if (isAccountSettings) {
    backHref = "/home";
    backIcon = homeIcon;
    current = <CurrentLabel>{t("accountSettings")}</CurrentLabel>;
  } else if (isStatistics) {
    backHref = "/home";
    backIcon = homeIcon;
    current = <CurrentLabel>{t("statistics")}</CurrentLabel>;
  } else if (isAdmin) {
    backHref = "/home";
    backIcon = homeIcon;
    current = <CurrentLabel>{t("adminDashboard")}</CurrentLabel>;
  } else if (isAllGlobal) {
    backHref = "/home";
    backIcon = homeIcon;
    current = <CurrentLabel>{t("allIssues")}</CurrentLabel>;
  } else if (isPullRequests) {
    backHref = "/home";
    backIcon = homeIcon;
    current = <CurrentLabel>{t("pullRequests")}</CurrentLabel>;
  } else if (project) {
    // The board root ("tickets") is the project root — show the switcher and
    // go back up to Home. Nested sections go back to the project root.
    const atRoot = !section || sectionKey === "tickets";
    if (atRoot) {
      backHref = "/home";
      backIcon = homeIcon;
      current = <ProjectSwitcher project={project} />;
    } else {
      backHref = `/projects/${project.id}`;
      backIcon = <ProjectChip project={project} className="size-[18px]" />;
      current = <CurrentLabel>{section}</CurrentLabel>;
    }
  } else {
    // Home (and any other top-level route): just the current label, no back.
    current = <CurrentLabel>{t("home")}</CurrentLabel>;
  }

  return (
    <div className="flex min-w-0 flex-1 items-center desktop:hidden">
      <div className="flex min-w-0 flex-1 justify-start">
        {backHref ? (
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-9 gap-1 px-2 text-foreground"
            aria-label={tc("back")}
          >
            <Link href={backHref}>
              <ChevronLeft className="size-4 shrink-0" />
              {backIcon}
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="flex min-w-0 items-center justify-center">{current}</div>

      <div className="flex-1" />
    </div>
  );
}

function CurrentLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="truncate text-sm font-semibold text-foreground">
      {children}
    </span>
  );
}

export function AppBreadcrumb() {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const { projects } = useProjects();

  const currentProjectId = projectIdFromPath(pathname);
  const project = projects.find((p) => p.id === currentProjectId) ?? null;
  const sectionKey = sectionKeyFor(pathname);
  const section = sectionKey ? t(sectionKey as Parameters<typeof t>[0]) : null;
  const isHome = pathname.startsWith("/home");
  const isInbox = pathname.startsWith("/inbox");
  const isAccountSettings = pathname.startsWith("/settings");
  const isStatistics = pathname.startsWith("/statistics");
  const isAdmin = pathname.startsWith("/admin");
  const isAllGlobal = pathname === "/all";
  const isPullRequests = pathname.startsWith("/pull-requests");

  return (
    <>
      {/* Desktop (≥1200px): the full animated trail. */}
      <nav className="hidden min-w-0 items-center gap-2 desktop:flex">
        <Link
          href="/home"
          className={cn(
            "shrink-0 text-sm font-medium transition-colors",
            isHome ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t("home")}
        </Link>

        <BreadcrumbLevel show={isInbox} levelKey="inbox">
          <span className="text-sm font-medium text-foreground">{t("inbox")}</span>
        </BreadcrumbLevel>

        <BreadcrumbLevel show={isAccountSettings} levelKey="account-settings">
          <span className="text-sm font-medium text-foreground">
            {t("accountSettings")}
          </span>
        </BreadcrumbLevel>

        <BreadcrumbLevel show={isStatistics} levelKey="statistics">
          <span className="text-sm font-medium text-foreground">
            {t("statistics")}
          </span>
        </BreadcrumbLevel>

        <BreadcrumbLevel show={isAdmin} levelKey="admin">
          <span className="text-sm font-medium text-foreground">
            {t("adminDashboard")}
          </span>
        </BreadcrumbLevel>

        <BreadcrumbLevel show={isAllGlobal} levelKey="all-global">
          <span className="text-sm font-medium text-foreground">
            {t("allIssues")}
          </span>
        </BreadcrumbLevel>

        <BreadcrumbLevel show={isPullRequests} levelKey="pull-requests">
          <span className="text-sm font-medium text-foreground">
            {t("pullRequests")}
          </span>
        </BreadcrumbLevel>

        <BreadcrumbLevel show={!!project} levelKey={`project-${project?.id ?? ""}`}>
          {project && <ProjectSwitcher project={project} />}
        </BreadcrumbLevel>

        <BreadcrumbLevel
          show={!!(project && section)}
          levelKey={`section-${sectionKey ?? ""}`}
        >
          <span className="truncate text-sm font-medium text-foreground">
            {section}
          </span>
        </BreadcrumbLevel>
      </nav>

      {/* Mobile (<1200px): two-stage back + current level. */}
      <MobileBreadcrumb
        project={project}
        section={section}
        sectionKey={sectionKey}
        isInbox={isInbox}
        isAccountSettings={isAccountSettings}
        isStatistics={isStatistics}
        isAdmin={isAdmin}
        isAllGlobal={isAllGlobal}
        isPullRequests={isPullRequests}
      />
    </>
  );
}
