"use client";

import type { ReactNode } from "react";
import { cn } from "mangue-ui";
import { ChevronRight, Folder } from "lucide-react";
import { ProjectOrb } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";

/**
 * A PROJECT and its lines, folded or not — the common grammar of the columns of
 * navigation which list things belonging to projects (conversations of
 * the agent, pull requests).
 *
 * This is the scale at which we search: we know on which project we are worked
 * long before I remembered the exact title of the line. And this is what allows
 * the lines themselves to no longer carry their project — it is written once,
 * above them.
 *
 * This component holds the SHELL (header, fallback, "show more", alignments);
 * the LINES remain at the caller, who alone knows what they say. The cut
 * also: how much to show before "show more" depends on what is
 * selected, which only the caller knows.
 */

/** Key to the ORPHAN lines group (unattached project — aberrant RLS). */
export const NO_PROJECT_KEY = "__no_project__";

/** Rows shown per project before “Show more”. */
export const PROJECT_GROUP_LIMIT = 5;

/**
 * The indentation of lines under a header: they align with the project NAME
 * (px-2 + orb + its gutter), not its orb. To be placed on the line
 * itself, not on a container: its hover background must run over the entire
 * width of the column.
 */
export const PROJECT_GROUP_INDENT = "pl-8";

/** A group's project, reduced to what the header paints. */
export interface GroupProject {
  id: string;
  name: string;
  icon_url: string | null;
  /** Seed of the orb if it has been revived — cf. `projectOrbSeed`. */
  orb_seed: string | null;
}

export interface ProjectGroup<T> {
  key: string;
  project: GroupProject | null;
  items: T[];
}

/**
 * One group per project, in the order of APPEARANCE of the lines — which arrive
 * already sorted from the most recent to the oldest. The project we talked about
 * last is therefore at the top, and its lines keep their order.
 */
export function groupByProject<T>(
  items: readonly T[],
  projectOf: (item: T) => GroupProject | null,
): ProjectGroup<T>[] {
  const groups = new Map<string, ProjectGroup<T>>();
  for (const item of items) {
    const project = projectOf(item);
    const key = project?.id ?? NO_PROJECT_KEY;
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { key, project, items: [item] });
  }
  return [...groups.values()];
}

/** Adds or removes a key from a set, without mutating it. */
export function toggledSet(set: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(set);
  if (!next.delete(key)) next.add(key);
  return next;
}

export function SidebarProjectGroup({
  project,
  fallbackLabel,
  headerIcon,
  open,
  collapsible,
  onToggle,
  collapsedBadge,
  actions,
  hiddenCount,
  onShowAll,
  showMoreLabel,
  children,
}: {
  project: GroupProject | null;
  /** Fallback name when the project is not attached (`NO_PROJECT_KEY`). */
  fallbackLabel: string;
  /** Icon of a special group that is not attached to a project. */
  headerIcon?: ReactNode;
  open: boolean;
  /**
 * False during a filter: the list is then forcibly unfolded, and a header
 * which can no longer collapse anything is no longer a button — it reverts to the label
 * of the project, without chevrons or dead clicks. The chevron being at the END of the line, its
 * absence does not shift anything.
 */
  collapsible: boolean;
  onToggle: () => void;
  /**
 * What happens underneath, when we no longer see it (spinner, unread point):
 * folding a project should not make what was demanding attention disappear.
 * Rendered only when the group is FOLDED.
 */
  collapsedBadge?: ReactNode;
  /** Action revealed when hovering over the header (the “+” on the Agents page). */
  actions?: ReactNode;
  /** Lines hidden by cut → “Show more”. */
  hiddenCount: number;
  onShowAll: () => void;
  showMoreLabel: string;
  children: ReactNode;
}) {
  const header = (
    <>
      {headerIcon ?? (project ? (
        <ProjectOrb
          seed={projectOrbSeed(project)}
          iconUrl={project.icon_url}
          className="size-4 shrink-0"
        />
      ) : (
        <Folder className="size-4 shrink-0 text-muted-foreground" />
      ))}
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {project?.name ?? fallbackLabel}
      </span>
      {!open ? collapsedBadge : null}
    </>
  );
  const headerClass =
    "flex min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 pl-2 text-left";

  return (
    <div className="flex flex-col">
      {/* The fallback and the header action are two distinct gestures: two
 buttons side by side, in a row that lights up as one on hover (a button within a button does not exist, in HTML as well as on a mouse). */}
      <div className="group/project flex items-center rounded-md pr-1 transition-colors hover:bg-muted/60 focus-within:bg-muted/60">
        {collapsible ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className={cn(headerClass, "outline-none")}
          >
            {header}
          </button>
        ) : (
          <div className={headerClass}>{header}</div>
        )}
        {actions}
        {/* The chevron closes the line, to the right of everything: the action reserves its place
 even invisible, so nothing moves on hover. It replays the gesture of the
 large header button — hence `aria-hidden` and the removal of the
 keyboard path: only one control announced, not two. */}
        {collapsible ? (
          <button
            type="button"
            onClick={onToggle}
            tabIndex={-1}
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center outline-none"
          >
            <ChevronRight
              className={cn(
                "size-3 text-muted-foreground transition-transform",
                open && "rotate-90",
              )}
            />
          </button>
        ) : null}
      </div>

      {open ? (
        // The same 4 px gap as between the sorting and returns lines:
        // the lines of these columns are rounded pellets which take
        // a background on hover and selection, and stuck to each other
        // they are read as a single block — this is the bottom of the line
        // hovered over which touches that of its neighbor.
        <div className="flex flex-col gap-1 pt-1">
          {children}
          {hiddenCount > 0 ? (
            <button
              type="button"
              onClick={onShowAll}
              className={cn(
                "rounded-md py-1.5 pr-2 text-left text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground",
                PROJECT_GROUP_INDENT,
              )}
            >
              {showMoreLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
