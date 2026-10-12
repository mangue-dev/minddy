import { retainedAppViewKind, type RetainedAppView } from "./retained-app-views";

// Public code preparation is shared by the existing host and intent prefetch.
// This registry carries no account data and cannot certify data freshness.
export const appTabSurfaceLoaders = {
  home: () => import("@/app/(app)/home/page"),
  "global-board": () => import("@/components/global-board"),
  "project-board": () => import("@/app/(app)/projects/[id]/page"),
  pages: () => import("@/components/pages/pages-shell"),
  "pull-requests": () => import("@/app/(app)/pull-requests/page"),
  feedback: () => import("@/components/feedback/feedback-team-page"),
  triage: () => import("@/app/(app)/projects/[id]/triage/page"),
};
export const loadPullRequestDetailSurface = () => import("@/components/pull-requests/pr-detail").then((module) => module.PrDetail);
const surfaceKind = (href: string) => href.split(/[?#]/)[0] === "/home" ? "home" : retainedAppViewKind(href.split(/[?#]/)[0]);
const ready = new Set<RetainedAppView["kind"]>();
const pending = new Map<RetainedAppView["kind"], Promise<unknown>>();
export function prepareAppTabSurface(href: string): Promise<unknown> | undefined {
  const kind = surfaceKind(href);
  if (!kind) return;
  let operation = pending.get(kind);
  if (!operation) {
    operation = Promise.all([appTabSurfaceLoaders[kind](), ...(kind === "pull-requests" ? [loadPullRequestDetailSurface()] : [])])
      .then(([module]) => { ready.add(kind); return module; });
    pending.set(kind, operation);
    void operation.catch(() => { pending.delete(kind); });
  }
  return operation;
}
export function isAppTabSurfaceReady(href: string): boolean {
  const kind = surfaceKind(href);
  return !!kind && ready.has(kind);
}
