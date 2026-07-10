"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQueries } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useProjects } from "@/lib/projects-context";
import { ProjectOrb } from "@/components/project-orb";

/**
 * Home "Feedback" surface (MIN-38). Feedback is per-project (one board per
 * project), so there is no aggregate endpoint — we fan out the same lightweight
 * count query the sidebar badge uses (`["feedback-count", pid]` → open+planned
 * canonical posts) across the user's projects via `useQueries`, and list only
 * the projects that actually have open feedback. Nothing to show → render
 * nothing (no empty-state noise — cf. the "simplicité" moat).
 */
export function HomeFeedbackSection() {
  const t = useTranslations("Home");
  const { projects } = useProjects();

  const results = useQueries({
    queries: projects.map((p) => ({
      queryKey: ["feedback-count", p.id],
      queryFn: async () => {
        const r = await fetch(`/api/projects/${p.id}/feedback/counts`);
        if (!r.ok) return { count: 0 };
        return (await r.json()) as { count: number };
      },
      staleTime: 60_000,
    })),
  });

  const rows = projects
    .map((project, i) => ({ project, count: results[i]?.data?.count ?? 0 }))
    .filter((row) => row.count > 0);

  if (rows.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold tracking-tight">{t("feedbackTitle")}</h2>
      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {rows.map(({ project, count }) => (
          <Link
            key={project.id}
            href={`/projects/${project.id}/feedback`}
            className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
          >
            <ProjectOrb seed={project.id} className="size-7 rounded-lg" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {project.name}
            </span>
            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
              {t("feedbackOpenCount", { count })}
            </span>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
          </Link>
        ))}
      </div>
    </section>
  );
}
