/** Project id derived from the current URL (`/projects/[id]/…`), else null. */
export function projectIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)/);
  return match ? match[1] : null;
}

const PROJECT_TABS = new Set([
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
export function projectTabHref(pathname: string, targetProjectId: string): string {
  const tab = pathname.match(/^\/projects\/[^/]+\/([^/]+)/)?.[1];
  const base = `/projects/${targetProjectId}`;
  return tab && PROJECT_TABS.has(tab) ? `${base}/${tab}` : base;
}
