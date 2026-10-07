"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Skeleton } from "mangue-ui";
import { AppTabRouteProvider } from "@/lib/app-tab-route-context";
import { useAppNavigation } from "@/lib/use-app-router";
import { AgentsPlanGate } from "@/components/billing/agents-plan-gate";
import type { SidebarBrowseTarget } from "@/components/secondary-sidebar";
import type { MobileMenuNavigation } from "@/components/mobile-navigation";

const loading = () => <div className="flex flex-col gap-2 pt-2" aria-busy="true">
  {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-14 rounded-lg" />)}
</div>;
const PullRequests = dynamic(() => import("./pull-requests/pull-requests-page").then((module) => module.PullRequestsPage), { loading, ssr: false });
const Routines = dynamic(() => import("./routines/routines-panel").then((module) => module.RoutinesPanel), { loading, ssr: false });
const Objectives = dynamic(() => import("./objectives/objectives-page").then((module) => module.ObjectivesCollection), { loading, ssr: false });
const Triage = dynamic(() => import("./triage/triage-page").then((module) => module.TriagePage), { loading, ssr: false });
const Feedback = dynamic(() => import("./feedback/feedback-team-page").then((module) => module.FeedbackTeamPage), { loading, ssr: false });
const AccountSettings = dynamic(() => import("./settings/account-settings-page"), { loading, ssr: false });
const ProjectSettings = dynamic(() => import("./settings/project-settings-page"), { loading, ssr: false });
const Pages = dynamic(() => import("./pages/pages-shell").then((module) => module.PagesShell), { loading, ssr: false });

/** The real collection owns its navigation state while the current page stays put. */
function BrowseCollection({ href, navigation, children }: {
  href: string;
  navigation: MobileMenuNavigation;
  children: (browse: SidebarBrowseTarget) => ReactNode;
}) {
  const router = useRouter();
  const open = useAppNavigation();
  const { onNavigate, headerHost } = navigation;
  const select = useCallback((destination: string) => {
    open(destination, () => { onNavigate(); router.push(destination); });
  }, [open, onNavigate, router]);
  const browse = useMemo(() => ({ headerHost, onSelect: select }), [headerHost, select]);
  const route = useMemo(() => ({ pathname: href, search: "", projectId: href.match(/^\/projects\/([^/]+)/)?.[1] ?? null }), [href]);
  return <AppTabRouteProvider route={route} active={false}>{children(browse)}</AppTabRouteProvider>;
}

export function MobilePullRequestsMenu(navigation: MobileMenuNavigation) {
  return <BrowseCollection href="/pull-requests" navigation={navigation}>{(browse) => <AgentsPlanGate><PullRequests browse={browse} /></AgentsPlanGate>}</BrowseCollection>;
}

export function MobileRoutinesMenu(navigation: MobileMenuNavigation) {
  return <BrowseCollection href="/routines" navigation={navigation}>{(browse) => <AgentsPlanGate><Routines browse={browse} selectedId={null} onSelect={(id) => browse.onSelect(id ? `/routines?routine=${encodeURIComponent(id)}` : "/routines")} /></AgentsPlanGate>}</BrowseCollection>;
}

export function MobileProjectMenu({ projectId, kind, ...navigation }: {
  projectId: string;
  kind: "objectives" | "pages" | "triage" | "feedback";
} & MobileMenuNavigation) {
  return <BrowseCollection href={`/projects/${projectId}/${kind}`} navigation={navigation}>{(browse) =>
    kind === "objectives" ? <Objectives projectId={projectId} browse={browse} /> :
    kind === "pages" ? <Pages browse={browse} /> :
    kind === "triage" ? <Triage browse={browse} /> : <Feedback browse={browse} />
  }</BrowseCollection>;
}

export function MobileSettingsMenu({ projectId, ...navigation }: { projectId?: string } & MobileMenuNavigation) {
  return <BrowseCollection href={projectId ? `/projects/${projectId}/settings` : "/settings"} navigation={navigation}>{(browse) =>
    projectId ? <ProjectSettings projectId={projectId} browse={browse} /> : <AccountSettings browse={browse} />
  }</BrowseCollection>;
}
