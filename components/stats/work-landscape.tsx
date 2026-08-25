"use client";

import type { ReactNode } from "react";
import { FolderKanban, Tags, Target } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { MentionChip } from "@/components/mention-chip";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { objectiveColor } from "@/components/objective-icon";
import { completionShare } from "@/lib/stats-derive";
import { mentionTargetPath } from "@/lib/mention-target";
import { projectOrbBaseColor } from "@/lib/project-orb-colors";
import type {
  StatCategoryBucket,
  StatObjectiveBucket,
  StatProjectBucket,
} from "@/lib/types";
import { InfoHint } from "./stats-chrome";

const VISIBLE_ROWS = 5;

type LandscapeRow = {
  id: string;
  name: string;
  completed: number;
  color: string;
  label: ReactNode;
};

/** One compact home for project, category, and objective completion breakdowns. */
export function WorkLandscape({
  total,
  projects,
  categories,
  objectives,
}: {
  total: number;
  projects: StatProjectBucket[];
  categories: StatCategoryBucket[];
  objectives: StatObjectiveBucket[];
}) {
  const t = useTranslations("Stats");
  const router = useRouter();

  const projectRows: LandscapeRow[] = projects.map((project) => {
    const seed = project.orbSeed ?? project.id;
    const href = mentionTargetPath("project", project.id);
    return {
      id: project.id,
      name: project.name,
      completed: project.completed,
      color: projectOrbBaseColor(seed),
      label: (
        <MentionChip
          type="project"
          id={project.id}
          label={project.name}
          avatarSeed={seed}
          iconUrl={project.iconUrl}
          href={href}
          onNavigate={href ? () => router.push(href) : undefined}
          className="max-w-full truncate text-xs"
        />
      ),
    };
  });

  const categoryRows: LandscapeRow[] = categories.map((category) => ({
    id: JSON.stringify([category.name, category.color]),
    name: category.name,
    completed: category.completed,
    color: category.color,
    label: <CategoryLabel name={category.name} color={category.color} />,
  }));

  const objectiveRows: LandscapeRow[] = objectives.map((objective) => {
    const href = mentionTargetPath(
      "objective",
      objective.id,
      objective.projectId,
    );
    return {
      id: objective.id,
      name: objective.name,
      completed: objective.completed,
      color: objectiveColor(objective.color),
      label: (
        <MentionChip
          type="objective"
          id={objective.id}
          label={objective.name}
          color={objective.color}
          href={href}
          onNavigate={href ? () => router.push(href) : undefined}
          className="max-w-full truncate text-xs"
        />
      ),
    };
  });

  return (
    <section aria-labelledby="work-landscape-title" className="mt-8">
      <div className="mb-3">
        <h2
          id="work-landscape-title"
          className="text-base font-semibold tracking-tight"
        >
          {t("workLandscape")}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t("workLandscapeIntro", { count: total })}
        </p>
      </div>

      <div className="grid overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        <BreakdownGroup
          icon={<FolderKanban className="size-4 text-muted-foreground" />}
          title={t("projectsBreakdown")}
          info={t("projectsBreakdownInfo")}
          rows={projectRows}
          total={total}
          emptyLabel={t("projectsBreakdownEmpty")}
        />
        <BreakdownGroup
          icon={<Tags className="size-4 text-muted-foreground" />}
          title={t("categoriesBreakdown")}
          info={t("categoriesBreakdownInfo")}
          rows={categoryRows}
          total={total}
          emptyLabel={t("categoriesBreakdownEmpty")}
        />
        <BreakdownGroup
          icon={<Target className="size-4 text-muted-foreground" />}
          title={t("objectivesBreakdown")}
          info={t("objectivesBreakdownInfo")}
          rows={objectiveRows}
          total={total}
          emptyLabel={t("objectivesBreakdownEmpty")}
        />
      </div>
    </section>
  );
}

function BreakdownGroup({
  icon,
  title,
  info,
  rows,
  total,
  emptyLabel,
}: {
  icon: ReactNode;
  title: string;
  info: string;
  rows: LandscapeRow[];
  total: number;
  emptyLabel: string;
}) {
  const t = useTranslations("Stats");
  const visible = rows.slice(0, VISIBLE_ROWS);
  const hidden = rows.slice(VISIBLE_ROWS);

  return (
    <div className="flex min-w-0 flex-col border-b border-border p-5 last:border-b-0 lg:border-b-0">
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold">{title}</h3>
        <InfoHint text={info} />
      </div>

      {visible.length > 0 ? (
        <div className="flex flex-1 flex-col gap-4">
          {visible.map((row) => {
            const share = completionShare(row.completed, total);
            return (
              <div key={row.id} className="min-w-0">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="min-w-0 overflow-hidden">{row.label}</div>
                  <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                    {t("completedCountShort", { count: row.completed })}
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-muted"
                  role="img"
                  aria-label={t("breakdownShareLabel", {
                    name: row.name,
                    count: row.completed,
                    share,
                  })}
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${share}%`, backgroundColor: row.color }}
                  />
                </div>
              </div>
            );
          })}

          {hidden.length > 0 ? <HiddenRows rows={hidden} /> : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      )}
    </div>
  );
}

function HiddenRows({ rows }: { rows: LandscapeRow[] }) {
  const t = useTranslations("Stats");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="w-fit text-xs font-medium text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground"
        >
          {t("otherBreakdownItems", { count: rows.length })}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-4"
            >
              <div className="min-w-0 overflow-hidden">{row.label}</div>
              <span className="shrink-0 tabular-nums">{row.completed}</span>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

function CategoryLabel({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 text-xs font-medium">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="truncate">{name}</span>
    </span>
  );
}
