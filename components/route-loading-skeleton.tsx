import type { ComponentType } from "react";
import SettingsLoading from "@/app/(app)/settings/loading";
import InboxLoading from "@/app/(app)/inbox/loading";
import AdminLoading from "@/app/(app)/admin/loading";
import AllLoading from "@/app/(app)/all/loading";
import TrashLoading from "@/app/(app)/trash/loading";
import RoutinesLoading from "@/app/(app)/routines/loading";
import PullRequestsLoading from "@/app/(app)/pull-requests/loading";
import BillingLoading from "@/app/(app)/billing/loading";
import ProjectBoardLoading from "@/app/(app)/projects/[id]/loading";
import ProjectSettingsLoading from "@/app/(app)/projects/[id]/settings/loading";
import ObjectivesLoading from "@/app/(app)/projects/[id]/objectives/loading";
import TriageLoading from "@/app/(app)/projects/[id]/triage/loading";
import ProjectFeedbackLoading from "@/app/(app)/projects/[id]/feedback/loading";
import ProjectPagesLoading from "@/app/(app)/projects/[id]/pages/loading";

/**
 * The segment's own `loading.tsx` for a pathname, the one Next itself would
 * show (MIN-843): the shell paints it as soon as a navigation starts, so the
 * placeholder is the same whether the shell or the router got there first.
 * Most specific segment first, like Next resolves the nearest boundary.
 */
const ROUTE_LOADING: ReadonlyArray<readonly [RegExp, ComponentType]> = [
  [/^\/projects\/[^/]+\/settings(?:\/|$)/, ProjectSettingsLoading],
  [/^\/projects\/[^/]+\/objectives(?:\/|$)/, ObjectivesLoading],
  [/^\/projects\/[^/]+\/triage(?:\/|$)/, TriageLoading],
  [/^\/projects\/[^/]+\/feedback(?:\/|$)/, ProjectFeedbackLoading],
  [/^\/projects\/[^/]+\/pages(?:\/|$)/, ProjectPagesLoading],
  [/^\/projects\/[^/]+\/?$/, ProjectBoardLoading],
  // Personal statistics redirect to the profile settings.
  [/^\/(?:settings|statistics)(?:\/|$)/, SettingsLoading],
  [/^\/inbox(?:\/|$)/, InboxLoading],
  [/^\/admin(?:\/|$)/, AdminLoading],
  [/^\/all(?:\/|$)/, AllLoading],
  [/^\/trash(?:\/|$)/, TrashLoading],
  [/^\/routines(?:\/|$)/, RoutinesLoading],
  [/^\/pull-requests(?:\/|$)/, PullRequestsLoading],
  [/^\/billing(?:\/|$)/, BillingLoading],
];

export function routeLoadingComponent(pathname: string): ComponentType | null {
  return ROUTE_LOADING.find(([pattern]) => pattern.test(pathname))?.[1] ?? null;
}

/** A destination without its own boundary shows an empty panel rather than
 * the page being left. */
export function RouteLoadingSkeleton({ pathname }: { pathname: string }) {
  const Loading = routeLoadingComponent(pathname);
  return <div className="h-full min-h-0" data-pending-route={pathname} aria-busy="true">
    {Loading ? <Loading /> : null}
  </div>;
}
