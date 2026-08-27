/** Build the canonical client-side URL for an objective-filtered board. */
export function objectiveBoardHref(
  projectId: string,
  objectiveId: string,
): string {
  return `/projects/${encodeURIComponent(projectId)}?objective=${encodeURIComponent(objectiveId)}`;
}

/**
 * Objective switching only changes client-owned board scope. Next.js patches
 * the native History API into `useSearchParams`, so this updates the board and
 * browser history without requesting a new RSC payload for unchanged route
 * data.
 */
export function pushObjectiveBoardHistory(
  projectId: string,
  objectiveId: string,
  history: Pick<History, "pushState"> = window.history,
): void {
  history.pushState(null, "", objectiveBoardHref(projectId, objectiveId));
}
