export function pagesHref(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/pages`;
}

export function pageHref(projectId: string, pageId: string): string {
  return `${pagesHref(projectId)}/${encodeURIComponent(pageId)}`;
}

/**
 * Pages keep their shell and editor router on the client. Next.js observes
 * native history changes, so internal document switches do not need a new RSC
 * payload before the cached document can be displayed.
 */
export function pushPagesHistory(
  href: string,
  history: Pick<History, "pushState"> = window.history,
): void {
  history.pushState(null, "", href);
}

export function replacePagesHistory(
  href: string,
  history: Pick<History, "replaceState"> = window.history,
): void {
  history.replaceState(null, "", href);
}
