"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { useSmartAssignWarningsQuery } from "@/lib/use-smart-assign-warnings-query";
import { useProjects } from "@/lib/projects-context";
import { ProjectOrb } from "@/components/project-orb";
import { orbSeedOr } from "@/lib/project-orb-colors";

/** Same curve as onboarding and the creation assistant: a single entry,
 short, when the summary arrives — so that the notice arises under the composer at
 instead of appearing there all at once. */
const MOTION = { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const };

/**
 * Smart Assign active but incorrectly set (MIN-31): a project with several people or
 * least one member has no assignment rule. Without a rule, the model has no
 * nothing to match and the assignment falls on the owner — the
 * functionality seems to work while not sorting anything.
 *
 * Form: a notice, not an alert. The furniture of the other reception cards
 * (`bg-card`, same radius, same geometry); the amber only hangs on the net of the
 * border - a little more pronounced in light, where it fades - and to the triangle placed
 * in the title line. Affected projects are bullets that roll up
 * rather than a list: there is most often one, and a list of only one
 * element is not a list.
 *
 * The list comes from GET /api/me/smart-assign-warnings — the same as the patch
 * of the sidebar — and ONLY contains the projects of which I am the owner (only him
 * can write the rules). Nothing to report → nothing displayed.
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
        {/* The triangle is IN the title line, not in a column of its own:
 the description resumes at the edge of the block, like everywhere else on
 the welcome, instead of being shifted under an icon gutter. */}
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
