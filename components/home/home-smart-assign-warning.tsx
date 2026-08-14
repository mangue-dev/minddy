"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { useSmartAssignWarningsQuery } from "@/lib/use-smart-assign-warnings-query";
import { useProjects } from "@/lib/projects-context";
import { ProjectOrb } from "@/components/project-orb";
import { orbSeedOr } from "@/lib/project-orb-colors";

/** Même courbe que l'onboarding et l'assistant de création : une seule entrée,
    courte, quand le résumé arrive — pour que l'avis se pose sous le composer au
    lieu d'y apparaître d'un coup. */
const MOTION = { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const };

/**
 * Smart Assign actif mais mal réglé (MIN-31) : un projet à plusieurs où au
 * moins un membre n'a pas de règle d'affectation. Sans règle, le modèle n'a
 * rien à faire correspondre et l'affectation retombe sur le owner — la
 * fonctionnalité a l'air de marcher tout en ne triant rien.
 *
 * Forme : un avis, pas une alerte. Le mobilier des autres cartes de l'accueil
 * (`bg-card`, même rayon, même géométrie) ; l'ambre ne tient qu'au filet de la
 * bordure — un peu plus appuyé en clair, où il s'efface — et au triangle posé
 * dans la ligne de titre. Les projets concernés sont des puces qui s'enroulent
 * plutôt qu'une liste : il y en a un le plus souvent, et une liste d'un seul
 * élément n'est pas une liste.
 *
 * La liste vient de GET /api/me/smart-assign-warnings — la même que la pastille
 * de la sidebar — et ne contient QUE les projets dont je suis owner (seul lui
 * peut écrire les règles). Rien à signaler → rien ne s'affiche.
 */
export function HomeSmartAssignWarning() {
  const t = useTranslations("Home");
  const { warnings } = useSmartAssignWarningsQuery();
  const { projects } = useProjects();

  if (warnings.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={MOTION}
      className="flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-card px-4 py-3.5 dark:border-amber-500/25"
    >
      <div className="flex flex-col gap-0.5">
        {/* Le triangle est DANS la ligne de titre, pas dans une colonne à lui :
            la description reprend au bord du bloc, comme partout ailleurs sur
            l'accueil, au lieu d'être décalée sous une gouttière d'icône. */}
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <TriangleAlert
            className="size-4 shrink-0 text-amber-500"
            aria-hidden
          />
          {t("smartAssignWarningTitle")}
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("smartAssignWarningDesc")}
        </p>
      </div>

      <ul className="flex flex-wrap gap-2">
        {warnings.map((warning) => {
          const project = projects.find((p) => p.id === warning.projectId);
          return (
            <li key={warning.projectId}>
              <Link
                href={`/projects/${warning.projectId}/settings?tab=smart-assign`}
                className="group flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-xs outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <ProjectOrb
                  seed={orbSeedOr(warning.projectId, project?.orb_seed)}
                  iconUrl={project?.icon_url}
                  className="size-4 rounded-[5px]"
                />
                <span className="max-w-56 truncate font-medium">
                  {project?.name || warning.projectName}
                </span>
                <span className="text-muted-foreground/50" aria-hidden>
                  ·
                </span>
                <span className="text-muted-foreground">
                  {t("smartAssignWarningMissing", {
                    count: warning.missingCount,
                    total: warning.memberCount,
                  })}
                </span>
                <ChevronRight className="size-3 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          );
        })}
      </ul>
    </motion.section>
  );
}
