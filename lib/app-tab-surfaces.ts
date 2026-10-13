import { retainedAppViewKind, type RetainedAppView } from "./retained-app-views";
import type { ComponentType } from "react";

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
  routines: () => import("@/app/(app)/routines/page"),
  objectives: () => import("@/app/(app)/projects/[id]/objectives/page"),
};
export const loadPullRequestDetailSurface = () => import("@/components/pull-requests/pr-detail").then((module) => module.PrDetail);
type PullRequestDetailSurface = Awaited<ReturnType<typeof loadPullRequestDetailSurface>>;
let preparedPrDetail: PullRequestDetailSurface | undefined;
export function preparedPullRequestDetailSurface(): PullRequestDetailSurface | undefined {
  return preparedPrDetail;
}
type SurfaceKind = RetainedAppView["kind"];
const surfaceKind = (href: string): SurfaceKind | null => {
  const pathname = href.split(/[?#]/)[0];
  return pathname === "/home" ? "home" : retainedAppViewKind(pathname);
};
const ready = new Set<SurfaceKind>();
const pending = new Map<SurfaceKind, Promise<unknown>>();
const preparedCollections = new Map<"routines" | "objectives", ComponentType>();
/** Preserve the prepared route wrapper, including its plan gate and route boundary. */
export function preparedCollectionSurface(kind: RetainedAppView["kind"]): ComponentType | undefined {
  return kind === "routines" || kind === "objectives" ? preparedCollections.get(kind) : undefined;
}
const preparedBoards = new Map<"global-board" | "project-board", ComponentType>();
export function preparedBoardSurface(kind: RetainedAppView["kind"]): ComponentType | undefined {
  return kind === "global-board" || kind === "project-board" ? preparedBoards.get(kind) : undefined;
}
export function prepareAppTabSurface(href: string): Promise<unknown> | undefined {
  const kind = surfaceKind(href);
  if (!kind) return;
  let operation = pending.get(kind);
  if (!operation) {
    operation = Promise.all([appTabSurfaceLoaders[kind](), ...(kind === "pull-requests" ? [loadPullRequestDetailSurface()] : [])])
      .then(([module, detail]) => {
        if (kind === "global-board") preparedBoards.set(kind, (module as Awaited<ReturnType<typeof appTabSurfaceLoaders["global-board"]>>).GlobalBoard);
        if (kind === "project-board") preparedBoards.set(kind, (module as Awaited<ReturnType<typeof appTabSurfaceLoaders["project-board"]>>).default);
        if (kind === "routines") preparedCollections.set(kind, (module as Awaited<ReturnType<typeof appTabSurfaceLoaders["routines"]>>).default);
        if (kind === "objectives") preparedCollections.set(kind, (module as Awaited<ReturnType<typeof appTabSurfaceLoaders["objectives"]>>).default);
        if (kind === "pull-requests") preparedPrDetail = detail as PullRequestDetailSurface;
        ready.add(kind); return module;
      });
    pending.set(kind, operation);
    void operation.catch(() => { pending.delete(kind); });
  }
  return operation;
}
export function isAppTabSurfaceReady(href: string): boolean {
  const kind = surfaceKind(href);
  return !!kind && ready.has(kind);
}
