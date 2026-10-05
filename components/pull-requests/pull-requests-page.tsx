"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, FilterIcon, GitPullRequestIcon, Link02Icon, UserIcon, UserGroupIcon, TaskDone01Icon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useOptionalAppTabNavigation } from "@/lib/app-tab-navigation-context";
import { canConsumePrDeepLink } from "@/lib/pr-navigation";
import { AppTabRouteBoundary, useAppTabRoute } from "@/lib/app-tab-route-context";
import { useFormatter, useTranslations } from "next-intl";
import { type InfiniteData, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  CommandGroup,
  CommandItem,
  Spinner,
  cn,
} from "mangue-ui";
import { PrDetailSkeleton, PrListSkeleton } from "@/components/pull-requests/pr-loading-skeleton";
import { EmptyScene } from "@/components/empty-scene";
import { GitLogin } from "@/components/git/git-login";
import { ForgeUserAvatar } from "@/components/git/forge-user-avatar";
import { NumoIcon } from "@/components/numo-icon";
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
import { SecondarySidebar } from "@/components/secondary-sidebar";
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
  () => import("@/components/pull-requests/pr-detail").then((m) => m.PrDetail),
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
  created: UserIcon,
  review: GitPullRequestIcon,
  team: UserGroupIcon,
  completed: TaskDone01Icon,
};

/** Sections are independent toggles; changing one keeps the menu open. */
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
            <HugeiconsIcon icon={SECTION_ICONS[section]} className="size-4" />
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
  const t = useTranslations("PullRequests");
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
        {pr.activeRunId ? <Spinner className="size-3 shrink-0" /> : null}
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
      <span className="line-clamp-2 text-sm font-medium">
        {pr.title ?? pr.issue?.title ?? identifier}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        {/* THE AUTHOR: the forge's own, except for a PR Numo OPENED — there,
            the forge login depends on the installation (app account or linked
            account), and only the fact of the opening says Numo. A PR Numo
            merely corrected (a fix session bears the number without having
            opened it) keeps its human author. */}
        <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
          {pr.numoOpened ? (
            <NumoIcon animated={false} className="size-3.5 shrink-0" />
          ) : pr.author ? (
            <ForgeUserAvatar
              user={pr.author}
              className="size-3.5 shrink-0"
            />
          ) : null}
          {pr.numoOpened ? (
            <span className="truncate">{t("numoAuthor")}</span>
          ) : (
            <GitLogin login={pr.author?.login} className="text-xs" />
          )}
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
      headerIcon={<HugeiconsIcon icon={SECTION_ICONS[group.key]} className="size-4 shrink-0 text-muted-foreground" />}
      open={open}
      collapsible={collapsible}
      onToggle={onToggle}
      hiddenCount={prs.length - shown.length}
      onShowAll={onShowAll}
      showMoreLabel={tCommon("showMore")}
      // Folded, the header keeps the only signal that does not wait: an agent
      // working on one of these PRs.
      collapsedBadge={
        prs.some((p) => p.activeRunId) ? <Spinner className="size-3 shrink-0" /> : null
      }
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

export function PullRequestsPage() {
  return <AppTabRouteBoundary><PullRequestsPageInner /></AppTabRouteBoundary>;
}

function PullRequestsPageInner() {
  const t = useTranslations("PullRequests");
  const tProjects = useTranslations("Projects");
  const tCommon = useTranslations("Common");
  const format = useFormatter();
  const router = useRouter();
  const navigation = useOptionalAppTabNavigation();
  const { projects, openCreateProject, loading: projectsLoading } = useProjects();
  const queryClient = useQueryClient();

  // Deep-links: `?pr=<id>` (direct, MIN-143) and `?run=<id>` (historical — the
  // issue sidebar and all links already in circulation speak in run).
  // Both preselect the PR. The status filter is widened ONCE, when the loaded
  // target turns out to be invisible in the default “open” lens — after that
  // the lens the reader picks is the master rule.
  const { searchParams } = useAppTabRoute();
  const runParam = searchParams.get("run");
  const prParam = searchParams.get("pr");
  const deepLink = prParam ?? runParam;

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

  const [sections, setSections] = useState<ReadonlySet<string>>(() => new Set(DEFAULT_PULL_REQUEST_SECTIONS));
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PULL_REQUESTS_PAGE);
  const [selectedPrId, setSelectedPrId] = useState<string | null>(prParam);
  const [mobileDetail, setMobileDetail] = useState(!!deepLink);
  // Related issue open in side panel (on top of page, no navigation).
  const [panel, setPanel] = useState<{ projectId: string; issueId: string } | null>(null);
  // Sections start expanded; each keeps its own collapse and show-more state.
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(
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
  // stops carrying `pr`/`run` and the lens decides who belongs to the list.
  const pin = useMemo(() => ({ pr: prParam, run: runParam }), [prParam, runParam]);
  const active = useAllPullRequestsQuery("open", limit, pin);
  const completed = useCompletedPullRequestsQuery(sections.has("completed"));
  const { hasMore, repoCount, anyPr, loading } = active;
  const fetching = active.fetching || completed.isFetching;
  const truncated = active.truncated || completed.data?.pages.some((page) => page.truncated);
  const pullRequests = useMemo(() => [...new Map([
    ...active.pullRequests, ...completed.pullRequests,
  ].map((pr) => [pr.prId, pr])).values()], [active.pullRequests, completed.pullRequests]);
  const refetch = () => {
    void active.refetch();
    if (sections.has("completed")) void completed.refetch();
  };

  // Tracks param changes (client navigation to another PR).
  useEffect(() => {
    if (!deepLink) return;
    if (prParam) setSelectedPrId(prParam);
    setMobileDetail(true);
  }, [deepLink, prParam]);

  // The HISTORICAL deep-link speaks in `run` (the “see pull request” links
  // carry the most recent run): we resolve it to `prId` as soon as the list
  // arrived. A PR is shared by ALL successive runs of its ticket
  // (MIN-68) — we therefore match on any one, otherwise the link would fall to
  // side and the lower guard effect would open the PR of another ticket.
  const deepLinkedByRun = useMemo(
    () =>
      runParam && !prParam
        ? (pullRequests.find((p) => p.runIds.includes(runParam)) ?? null)
        : null,
    [runParam, prParam, pullRequests],
  );

  // The PR the deep link resolved to, kept in a ref: the confirmed-state
  // callback below recognizes it without being re-created on every list
  // update. The LAST resolved target survives — an optimistic state change
  // removes the row from the list before the forge confirms, and the ref
  // must still name the PR whose link is being fulfilled.
  const deepLinkTargetRef = useRef<string | null>(null);
  const resolvedDeepLinkTarget = prParam ?? deepLinkedByRun?.prId ?? null;
  if (resolvedDeepLinkTarget) deepLinkTargetRef.current = resolvedDeepLinkTarget;

  /**
   * The deep link widens the lens AT MOST ONCE, at its resolution: a link to
   * a merged PR arrives under the default “open” lens, and the filter moves
   * to “all” so the target is visible. The check used to re-run on every
   * list change — after a merge, the refetch re-pinned the merged row into
   * the “open” response, the effect saw a target outside the lens and forced
   * “all” again: the “open” filter had become impossible to restore. The
   * settlement is tied to the CURRENT link and resets when it leaves the
   * address, so re-following the same link later is a fresh load free to
   * widen again — while the in-place loop (refetches under an unchanged
   * `?pr=`) can never re-widen behind the reader's back.
   */
  const settledDeepLinkRef = useRef<string | null>(null);
  useEffect(() => {
    if (!deepLink) {
      settledDeepLinkRef.current = null;
      return;
    }
    if (settledDeepLinkRef.current === deepLink) return;
    const isTarget = (pullRequest: PullRequestListItem) =>
      prParam
        ? pullRequest.prId === prParam
        : !!runParam && pullRequest.runIds.includes(runParam);
    const decision = deepLinkLensDecision(
      pullRequests,
      isTarget,
      (pullRequest) => sections.has(pullRequestSection(pullRequest)),
    );
    if (decision === "pending") return;
    settledDeepLinkRef.current = deepLink;
    if (decision === "widen") {
      const target = pullRequests.find(isTarget)!;
      setSections((previous) => new Set([...previous, pullRequestSection(target)]));
    }
  }, [deepLink, sections, prParam, pullRequests, runParam]);

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
      // The deep link asked for this PR while it was live; merged or closed,
      // its job is done. Keeping `?pr=` would re-pin the row — which the lens
      // now excludes — into every refetch, and a reload would re-widen the
      // filter: the sidebar filter takes the master rule back. Confirmed only,
      // so a refused merge (branch protection, lost rights) keeps the link.
      if (isTerminalPrState(state) && prId === deepLinkTargetRef.current) {
        consumeDeepLink();
      }
    },
    [consumeDeepLink, queryClient],
  );

  const filtered = useMemo(
    () => pullRequests.filter((pr) => sections.has(pullRequestSection(pr))),
    [pullRequests, sections],
  );

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
   * of the list instead of that of the link. Measured: `?run=<PR #1 run>`
   * opened PR #17.
   *
   * The order below SAYS the rule, instead of making it emerge from a race:
   * the user clicks first (while it is in the filter), then the
   * deep-link, then the first in the list — and nothing as long as a fetch is in effect.
   * flight, otherwise we would open a defect just before the good PR arrives.
   *
   * A line that LEAVES the lens releases its selection: merging the last
   * open PR empties the default “open” list and the selection falls from
   * one to zero. The filter stays where it is — widening it to keep the
   * merged PR in view is the READER's gesture (the filter menu), never a
   * side effect of the merge. Selecting it again is still one click: the
   * click state survives, so switching the lens to “merged” reopens exactly
   * the PR that was on screen.
   */
  const clicked =
    selectedPrId && filtered.some((p) => p.prId === selectedPrId) ? selectedPrId : null;
  // A background refetch should never close the panel: it was the source of the
  // flashing each time you return to the window. Only a deep connection yet
  // being resolved waits for its response before taking the first PR.
  const waitingForDeepLink = !!deepLink && fetching && !deepLinkedByRun && !clicked;
  const selectedId =
    clicked ??
    deepLinkedByRun?.prId ??
    (waitingForDeepLink ? null : (filtered[0]?.prId ?? null));
  const selected = filtered.find((p) => p.prId === selectedId) ?? null;

  // “Save current view” (⌘K): the open PR is a selection of
  // the page, derived rather than pushed into the address — `?pr=` is precisely
  // which restores it (and the pin on the server side, even if it's six months old).
  usePublishCurrentView({
    href: selected ? `/pull-requests?pr=${encodeURIComponent(selected.prId)}` : "/pull-requests",
    label: selected ? `${t("title")} · ${selected.title}` : t("title"),
  });

  // Publish the selected PR to Numo even when it has no linked issue. The PR id
  // is the stable repository-work anchor; issue details remain optional context.
  useAssistantContext(
    selected && selected.project
      ? {
          projectId: selected.project.id,
          pullRequestId: selected.prId,
          prNumber: selected.pr_number,
          prState: selected.pr_state,
          prHeadRef: selected.head_branch ?? undefined,
          prRunId: selected.runId ?? undefined,
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
  if (!loading && !projectsLoading && (projects.length === 0 || repoCount === 0 || !anyPr)) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
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
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ── Left: pull request list ─────────────────────────────────────── */}
      <SecondarySidebar
        title={t("title")}
        hiddenOnMobile={mobileDetail}
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
        ) : groups.length === 0 ? (
          <EmptyScene
            size="compact"
            icon={GitPullRequestIcon}
            title={query.trim() ? tCommon("noFilterMatch") : t("emptySections")}
            className="py-10"
          >
            {query.trim() ? null : (
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
                onSelect={(prId) => {
                  setSelectedPrId(prId);
                  setMobileDetail(true);
                }}
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
      </SecondarySidebar>

      {/* ── Right: detail of the PR ────────────────────────────────────── */}
      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col md:flex",
          mobileDetail ? "flex" : "hidden",
        )}
      >
        {selected ? (
          <PrDetail
            key={selected.prId}
            item={selected}
            onBack={() => setMobileDetail(false)}
            onRefetchList={() => void refetch()}
            onOptimisticStateChange={applyOptimisticState}
            onStateChange={applyConfirmedState}
            onOpenIssue={(issueId, projectId) => setPanel({ projectId, issueId })}
          />
        ) : loading ? (
          <PrDetailSkeleton />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <p className="text-sm text-muted-foreground">{t("noSelection")}</p>
          </div>
        )}
      </div>

      {/* Linked issue side panel — overlay over the page (no nav). */}
      {panel ? (
        <PrIssuePanel
          key={`${panel.projectId}:${panel.issueId}`}
          projectId={panel.projectId}
          issueId={panel.issueId}
          onClose={() => setPanel(null)}
        />
      ) : null}
    </div>
  );
}
