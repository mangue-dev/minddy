"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  cn,
} from "mangue-ui";
import {
  Plus,
  MoreHorizontal,
  CircleDotDashed,
  CircleDot,
  CheckCircle2,
  Target,
  Settings,
  LayoutGrid,
  MessagesSquare,
  type LucideIcon,
} from "lucide-react";
import { issuesQueryFn } from "@/lib/issues-api";
import { usePrefetchProject } from "@/lib/use-prefetch-project";
import { ProjectOrb } from "@/components/project-orb";
import type { Project } from "@/lib/types";

/** One quick stat: icon then value, with a tooltip explaining what it is. */
function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: LucideIcon;
  value: number;
  label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="flex items-center gap-1.5 text-sm tabular-nums text-muted-foreground"
          aria-label={label}
        >
          <Icon className="size-3.5 shrink-0" />
          <span className="font-medium text-foreground/80">{value}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ProjectCard({ project }: { project: Project }) {
  const router = useRouter();
  const t = useTranslations("Projects");
  const tIssue = useTranslations("Issue");

  // Reuse the ["issues", projectId] cache (shared with the board + header
  // search). Since MIN-89 the realtime bridge subscribes to every one of my
  // projects, not just the one in the URL, so these counters stay live on the
  // dashboard without this card owning a subscription.
  const { data } = useQuery({
    queryKey: ["issues", project.id],
    queryFn: issuesQueryFn(project.id),
  });
  const issues = data ?? [];
  const isOpen = (status: string) =>
    status !== "done" && status !== "canceled" && status !== "duplicate";
  // Triage sits before the board — count it on its own, and keep it out of the
  // "open" bucket so the three indicators don't double-count.
  const triageCount = issues.filter((i) => i.status === "triage").length;
  const openCount = issues.filter(
    (i) => isOpen(i.status) && i.status !== "triage"
  ).length;
  const doneCount = issues.filter((i) => !isOpen(i.status)).length;

  const open = () => router.push(`/projects/${project.id}`);
  // Précharge les caches du board dès l'intention de navigation (MIN-89) : le
  // temps que le clic arrive, les requêtes sont déjà parties.
  const prefetch = usePrefetchProject();
  const warm = () => prefetch(project.id);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onMouseEnter={warm}
      onFocus={warm}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      className="group flex h-full min-h-[160px] cursor-pointer flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground outline-none transition-shadow hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)] focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {/* Top row: orb + name + more-options menu */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ProjectOrb seed={project.id} iconUrl={project.icon_url} className="size-9 rounded-[10px]" />
          <h3 className="truncate text-base font-medium tracking-tight">
            {project.name}
          </h3>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("projectOptions")}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <DropdownMenuItem
              onSelect={() => router.push(`/projects/${project.id}`)}
            >
              <LayoutGrid />
              {t("tickets")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => router.push(`/projects/${project.id}/triage`)}
            >
              <CircleDotDashed />
              {t("triage")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => router.push(`/projects/${project.id}/feedback`)}
            >
              <MessagesSquare />
              {t("feedback")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => router.push(`/projects/${project.id}/objectives`)}
            >
              <Target />
              {t("objectives")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => router.push(`/projects/${project.id}/settings`)}
            >
              <Settings />
              {t("settings")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Quick indicators — right-aligned, always shown (even at zero) */}
      <div className="mt-auto flex flex-col items-end gap-1 pt-1">
        <Stat
          icon={CircleDotDashed}
          value={triageCount}
          label={t("triageIssues", { entityPlural: tIssue("entityPlural") })}
        />
        <Stat
          icon={CircleDot}
          value={openCount}
          label={t("openIssues", { entityPlural: tIssue("entityPlural") })}
        />
        <Stat
          icon={CheckCircle2}
          value={doneCount}
          label={t("doneIssues", { entityPlural: tIssue("entityPlural") })}
        />
      </div>
    </div>
  );
}

/** Dashed "create" tile at the end of the project grid (mirrors AutoKap). */
export function NewProjectCard({
  onClick,
  disabled = false,
}: {
  onClick: () => void;
  /** Plafond de projets du plan atteint (MIN-72) : carte grisée, inerte. */
  disabled?: boolean;
}) {
  const t = useTranslations("Projects");
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "flex h-full min-h-[160px] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border outline-none transition-colors",
        disabled
          ? "opacity-50"
          : "cursor-pointer hover:border-foreground/25 hover:bg-muted/30 focus-visible:border-foreground/25 focus-visible:bg-muted/30"
      )}
    >
      <div className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Plus className="size-4" />
      </div>
      <span className="text-sm font-medium text-muted-foreground">
        {t("newProject")}
      </span>
    </div>
  );
}
