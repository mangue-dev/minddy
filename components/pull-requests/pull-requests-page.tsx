"use client";

import { TruncatedText } from "@/components/ui/truncated-text";
import { useMobileCollectionState } from "@/lib/mobile-collection-state";

import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, FilterIcon, GitPullRequestIcon, Link02Icon, UserGroupIcon, TaskDone01Icon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { loadPullRequestDetailSurface, preparedPullRequestDetailSurface } from "@/lib/app-tab-surfaces";
import { useRouter } from "next/navigation";
import { useOptionalAppTabNavigation } from "@/lib/app-tab-navigation-context";
import { canConsumePrDeepLink } from "@/lib/pr-navigation";
import { AppTabRouteBoundary, useAppTabActive, useAppTabRoute } from "@/lib/app-tab-route-context";
import { useFormatter, useTranslations } from "next-intl";
import { type InfiniteData, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useRetainedWhileClosing } from "@/lib/use-retained-while-closing";
import { PrDetailSkeleton, PrListSkeleton } from "@/components/pull-requests/pr-loading-skeleton";
import { EmptyScene } from "@/components/empty-scene";
import { ReadFailureNotice } from "@/components/read-failure-notice";
import { pullRequestReadFailureMessage } from "./pr-read-failure";
import { GitLogin } from "@/components/git/git-login";
import { UserAvatar } from "@/components/user-avatar";
import { useMyAvatarSource } from "@/lib/use-my-avatar";
import { ForgeUserAvatar } from "@/components/git/forge-user-avatar";
import { linkedIssues } from "./pr-linked-issues";
import { PrReadinessIcon } from "@/components/pull-requests/pr-readiness";
import { PrStateBadge } from "@/components/pull-requests/pr-state-badge";
import { SearchMenu } from "@/components/search-menu";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { ProjectOrb } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import {
  COMPLETED_PULL_REQUESTS_PAGE,
  DEFAULT_PULL_REQUEST_SECTIONS,
  PULL_REQUEST_SECTIONS,
  pullRequestSection,
  groupPullRequestsBySection,
  type PullRequestSection,
} from "@/lib/pull-request-sections";
import { checkedProps } from "@/components/search-select";
import { CollectionSidebar, type SidebarBrowseTarget } from "@/components/secondary-sidebar";
import { usePrContextActions } from "@/components/pull-requests/pr-context-actions";
import { matchesFilter } from "@/components/sidebar-filter-field";
import {
  PROJECT_GROUP_INDENT,
  PROJECT_GROUP_LIMIT,
  SidebarProjectGroup,
  toggledSet,
} from "@/components/sidebar-project-group";
import {
  PULL_REQUESTS_PAGE,
  useAllPullRequestsQuery,
  useCompletedPullRequestsQuery,
  usePullRequestReadinessBatchQuery,
} from "@/lib/use-agent-runs";
import { useAssistantContext } from "@/lib/assistant-panel-context";
import { usePublishCurrentView } from "@/lib/current-view-context";
import { useProjects } from "@/lib/projects-context";
import { issueIdentifier } from "@/lib/issue-constants";
import { prIdentifier } from "@/lib/repo-providers";
import { SIDEBAR_COMPACT_CONTROL_CLASS } from "@/lib/sidebar-control-styles";
import type { MessageKey } from "@/lib/i18n-keys";
import type {
  AgentRunPrResponse,
  PullRequestListItem,
  PullRequestListResponse,
} from "@/lib/agent-api";
import {
  ALL_PULL_REQUESTS_QUERY_KEY,
  updateCachedPullRequestState,
} from "@/lib/pull-request-list-cache";
import {
  consumedDeepLinkHref,
  deepLinkLensDecision,
  isTerminalPrState,
} from "@/lib/sidebar-deep-link";

const PrDetail = dynamic(
  loadPullRequestDetailSurface,
  {
    ssr: false,
    loading: () => <PrDetailSkeleton />,
  },
);

const PrIssuePanel = dynamic(
  () =>
    import("@/components/pull-requests/pr-issue-panel").then(
      (m) => m.PrIssuePanel,
    ),
  { ssr: false },
);

function shouldShowPullRequestReadiness(
  state: PullRequestListItem["pr_state"],
): boolean {
  return state === "draft" || state === "open";
}

const SECTION_LABELS: Record<PullRequestSection, MessageKey<"PullRequests">> = {
  created: "sectionCreatedByMe",
  review: "sectionMyReview",
  team: "sectionTeamReview",
  completed: "sectionCompleted",
};
const SECTION_ICONS = {
  review: GitPullRequestIcon,
  team: UserGroupIcon,
  completed: TaskDone01Icon,
};

function PrCreatedSectionAvatar() {
  const source = useMyAvatarSource();
  return <UserAvatar seed={source} className="size-4 shrink-0" />;
}

function PrSectionIcon({ section, className = "size-4 shrink-0 text-muted-foreground" }: { section: PullRequestSection; className?: string }) {
  return section === "created"
    ? <PrCreatedSectionAvatar />
    : <HugeiconsIcon icon={SECTION_ICONS[section]} className={className} />;
}

/** Sections are independent toggles; changing one keeps the menu open. */
/** A failed list read is not an empty account: never answer it with "link a repository". */
function PrListReadFailed({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useTranslations("PullRequests");
  return <ReadFailureNotice error={error} className="px-4 py-10" retryLabel={t("readRetry")} onRetry={onRetry}
    message={pullRequestReadFailureMessage(t, error, "list")} />;
}

function PrFilterMenu({
  sections,
  onToggle,
}: {
  sections: ReadonlySet<string>;
  onToggle: (section: PullRequestSection) => void;
}) {
  const t = useTranslations("PullRequests");
  const [open, setOpen] = useState(false);
  const active = sections.size !== DEFAULT_PULL_REQUEST_SECTIONS.length ||
    DEFAULT_PULL_REQUEST_SECTIONS.some((section) => !sections.has(section));
  return (
    <SearchMenu
      open={open}
      onOpenChange={setOpen}
      align="end"
      tooltip={t("filterSections")}
      trigger={
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn(SIDEBAR_COMPACT_CONTROL_CLASS, "-mr-2")}
          aria-label={t("filterSections")}
        >
          <span className="relative flex items-center justify-center">
            <HugeiconsIcon icon={FilterIcon} className="size-[18px]" />
            {active ? (
              <span aria-hidden className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary ring-2 ring-sidebar" />
            ) : null}
          </span>
        </Button>
      }
    >
      <CommandGroup heading={t("filterSectionsLabel")}>
        {PULL_REQUEST_SECTIONS.map((section) => (
          <CommandItem
            key={section}
            value={section}
            keywords={[t(SECTION_LABELS[section])]}
            onSelect={() => onToggle(section)}
            {...checkedProps(sections.has(section))}
          >
            <PrSectionIcon section={section} className="size-4" />
            <span className="truncate">{t(SECTION_LABELS[section])}</span>
          </CommandItem>
        ))}
      </CommandGroup>
    </SearchMenu>
  );
}

/**
 * A pull request in the list. She says what she was already saying — identifying,
 * linked ticket, status, date, title, author — LESS his project, which is written
 * above it by the accordion and no longer has to be done once per line.
 */
function PrRow({
  pr,
  readiness,
  readinessUnavailable,
  selected,
  dateLabel,
  onSelect,
}: {
  pr: PullRequestListItem;
  readiness: NonNullable<AgentRunPrResponse["readiness"]> | null;
  readinessUnavailable: boolean;
  selected: boolean;
  dateLabel: string;
  onSelect: () => void;
}) {
  // The PR identifier first — it's THIS line we're looking at; the ticket
  // linked is read on the right, behind a link icon that names the association.
  const identifier = prIdentifier(pr.provider, pr.pr_number);
  const linkedIssue =
    pr.issue && pr.project ? issueIdentifier(pr.project.key, pr.issue.number) : null;
  const showReadiness = shouldShowPullRequestReadiness(pr.pr_state);

  return (
    <button
      type="button"
      data-sidebar-filter-result
      data-navigation-href={`/pull-requests?pr=${encodeURIComponent(pr.prId)}`}
      data-pr-id={pr.prId}
      onClick={onSelect}
      // The DERIVED selection of the page, not the CLICKS state: both
      // diverge in the two most common opening cases — upon arrival
      // on the page (nothing has been clicked, the first PR is displayed) and on a
      // `?run=`, resolved in PR without going through the state. The list did not highlight
      // then nothing, in front of a well and truly open PR.
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex flex-col gap-1 rounded-lg py-2 pr-2 text-left outline-none transition-colors",
        PROJECT_GROUP_INDENT,
        selected ? "bg-muted" : "hover:bg-muted/60 focus-visible:bg-muted/60",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex min-w-0 items-center gap-1 font-mono text-xs text-muted-foreground">
          {pr.project ? (
            <AppTooltip label={pr.project.name}>
              <span aria-label={pr.project.name} data-testid="pr-sidebar-project-logo" className="mr-0.5 flex shrink-0">
                <ProjectOrb seed={projectOrbSeed(pr.project)} iconUrl={pr.project.icon_url} className="size-3.5" />
              </span>
            </AppTooltip>
          ) : null}
          <span className="shrink-0 text-foreground">{identifier}</span>
          {linkedIssue ? (
            <>
              <HugeiconsIcon icon={Link02Icon} data-testid="pr-sidebar-issue-link-icon" className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{linkedIssue}</span>
              {linkedIssues(pr).length > 1 ? <span className="shrink-0">+{linkedIssues(pr).length - 1}</span> : null}
            </>
          ) : null}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <PrStateBadge state={pr.pr_state} className="h-5 px-2 text-[10px]" />
          {showReadiness ? (
            <PrReadinessIcon
              readiness={readiness}
              unavailable={readinessUnavailable}
            />
          ) : null}
        </span>
      </div>
      <TruncatedText
        text={pr.title ?? pr.issue?.title ?? identifier}
        className="line-clamp-2 text-sm font-medium"
      />
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        {/* THE AUTHOR, as the forge reports it. */}
        <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
          {pr.author ? (
            <ForgeUserAvatar
              user={pr.author}
              className="size-3.5 shrink-0"
            />
          ) : null}
          <GitLogin login={pr.author?.login} className="text-xs" />
        </span>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{dateLabel}</span>
      </span>
    </button>
  );
}

/** A review queue, using the same accordion shell as the other sidebars. */
function PrGroupRows({
  group,
  readinessByPrId,
  unavailablePrIds,
  readinessError,
  open,
  showAll,
  collapsible,
  selectedId,
  fmtDay,
  onToggle,
  onShowAll,
  onSelect,
  hasNextPage,
  fetchingNextPage,
  loadingInitialPage,
  onLoadNextPage,
}: {
  group: { key: PullRequestSection; items: PullRequestListItem[] };
  readinessByPrId: Record<string, NonNullable<AgentRunPrResponse["readiness"]>>;
  unavailablePrIds: ReadonlySet<string>;
  readinessError: boolean;
  open: boolean;
  showAll: boolean;
  collapsible: boolean;
  selectedId: string | null;
  fmtDay: (at: string) => string;
  onToggle: () => void;
  onShowAll: () => void;
  onSelect: (prId: string) => void;
  hasNextPage: boolean;
  fetchingNextPage: boolean;
  loadingInitialPage: boolean;
  onLoadNextPage: () => void;
}) {
  const tCommon = useTranslations("Common");
  const t = useTranslations("PullRequests");
  const prs = group.items;

  // The OPEN PR remains visible: if it is beyond the first five, the
  // cut goes down to it rather than hiding it.
  const selectedIndex = prs.findIndex((p) => p.prId === selectedId);
  const shown = showAll || group.key === "completed"
    ? prs
    : prs.slice(0, Math.max(PROJECT_GROUP_LIMIT, selectedIndex + 1));

  return (
    <SidebarProjectGroup
      project={null}
      fallbackLabel={t(SECTION_LABELS[group.key])}
      headerIcon={<PrSectionIcon section={group.key} />}
      open={open}
      collapsible={collapsible}
      onToggle={onToggle}
      hiddenCount={prs.length - shown.length}
      onShowAll={onShowAll}
      showMoreLabel={tCommon("showMore")}
    >
      {shown.map((pr) => (
        <PrRow
          key={pr.prId}
          pr={pr}
          readiness={readinessByPrId[pr.prId] ?? null}
          readinessUnavailable={readinessError || unavailablePrIds.has(pr.prId)}
          selected={pr.prId === selectedId}
          dateLabel={fmtDay(pr.updated_at)}
          onSelect={() => onSelect(pr.prId)}
        />
      ))}
      {group.key === "completed" && (loadingInitialPage || fetchingNextPage) ? (
        <div aria-busy="true" data-testid="pr-sidebar-loading">
          <PrListSkeleton rows={COMPLETED_PULL_REQUESTS_PAGE} showHeading={false} />
        </div>
      ) : null}
      {group.key === "completed" && hasNextPage ? (
        <Button variant="ghost" size="sm" className="self-start ml-8" disabled={fetchingNextPage}
          onClick={onLoadNextPage} data-testid="pr-completed-load-more">
          {tCommon("showMore")}
        </Button>
      ) : null}
    </SidebarProjectGroup>
  );
}

export function PullRequestsPage({ browse }: { browse?: SidebarBrowseTarget } = {}) {
  return <AppTabRouteBoundary><PullRequestsPageInner browse={browse} /></AppTabRouteBoundary>;
}

function PullRequestsPageInner({ browse }: { browse?: SidebarBrowseTarget }) {
  // Keep the mounted renderer stable when public code finishes preparing later.
  const [DetailSurface] = useState(() => preparedPullRequestDetailSurface() ?? PrDetail);
  const t = useTranslations("PullRequests");
  const tProjects = useTranslations("Projects");
  const tCommon = useTranslations("Common");
  const format = useFormatter();
  const router = useRouter();
  const tabActive = useAppTabActive();
  const navigation = useOptionalAppTabNavigation();
  const { projects, openCreateProject, loading: projectsLoading } = useProjects();
  const queryClient = useQueryClient();

  // Deep-link: `?pr=<id>` (MIN-143) preselects the PR. A hidden active
  // section is enabled once when the target resolves; completed PRs require
  // an explicit filter choice.
  const { searchParams } = useAppTabRoute();
  const prParam = searchParams.get("pr");
  const deepLink = prParam;

  /**
   * The deep link is CONSUMED, not kept. Its job — put the target on screen,
   * widening the lens once if needed — ends there; past that a stale `?pr=`
   * re-pins its row into every refetch and re-widens the lens on each load,
   * which made the “open” filter impossible to restore after a merge (the
   * refetch re-pinned the merged row into the “open” response, the widening
   * effect saw a target outside the lens and forced “all”, again and again).
   * The selection stays in memory and the published view keeps `?pr=`; only
   * the address stops carrying the link.
   */
  const consumeDeepLink = useCallback(() => {
    if (!deepLink) return;
    const expected = `/pull-requests?${searchParams.toString()}`;
    if (!canConsumePrDeepLink(expected, navigation?.activeId ?? null,
      navigation?.session.getSnapshot(), window.location.pathname + window.location.search)) return;
    router.replace(
      consumedDeepLinkHref("/pull-requests", searchParams.toString()),
      { scroll: false },
    );
  }, [deepLink, navigation, router, searchParams]);

  const [sections, setSections] = useMobileCollectionState<ReadonlySet<string>>("/pull-requests", "sections", () => new Set(DEFAULT_PULL_REQUEST_SECTIONS));
  const [query, setQuery] = useMobileCollectionState("/pull-requests", "query", "");
  const [limit, setLimit] = useMobileCollectionState("/pull-requests", "limit", PULL_REQUESTS_PAGE);
  const [selectedPrId, setSelectedPrId] = useState<string | null>(prParam);
  // Related issue open in side panel (on top of page, no navigation).
  const [panel, setPanel] = useState<{ projectId: string; issueId: string } | null>(null);
  // Stays mounted, closed, while the panel slides out (MIN-774).
  const shownPanel = useRetainedWhileClosing(panel);
  // Sections start expanded; each keeps its own collapse and show-more state.
  const [collapsedGroups, setCollapsedGroups] = useMobileCollectionState<ReadonlySet<string>>("/pull-requests", "collapsedGroups",
    () => new Set(),
  );
  const [expandedGroups, setExpandedGroups] = useMobileCollectionState<ReadonlySet<string>>("/pull-requests", "expandedGroups",
    () => new Set(),
  );

  /** Collapsing a section resets its list to the first five PRs. */
  const toggleGroup = (key: string) => {
    const wasOpen = !collapsedGroups.has(key);
    setCollapsedGroups((prev) => toggledSet(prev, key));
    if (wasOpen && expandedGroups.has(key)) {
      setExpandedGroups((prev) => toggledSet(prev, key));
    }
  };

  // The deep-link is PINED on the server side: the targeted PR enters the response
  // even if it falls off the page (a PR from six months ago). Without that, the
  // link would fall to the first in the list — the PR of another ticket.
  // The pin lives only as long as the link does: once consumed, the address
  // stops carrying `pr` and the lens decides who belongs to the list.
  const pin = useMemo(() => ({ pr: prParam }), [prParam]);
  const active = useAllPullRequestsQuery("open", limit, pin);
  const completed = useCompletedPullRequestsQuery(sections.has("completed"));
  const { hasMore, repoCount, anyPr, loading, readFailed } = active;
  const fetching = active.fetching || completed.isFetching;
  const truncated = active.truncated || completed.data?.pages.some((page) => page.truncated);
  /**
   * The PR the reader had open when it reached a terminal state (merged or
   * closed) from this page. It stays in the list and on screen even after it
   * leaves the lens, so merging never moves the focus to another PR; picking
   * another row releases it.
   */
  const [retainedPrId, setRetainedPrId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  // The last row seen for the selection: a refetch of the "open" lens drops
  // the merged row, and the retained PR must still have a row to render.
  const selectedRowRef = useRef<PullRequestListItem | null>(null);
  const pullRequests = useMemo(() => {
    const rows = new Map([
      ...active.pullRequests, ...completed.pullRequests,
    ].map((pr) => [pr.prId, pr]));
    const retainedRow = selectedRowRef.current;
    if (retainedPrId && retainedRow?.prId === retainedPrId && !rows.has(retainedPrId)) {
      rows.set(retainedPrId, retainedRow);
    }
    return [...rows.values()];
  }, [active.pullRequests, completed.pullRequests, retainedPrId]);
  const selectPr = useCallback((prId: string) => {
    setSelectedPrId(prId);
    setRetainedPrId((current) => (current === prId ? current : null));
  }, []);
  const refetch = () => {
    void active.refetch();
    if (sections.has("completed")) void completed.refetch();
  };

  // Tracks param changes (client navigation to another PR).
  useEffect(() => {
    if (!deepLink) return;
    if (prParam) setSelectedPrId(prParam);
  }, [deepLink, prParam]);

  // The PR the deep link resolved to, kept in a ref: the confirmed-state
  // callback below recognizes it without being re-created on every list
  // update. The LAST resolved target survives — an optimistic state change
  // removes the row from the list before the forge confirms, and the ref
  // must still name the PR whose link is being fulfilled.
  const deepLinkTargetRef = useRef<string | null>(null);
  if (prParam) deepLinkTargetRef.current = prParam;

  /**
   * Settle each resolved link once, even when its target is completed and
   * remains outside the filter. Only active sections may be enabled by a
   * link; refetches and retained tabs must never enable completed PRs.
   * Removing the link resets settlement for a later navigation.
   */
  const settledDeepLinkRef = useRef<string | null>(null);
  useEffect(() => {
    if (!deepLink) {
      settledDeepLinkRef.current = null;
      return;
    }
    if (settledDeepLinkRef.current === deepLink) return;
    const isTarget = (pullRequest: PullRequestListItem) =>
      pullRequest.prId === prParam;
    const decision = deepLinkLensDecision(
      pullRequests,
      isTarget,
      (pullRequest) => sections.has(pullRequestSection(pullRequest)),
    );
    if (decision === "pending") return;
    settledDeepLinkRef.current = deepLink;
    if (decision === "widen") {
      const target = pullRequests.find(isTarget)!;
      const section = pullRequestSection(target);
      if (section !== "completed") {
        setSections((previous) => new Set([...previous, section]));
      }
    }
  }, [deepLink, sections, prParam, pullRequests]);

  // Forging actions are slow, but their state is known from the click: we
  // patches the list before the response, then reconciles with the server. THE
  // snapshot allows you to put the lists exactly back in place if the forge
  // ultimately refuses the action (branch protection, rights withdrawn, etc.).
  const applyOptimisticState = useCallback(
    (prId: string, state: PullRequestListItem["pr_state"]) => {
      const previous = queryClient.getQueriesData<PullRequestListResponse | InfiniteData<PullRequestListResponse>>({
        queryKey: ALL_PULL_REQUESTS_QUERY_KEY,
      });
      const previousDetail = queryClient.getQueryData<AgentRunPrResponse>([
        "pull-request",
        prId,
      ]);
      updateCachedPullRequestState(queryClient, prId, state);
      if (isTerminalPrState(state) && prId === selectedIdRef.current) {
        setSelectedPrId(prId);
        setRetainedPrId(prId);
      }
      return () => {
        for (const [key, data] of previous) queryClient.setQueryData(key, data);
        queryClient.setQueryData(["pull-request", prId], previousDetail);
      };
    },
    [queryClient],
  );

  const applyConfirmedState = useCallback(
    (prId: string, state: PullRequestListItem["pr_state"]) => {
      updateCachedPullRequestState(queryClient, prId, state);
      // A terminal target fulfills the link; consume it to stop pinning the
      // excluded row into refetches. Wait for confirmation so a refused merge
      // (branch protection, lost rights) keeps the link.
      if (isTerminalPrState(state) && prId === deepLinkTargetRef.current) {
        consumeDeepLink();
      }
    },
    [consumeDeepLink, queryClient],
  );

  const filtered = useMemo(
    () => pullRequests.filter((pr) =>
      pr.prId === retainedPrId || sections.has(pullRequestSection(pr))),
    [pullRequests, retainedPrId, sections],
  );

  /**
   * "Merge" from a row's menu opens that pull request on its merge dialog
   * (MIN-685). The request is held here until the detail has handled it;
   * a browsed list carries it in the address (`&action=merge`) instead.
   */
  const actionParam = browse ? null : searchParams.get("action");
  const [mergeIntentPrId, setMergeIntentPrId] = useState<string | null>(null);
  useEffect(() => {
    if (!tabActive || actionParam !== "merge" || !prParam) return;
    setMergeIntentPrId(prParam);
    const remaining = new URLSearchParams(searchParams);
    remaining.delete("action");
    router.replace(`/pull-requests${remaining.size ? `?${remaining}` : ""}`, { scroll: false });
  }, [tabActive, actionParam, prParam, router, searchParams]);
  const prContext = usePrContextActions({
    pullRequests,
    onOptimisticStateChange: applyOptimisticState,
    onStateChange: applyConfirmedState,
    onRefetchList: () => void refetch(),
    onMerge: (prId) => {
      if (browse) {
        browse.onSelect(`/pull-requests?pr=${encodeURIComponent(prId)}&action=merge`);
        return;
      }
      selectPr(prId);
      setMergeIntentPrId(prId);
    },
  });

  /**
   * What the column DISPLAYS. Distinct from `filtered`, the selection of which is
   * derived: the text filter must not move it. Otherwise each keystroke
   * would drop the detail onto the first remaining line — and start again
   * search for its diff, once per letter.
   *
   * The fields sought are those that are READ on a line, plus the branch:
   * it's often his name that we have in mind for a PR that we have just pushed.
   */
  const visible = useMemo(() => {
    if (!query.trim()) return filtered;
    return filtered.filter((p) =>
      matchesFilter(query, [
        p.title,
        p.head_branch,
        p.author?.login,
        `#${p.pr_number}`,
        p.project?.name,
        ...linkedIssues(p).flatMap((issue) => [issue.title, issueIdentifier(issue.project_key, issue.number)]),
        p.project && p.issue
          ? issueIdentifier(p.project.key, p.issue.number)
          : null,
      ]),
    );
  }, [filtered, query]);

  /**
   * The selection is DERIVED, not guarded by an effect.
   *
   * It was: one effect resolved the deep-link, a second reset the
   * selection in the filter. Both were triggered at the same rendering — the one where
   * the list arrives — and the second overwrites the first, opening the FIRST PR
   * of the list instead of that of the link. Measured: a link to PR #1
   * opened PR #17.
   *
   * The order below SAYS the rule, instead of making it emerge from a race:
   * the user clicks first (while it is in the filter), then the
   * deep-link, then the first in the list — and nothing as long as a fetch is in effect.
   * flight, otherwise we would open a defect just before the good PR arrives.
   *
   * Merging or closing the PR on screen keeps it selected: `retainedPrId`
   * holds its row in the list although it left the lens. The filter stays
   * where it is — widening it is the READER's gesture (the filter menu),
   * never a side effect of the merge. Any other row that leaves the lens
   * (a refetch, a change made elsewhere) still releases its selection.
   */
  const clicked =
    selectedPrId && filtered.some((p) => p.prId === selectedPrId) ? selectedPrId : null;
  // A background refetch should never close the panel: it was the source of the
  // flashing each time you return to the window. Only a deep connection yet
  // being resolved waits for its response before taking the first PR.
  const waitingForDeepLink = !!deepLink && fetching && !clicked;
  const selectedId =
    clicked ??
    (waitingForDeepLink ? null : (filtered[0]?.prId ?? null));
  const selected = filtered.find((p) => p.prId === selectedId) ?? null;
  selectedIdRef.current = selectedId;
  if (selected) selectedRowRef.current = selected;

  // The open PR is a selection of the page, derived rather than pushed into
  // the address — `?pr=` is precisely what restores it in an app tab (and the pin on the server side, even if it's six months old).
  usePublishCurrentView(browse ? null : {
    href: selected ? `/pull-requests?pr=${encodeURIComponent(selected.prId)}` : "/pull-requests",
  });

  // Publish the selected PR to Numo even when it has no linked issue. The PR id
  // is the stable repository-work anchor; issue details remain optional context.
  useAssistantContext(
    !browse && selected && selected.project
      ? {
          projectId: selected.project.id,
          pullRequestId: selected.prId,
          prNumber: selected.pr_number,
          prState: selected.pr_state,
          prHeadRef: selected.head_branch ?? undefined,
          ...(selected.issue
            ? {
                issueId: selected.issue.id,
                issueIdentifier: issueIdentifier(
                  selected.project.key,
                  selected.issue.number,
                ),
                issueTitle: selected.issue.title,
              }
            : {}),
        }
      : null,
  );

  const groups = useMemo(() => {
    const grouped = groupPullRequestsBySection(visible);
    if (sections.has("completed") && completed.isPending && !grouped.some((group) => group.key === "completed")) {
      grouped.push({ key: "completed", items: [] });
    }
    return grouped;
  }, [visible, sections, completed.isPending]);
  // A filter in progress UNFOLDS everything and lifts the cup of five: searching is
  // ask to see what fits, not to know where it is stored.
  const filtering = query.trim().length > 0;

  const readinessPrIds = useMemo(() => {
    const ids: string[] = [];
    for (const group of groups) {
      const open = filtering || !collapsedGroups.has(group.key);
      if (!open) continue;
      const selectedIndex = group.items.findIndex((p) => p.prId === selectedId);
      const showAll = filtering || expandedGroups.has(group.key);
      const shown = showAll
        ? group.items
        : group.items.slice(0, Math.max(PROJECT_GROUP_LIMIT, selectedIndex + 1));
      ids.push(
        ...shown
          .filter((pr) => shouldShowPullRequestReadiness(pr.pr_state))
          .map((pr) => pr.prId),
      );
    }
    return ids;
  }, [collapsedGroups, expandedGroups, filtering, groups, selectedId]);
  const {
    readinessByPrId,
    unavailablePrIds,
    error: readinessError,
  } = usePullRequestReadinessBatchQuery(readinessPrIds);

  const fmtDay = (at: string): string =>
    format.dateTime(new Date(at), { day: "numeric", month: "short" });

  /**
   * Nothing to list NOWHERE — to be distinguished from a filter without results, which keeps
   * its little box in the column. Three steps, in the order in which they are
   * crosses: a project, a linked repository, then pull requests. `anyPr` account
   * all states, otherwise “none open” would pass for “none ever”.
   */
  const sidebar = (
      <CollectionSidebar browse={browse}
        title={t("title")}
        itemContextActions={prContext.itemContextActions}
        onItemContextMenu={prContext.onItemContextMenu}
        hiddenOnMobile
        filter={{
          value: query,
          onChange: setQuery,
          placeholder: t("filterPlaceholder", { count: visible.length }),
          clearLabel: tCommon("clearFilter"),
        }}
        actions={
          <PrFilterMenu
            sections={sections}
            onToggle={(section) => {
              consumeDeepLink();
              // Settle before toggling so a pinned target cannot restore a hidden section.
              settledDeepLinkRef.current = deepLink;
              setSections((previous) => toggledSet(previous, section));
              setLimit(PULL_REQUESTS_PAGE);
            }}
          />
        }
      >
        {loading ? (
          <div aria-busy="true" data-testid="pr-sidebar-loading">
            <PrListSkeleton />
          </div>
        ) : readFailed ? (
          <PrListReadFailed error={active.readError} onRetry={() => void active.refetch()} />
        ) : groups.length === 0 ? (
          <EmptyScene
            size="compact"
            icon={GitPullRequestIcon}
            title={projects.length === 0 ? t("emptyNoProject") : repoCount === 0 ? t("emptyNoRepo") : !anyPr ? t("emptyNone") : query.trim() ? tCommon("noFilterMatch") : t("emptySections")}
            className="py-10"
          >
            {projects.length === 0 ? (
              <Button size="sm" onClick={openCreateProject}>
                <HugeiconsIcon icon={Add01Icon} />
                {tProjects("firstProject")}
              </Button>
            ) : query.trim() || !anyPr ? null : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // A manual lens pick: the deep link yields (see
                  // `consumeDeepLink`) — the filter the reader chose rules.
                  consumeDeepLink();
                  settledDeepLinkRef.current = deepLink;
                  setSections(new Set(PULL_REQUEST_SECTIONS));
                  setLimit(PULL_REQUESTS_PAGE);
                }}
              >
                {t("emptyShowAll")}
              </Button>
            )}
          </EmptyScene>
        ) : (
          <div className="flex flex-col gap-2 pt-2 pb-4">
            {groups.map((g) => (
              <PrGroupRows
                key={g.key}
                group={g}
                readinessByPrId={readinessByPrId}
                unavailablePrIds={unavailablePrIds}
                readinessError={readinessError}
                open={filtering || !collapsedGroups.has(g.key)}
                showAll={filtering || expandedGroups.has(g.key)}
                collapsible={!filtering}
                selectedId={selectedId}
                fmtDay={fmtDay}
                hasNextPage={completed.hasNextPage}
                fetchingNextPage={completed.isFetchingNextPage}
                loadingInitialPage={completed.isPending}
                onLoadNextPage={() => void completed.fetchNextPage()}
                onToggle={() => toggleGroup(g.key)}
                onShowAll={() => setExpandedGroups((prev) => toggledSet(prev, g.key))}
                onSelect={selectPr}
              />
            ))}

            {active.loadingMore ? (
              <div aria-busy="true" data-testid="pr-sidebar-loading">
                <PrListSkeleton showHeading={false} />
              </div>
            ) : null}
            {hasMore ? (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 self-center"
                disabled={active.fetching}
                onClick={() => setLimit((n) => n + PULL_REQUESTS_PAGE)}
              >
                {t("loadMore")}
              </Button>
            ) : null}

            {/* The pagination of a forge has been cut: say it, rather than
                let us believe that the list is complete. */}
            {truncated ? (
              <p className="px-3 pt-3 text-xs text-muted-foreground">{t("listTruncated")}</p>
            ) : null}
          </div>
        )}
      </CollectionSidebar>
  );

  if (browse) return <>{sidebar}{prContext.dialog}</>;

  if (!loading && readFailed) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <PrListReadFailed error={active.readError} onRetry={() => void active.refetch()} />
      </div>
    );
  }

  // Nothing to list yet: the column stays, with its search and filters and a
  // compact scene, next to the pane that says where pull requests come from.
  if (!loading && !projectsLoading && (projects.length === 0 || repoCount === 0 || !anyPr)) {
    return (
      <div className="flex h-full min-h-0">
        {sidebar}
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto max-w-5xl">
            {projects.length === 0 ? (
              <EmptyScene icon={GitPullRequestIcon} title={t("emptyNoProject")}>
                <Button onClick={openCreateProject}>
                  <HugeiconsIcon icon={Add01Icon} />
                  {tProjects("firstProject")}
                </Button>
              </EmptyScene>
            ) : (
              /* Without a linked deposit, there is no button to offer: the deposit is linked
                 in the settings OF ONE project, and we don't know which one. */
              <EmptyScene
                icon={GitPullRequestIcon}
                title={repoCount === 0 ? t("emptyNoRepo") : t("emptyNone")}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ── Left: pull request list ─────────────────────────────────────── */}
      {sidebar}

      {/* ── Right: detail of the PR ────────────────────────────────────── */}
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        {selected ? (
          <DetailSurface
            key={selected.prId}
            item={selected}
            onRefetchList={() => void refetch()}
            onOptimisticStateChange={applyOptimisticState}
            onStateChange={applyConfirmedState}
            onOpenIssue={(issueId, projectId) => setPanel({ projectId, issueId })}
            mergeIntent={mergeIntentPrId === selected.prId}
            onMergeIntentConsumed={() => setMergeIntentPrId(null)}
          />
        ) : loading ? (
          <PrDetailSkeleton />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <p className="text-sm text-muted-foreground">{t("noSelection")}</p>
          </div>
        )}
      </div>

      {prContext.dialog}

      {/* Linked issue side panel — overlay over the page (no nav). */}
      {shownPanel ? (
        <PrIssuePanel
          key={`${shownPanel.projectId}:${shownPanel.issueId}`}
          projectId={shownPanel.projectId}
          issueId={shownPanel.issueId}
          open={panel != null}
          onClose={() => setPanel(null)}
        />
      ) : null}
    </div>
  );
}
