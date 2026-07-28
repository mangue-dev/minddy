"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { useHomeSummaryQuery } from "@/lib/use-home-summary-query";
import { useProjects } from "@/lib/projects-context";
import { ProjectOrb } from "@/components/project-orb";

/**
 * Smart Assign actif mais mal réglé (MIN-31) : un projet à plusieurs où au
 * moins un membre n'a pas de règle d'affectation. Sans règle, le modèle n'a
 * rien à faire correspondre et l'affectation retombe sur le owner — la
 * fonctionnalité a l'air de marcher tout en ne triant rien.
 *
 * La liste vient de GET /api/me/summary, déjà chargé par le tableau de bord, et
 * ne contient QUE les projets dont je suis owner (seul lui peut écrire les
 * règles). Rien à signaler → rien ne s'affiche.
 */
export function HomeSmartAssignWarning() {
  const t = useTranslations("Home");
  const { smartAssignWarnings } = useHomeSummaryQuery();
  const { projects } = useProjects();

  if (smartAssignWarnings.length === 0) return null;

  return (
    <div className="mb-6 flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <p className="flex items-start gap-2 text-sm font-medium text-amber-700 dark:text-amber-500">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("smartAssignWarningTitle")}
        </p>
        <p className="pl-6 text-xs text-muted-foreground">
          {t("smartAssignWarningDesc")}
        </p>
      </div>
      <ul className="flex flex-col gap-1 pl-6">
        {smartAssignWarnings.map((warning) => {
          const project = projects.find((p) => p.id === warning.projectId);
          return (
            <li key={warning.projectId}>
              <Link
                href={`/projects/${warning.projectId}/settings?tab=smart-assign`}
                className="group -mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60"
              >
                <ProjectOrb
                  seed={warning.projectId}
                  iconUrl={project?.icon_url ?? null}
                  className="size-5 rounded"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {project?.name || warning.projectName}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {t("smartAssignWarningMissing", {
                    count: warning.missingCount,
                    total: warning.memberCount,
                  })}
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
