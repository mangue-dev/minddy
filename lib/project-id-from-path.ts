import { projectPath, type ProjectRefSource, type ProjectTab } from "./app-urls";
import { expandProjectSegment } from "./ref-registry";

/** The raw project segment of the current URL (`/projects/[ref]/…`), else null. */
export function projectSegmentFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/?#]+)/);
  return match ? match[1] : null;
}

/**
 * Project id designated by the current URL (`/projects/min-3f2a9c81/…`), else
 * null. The short code expands to the full id once the project list is
 * loaded; a legacy full UUID passes through.
 */
export function projectIdFromPath(pathname: string): string | null {
  return expandProjectSegment(projectSegmentFromPath(pathname));
}

const PROJECT_TABS = new Set<string>([
  "objectives",
  "pages",
  "triage",
  "feedback",
  "settings",
]);

/**
 * Route to the same project-level tab in another project.
 *
 * Deeper paths identify records that do not belong to the target project, so
 * switching context keeps only the tab and deliberately drops the remainder.
 */
export function projectTabHref(pathname: string, target: ProjectRefSource): string {
  const tab = pathname.match(/^\/projects\/[^/]+\/([^/]+)/)?.[1];
  return tab && PROJECT_TABS.has(tab)
    ? projectPath(target, tab as ProjectTab)
    : projectPath(target);
}
