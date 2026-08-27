/** Shared loaders for large app surfaces that are rendered through `next/dynamic`. */
export const loadCommandPalette = () => import("@/components/command-palette");

export const loadGlobalIssuePanel = () =>
  import("@/components/global-issue-panel");

export const loadIssueSidePanel = () => import("@/components/issue-side-panel");

export const loadScratchpadModal = () =>
  import("@/components/scratchpad/scratchpad-modal");

/** Start a best-effort preload without surfacing transient chunk failures. */
export function preloadSurface(loader: () => Promise<unknown>): void {
  void loader().catch(() => undefined);
}
