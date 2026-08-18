"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { useProjects } from "@/lib/projects-context";
import { useTriageCountsQuery } from "@/lib/use-triage-counts-query";
import { ProjectOrb } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";

/** Same curve as the Smart Assign notice, just next to it: the indications arise
 under the dial when the numbers arrive, instead of appearing there all at once. */
const MOTION = { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const };

/**
 * How many lines at most. The home page is on ONE screen, and this column is
 * the only one that grows with the account: a leader of eight projects would have
 * pushed the compose out of the center, then the page out of the window. What
 * exceeds is said in one more line, not in eight.
 */
const MAX_ROWS = 3;

type Signal = {
  projectId: string;
  projectName: string;
  iconUrl: string | null;
  /** Already resolved (`projectOrbSeed`): the line no longer has the project on hand. */
  orbSeed: string;
  /** The two halves of `ProjectTriageCount`, named as the TABS of the
 project: the queue and its destination have the same word, and the line se
 therefore just puts it in its href. */
  kind: "triage" | "feedback";
  count: number;
};

/**
 * What awaits in each of my projects, in one sentence per project and per
 * file: “minddy has 2 tickets in triage”, “mango-ui has 3 returns to sort”.
 *
 * The numbers come from the SAME reading as the sidebar dots
 * (GET /api/me/triage-counts, already mounted by the shell on all pages
 * outside the project — so no further request here): the line of a project and its
 * tablet in the sidebar necessarily say the same number, and the sum of
 * two lines of a project falls on its single pellet.
 *
 * Two lines rather than a sum: “in sorting” and “to be sorted” do not lead
 * to the same tab, and a single number for both would not have told where to go.
 *
 * The focus is on MY projects, not on the keys to the table: a project to
 * the recycle bin keeps its tickets in sorting (DELETE /api/projects/[id] does not
 * does not touch) and therefore continues to weigh on it, even though it is no longer in the list.
 * Joining it through the list means dismissing it without having to filter it.
 */
export function HomeProjectSignals() {
  const t = useTranslations("Home");
  const { projects } = useProjects();
  const { counts } = useTriageCountsQuery();

  const signals = useMemo(() => {
    const rows: Signal[] = [];
    for (const project of projects) {
      const count = counts[project.id];
      if (!count) continue;
      for (const kind of ["triage", "feedback"] as const) {
        if (count[kind] > 0) {
          rows.push({
            projectId: project.id,
            projectName: project.name,
            iconUrl: project.icon_url,
            orbSeed: projectOrbSeed(project),
            kind,
            count: count[kind],
          });
        }
      }
    }
    // The biggest line first — that's the one that rots. The name decides,
    // so that two equal queues do not change place from one rendering to another.
    rows.sort(
      (a, b) => b.count - a.count || a.projectName.localeCompare(b.projectName)
    );
    return rows;
  }, [projects, counts]);

  if (signals.length === 0) return null;

  const shown = signals.slice(0, MAX_ROWS);
  // What remains is counted in ELEMENTS, not lines: “2 more lines” does not
  // means nothing, “7 other items to sort” is what we want to know.
  const rest = signals
    .slice(MAX_ROWS)
    .reduce((sum, signal) => sum + signal.count, 0);

  return (
    <motion.ul
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={MOTION}
      className="flex flex-col gap-1.5"
    >
      {shown.map((signal) => (
        <li key={`${signal.projectId}-${signal.kind}`}>
          <Link
            href={`/projects/${signal.projectId}/${signal.kind}`}
            className="group flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <ProjectOrb
              seed={signal.orbSeed}
              iconUrl={signal.iconUrl}
              className="size-5 rounded-[6px]"
            />
            <span className="min-w-0 flex-1 truncate">
              {t.rich(
                signal.kind === "triage" ? "signalTriage" : "signalFeedback",
                {
                  name: signal.projectName,
                  count: signal.count,
                  b: (chunks) => (
                    <span className="font-medium text-foreground">{chunks}</span>
                  ),
                }
              )}
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </li>
      ))}

      {/* The rest: said, but not clickable — there is no “to sort” global queue
 to open, and the sidebar already leads to each project. */}
      {rest > 0 ? (
        <li className="px-3.5 text-xs text-muted-foreground">
          {t("signalMore", { count: rest })}
        </li>
      ) : null}
    </motion.ul>
  );
}
