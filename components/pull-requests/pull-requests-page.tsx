"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import {
  Button,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  Skeleton,
  Spinner,
  cn,
} from "mangue-ui";
import { GitPullRequest, Link2, ListFilter, Plus } from "lucide-react";
import { EmptyScene } from "@/components/empty-scene";
import { GitLogin } from "@/components/git/git-login";
import { NumoIcon } from "@/components/numo-icon";
import { PrStateBadge } from "@/components/pull-requests/pr-state-badge";
import { SearchMenu } from "@/components/search-menu";
import { checkedProps } from "@/components/search-select";
import { SecondarySidebar } from "@/components/secondary-sidebar";
import { matchesFilter } from "@/components/sidebar-filter-field";
import {
  PROJECT_GROUP_INDENT,
  PROJECT_GROUP_LIMIT,
  SidebarProjectGroup,
  groupByProject,
  toggledSet,
  type ProjectGroup,
} from "@/components/sidebar-project-group";
import { UserAvatar } from "@/components/user-avatar";
import { PULL_REQUESTS_PAGE, useAllPullRequestsQuery } from "@/lib/use-agent-runs";
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
  PullRequestStateFilter,
} from "@/lib/agent-api";

const PrDetail = dynamic(
  () => import("@/components/pull-requests/pr-detail").then((m) => m.PrDetail),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-0 flex-1 flex-col gap-4 p-4">
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="min-h-0 flex-1 rounded-xl" />
      </div>
    ),
  },
);

const PrIssuePanel = dynamic(
  () =>
    import("@/components/pull-requests/pr-issue-panel").then(
      (m) => m.PrIssuePanel,
    ),
  { ssr: false },
);

const ALL_PULL_REQUESTS_QUERY_KEY = ["pull-requests", "all"] as const;

/** `open` understands drafts, like the filter served by the API. */
function matchesStateFilter(state: PullRequestListItem["pr_state"], filter: unknown): boolean {
  return (
    filter === "all" ||
    (filter === "open" && (state === "open" || state === "draft")) ||
    filter === state
  );
}

/**
 * Applies a state change to all cached variants in the list.
 * A line that leaves the current filter disappears immediately: the sidebar and
 * the detail therefore chooses their new state in the same rendering.
 */
function updateCachedPullRequestState(
  queryClient: ReturnType<typeof useQueryClient>,
  prId: string,
  state: PullRequestListItem["pr_state"],
) {
  for (const [key, data] of queryClient.getQueriesData<PullRequestListResponse>({
    queryKey: ALL_PULL_REQUESTS_QUERY_KEY,
  })) {
    if (!data || !data.pullRequests.some((pr) => pr.prId === prId)) continue;
    const filter = (key as QueryKey)[2];
    const pullRequests = matchesStateFilter(state, filter)
      ? data.pullRequests.map((pr) => (pr.prId === prId ? { ...pr, pr_state: state } : pr))
      : data.pullRequests.filter((pr) => pr.prId !== prId);
    queryClient.setQueryData(key, { ...data, pullRequests });
  }

  // The detail has its own cache, served by the forge. Let him wait
  // refetch after having already changed the sidebar made two states of
  // the same PR during a network round trip.
  queryClient.setQueryData<AgentRunPrResponse>(["pull-request", prId], (data) => {
    if (!data?.pr) return data;
    return {
      ...data,
      pr: {
        ...data.pr,
        state,
        draft: state === "draft",
        merged: state === "merged",
      },
    };
  });
}

/**
 * Pull Requests page (MIN-66, expanded by MIN-143) — list view/detail way
 * sorting: on the left ALL the PRs of the linked repositories (from Numo as well as from humans,
 * all accessible projects), on the right the diff + comments + actions.
 *
 * Two filters, and not one more. STATUS, served by the server — “all”
 * now means hundreds of lines. THE AUTHOR, applied on the page
 * loaded, with the entry “opened by Numo” which is the question we ask ourselves
 * really often. What is deliberately MISSING is “to be reread by me”: it
 * should know which forge account is which minddy member, and `git_connections`
 * only says it about the account that linked the deposit.
 */

/** Author filter value: all, Numo, or a specific forge login. */
const AUTHOR_ALL = "__all__";
const AUTHOR_NUMO = "__numo__";

/**
 * The states served by the filter, in menu order.
 *
 * A TABLE rather than four hand-written entries: the menu and the wording
 * of the button read the same source, so they cannot diverge. Typed in
 * `MessageKey` and not `string` — a key that does not exist does not compile
 * (see CLAUDE.md), where a `Record<string, string>` would calmly display
 * “PullRequests.filterOpen” on the screen.
 */
const STATE_FILTERS: ReadonlyArray<{
  value: PullRequestStateFilter;
  label: MessageKey<"PullRequests">;
  /**
   * Title of the empty column when it is THIS state, and this state alone, which empties it —
   * “no merged pull requests” says what we were looking for, where “none
   * in these filters » returns the user open the menu to remember
   * which ones. “All” does not have one: a state which excludes nothing has nothing to
   * name, and this surface is already processed before rendering the column.
   */
  empty?: MessageKey<"PullRequests">;
}> = [
  { value: "open", label: "filterOpen", empty: "emptyOpen" },
  { value: "merged", label: "filterMerged", empty: "emptyMerged" },
  { value: "closed", label: "filterClosed", empty: "emptyClosed" },
  { value: "all", label: "filterAll" },
];

/**
 * The column filter: ONE trigger for both dimensions.
 *
 * It is a COMBOBOX, the same as the field selectors of a ticket (status,
 * priority, assigned) — `SearchMenu`, therefore cmdk, therefore searchable. On a deposit at
 * fifteen contributors, a list of authors that we can only scan with our eyes
 * is not a filter, it is a directory.
 *
 * The trigger no longer has any label or chevron, just the filter icon:
 * the line is 320 px, and the input field needs everything we can get it
 * to leave. What the label said — the current state — goes into the tooltip, and
 * a pellet indicates from afar that a filter is installed; without it, a list
 * restricted would have nothing left to say about it.
 */
function PrFilterMenu({
  state,
  author,
  authors,
  onStateChange,
  onAuthorChange,
}: {
  state: PullRequestStateFilter;
  author: string;
  authors: { login: string; avatar_url: string | null }[];
  onStateChange: (state: PullRequestStateFilter) => void;
  onAuthorChange: (author: string) => void;
}) {
  const t = useTranslations("PullRequests");
  const [open, setOpen] = useState(false);

  const stateLabel = t(
    STATE_FILTERS.find((s) => s.value === state)?.label ?? "filterOpen",
  );
  // “Open, all authors” is the starting point: nothing to report. All the
  // The list remains restricted, and must be seen without opening the menu.
  const active = state !== "open" || author !== AUTHOR_ALL;

  const pick = (run: () => void) => {
    run();
    setOpen(false);
  };

  return (
    <SearchMenu
      open={open}
      onOpenChange={setOpen}
      align="end"
      tooltip={t("filterTooltip", { state: stateLabel })}
      trigger={
        /* `-mr-2` compensates for the padding of the button: the icon then aligns with the
           right edge of the list lines, not 8 px below. */
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn(SIDEBAR_COMPACT_CONTROL_CLASS, "-mr-2")}
          aria-label={t("filterTooltip", { state: stateLabel })}
        >
          <span className="relative flex items-center justify-center">
            <ListFilter className="size-[18px]" />
            {active ? (
              /* The ring in the color of the bar detaches the pellet from the line
                 of the icon, which passes just below. */
              <span
                aria-hidden
                className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary ring-2 ring-sidebar"
              />
            ) : null}
          </span>
        </Button>
      }
    >
      <CommandGroup heading={t("filterStateLabel")}>
        {STATE_FILTERS.map((s) => (
          <CommandItem
            key={s.value}
            value={`state-${s.value}`}
            keywords={[t(s.label)]}
            onSelect={() => pick(() => onStateChange(s.value))}
            {...checkedProps(s.value === state)}
          >
            <span className="truncate">{t(s.label)}</span>
          </CommandItem>
        ))}
      </CommandGroup>
      {/* The author only arises where Numo and humans coexist: at a
          sole author, the group would have nothing to decide. */}
      {authors.length > 1 ? (
        <>
          <CommandSeparator className="my-1" />
          <CommandGroup heading={t("filterAuthorLabel")}>
            <CommandItem
              value="author-all"
              keywords={[t("filterByAuthor")]}
              onSelect={() => pick(() => onAuthorChange(AUTHOR_ALL))}
              {...checkedProps(author === AUTHOR_ALL)}
            >
              <span className="truncate">{t("filterByAuthor")}</span>
            </CommandItem>
            <CommandItem
              value="author-numo"
              keywords={[t("filterNumoOnly"), "numo", "agent"]}
              onSelect={() => pick(() => onAuthorChange(AUTHOR_NUMO))}
              {...checkedProps(author === AUTHOR_NUMO)}
            >
              <span className="truncate">{t("filterNumoOnly")}</span>
            </CommandItem>
            {authors.map((a) => (
              <CommandItem
                key={a.login}
                value={`author-${a.login}`}
                keywords={[a.login]}
                onSelect={() => pick(() => onAuthorChange(a.login))}
                {...checkedProps(a.login === author)}
              >
                {/* `GitLogin` already truncates the name without overwriting its pastille
                    “bot” — wrapping it in a `truncate` would cut it. */}
                <GitLogin login={a.login} />
              </CommandItem>
            ))}
          </CommandGroup>
        </>
      ) : null}
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
  selected,
  dateLabel,
  onSelect,
}: {
  pr: PullRequestListItem;
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

  return (
    <button
      type="button"
      data-sidebar-filter-result
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
          <span className="shrink-0 text-foreground">{identifier}</span>
          {linkedIssue ? (
            <>
              <Link2
                data-testid="pr-sidebar-issue-link-icon"
                className="size-3 shrink-0"
                aria-hidden
              />
              <span className="truncate">{linkedIssue}</span>
            </>
          ) : null}
        </span>
        {pr.activeRunId ? <Spinner className="size-3 shrink-0" /> : null}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <PrStateBadge state={pr.pr_state} className="h-5 px-2 text-[10px]" />
          <span className="text-xs text-muted-foreground">{dateLabel}</span>
        </span>
      </div>
      <span className="line-clamp-2 text-sm font-medium">
        {pr.title ?? pr.issue?.title ?? identifier}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        {/* THE AUTHOR distinguishes a Numo PR from a human PR, now that they
            cohabit. The run decides: it does not lie, where the login of the forge
            depends on the installation. */}
        {pr.runId ? (
          <NumoIcon animated={false} className="size-3.5 shrink-0" />
        ) : pr.author ? (
          <UserAvatar
            url={pr.author.avatar_url}
            seed={pr.author.login}
            className="size-3.5 shrink-0"
          />
        ) : null}
        {pr.runId ? (
          <span className="truncate">{t("numoAuthor")}</span>
        ) : (
          <GitLogin login={pr.author?.login} className="text-xs" />
        )}
      </span>
    </button>
  );
}

/** A project and its pull requests — the shared shell, filled with `PrRow`. */
function PrGroupRows({
  group,
  open,
  showAll,
  collapsible,
  selectedId,
  fmtDay,
  onToggle,
  onShowAll,
  onSelect,
}: {
  group: ProjectGroup<PullRequestListItem>;
  open: boolean;
  showAll: boolean;
  collapsible: boolean;
  selectedId: string | null;
  fmtDay: (at: string) => string;
  onToggle: () => void;
  onShowAll: () => void;
  onSelect: (prId: string) => void;
}) {
  const tCommon = useTranslations("Common");
  const prs = group.items;

  // The OPEN PR remains visible: if it is beyond the first five, the
  // cut goes down to it rather than hiding it.
  const selectedIndex = prs.findIndex((p) => p.prId === selectedId);
  const shown = showAll
    ? prs
    : prs.slice(0, Math.max(PROJECT_GROUP_LIMIT, selectedIndex + 1));

  return (
    <SidebarProjectGroup
      project={group.project}
      fallbackLabel={tCommon("noProjectGroup")}
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
          selected={pr.prId === selectedId}
          dateLabel={fmtDay(pr.updated_at)}
          onSelect={() => onSelect(pr.prId)}
        />
      ))}
    </SidebarProjectGroup>
  );
}

export function PullRequestsPage() {
  const t = useTranslations("PullRequests");
  const tProjects = useTranslations("Projects");
  const tCommon = useTranslations("Common");
  const format = useFormatter();
  const { projects, openCreateProject, loading: projectsLoading } = useProjects();
  const queryClient = useQueryClient();

  // Forging actions are slow, but their state is known from the click: we
  // patches the list before the response, then reconciles with the server. THE
  // snapshot allows you to put the lists exactly back in place if the forge
  // ultimately refuses the action (branch protection, rights withdrawn, etc.).
  const applyOptimisticState = useCallback(
    (prId: string, state: PullRequestListItem["pr_state"]) => {
      const previous = queryClient.getQueriesData<PullRequestListResponse>({
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
    },
    [queryClient],
  );

  // Deep-links: `?pr=<id>` (direct, MIN-143) and `?run=<id>` (historical — the
  // issue sidebar and all links already in circulation speak in run).
  // Both preselect the PR and switch the filter to “all” to
  // that it is visible whatever its state.
  const searchParams = useSearchParams();
  const runParam = searchParams.get("run");
  const prParam = searchParams.get("pr");
  const deepLink = prParam ?? runParam;

  const [filter, setFilter] = useState<PullRequestStateFilter>(deepLink ? "all" : "open");
  const [author, setAuthor] = useState<string>(AUTHOR_ALL);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PULL_REQUESTS_PAGE);
  const [selectedPrId, setSelectedPrId] = useState<string | null>(prParam);
  const [mobileDetail, setMobileDetail] = useState(!!deepLink);
  // Related issue open in side panel (on top of page, no navigation).
  const [panel, setPanel] = useState<{ projectId: string; issueId: string } | null>(null);
  // Accordion of the list: FOLDED projects (everything is unfolded by default - we
  // arrives to see, not to open) and those for whom we requested all the PRs.
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  /** Folds/unfolds a project. Folding it back resets his list to his top five. */
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
  const pin = useMemo(() => ({ pr: prParam, run: runParam }), [prParam, runParam]);
  const { pullRequests, hasMore, truncated, repoCount, anyPr, loading, fetching, refetch } =
    useAllPullRequestsQuery(filter, limit, pin);

  // Tracks param changes (client navigation to another PR).
  useEffect(() => {
    if (!deepLink) return;
    if (prParam) setSelectedPrId(prParam);
    setFilter("all");
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
  // Authors present in the loaded page — the menu only offers what we have.
  const authors = useMemo(() => {
    const seen = new Map<string, { login: string; avatar_url: string | null }>();
    for (const pr of pullRequests) {
      if (pr.author && !seen.has(pr.author.login)) seen.set(pr.author.login, pr.author);
    }
    return [...seen.values()].sort((a, b) => a.login.localeCompare(b.login));
  }, [pullRequests]);

  const filtered = useMemo(() => {
    if (author === AUTHOR_ALL) return pullRequests;
    // “Opened by Numo” is read on the RUN, not on the login: according to the forge
    // and installation, the author of a Numo PR is sometimes the app, sometimes the
    // connected account. The run doesn't lie.
    if (author === AUTHOR_NUMO) return pullRequests.filter((p) => !!p.runId);
    return pullRequests.filter((p) => p.author?.login === author);
  }, [pullRequests, author]);

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
        p.issue?.title,
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

  // Publishes the selected PR to Numo: it resolves “this PR”, reads it
  // (read_pull_request) and can initiate changes to the linked issue.
  useAssistantContext(
    selected && selected.project && selected.issue
      ? {
          projectId: selected.project.id,
          issueId: selected.issue.id,
          issueIdentifier: issueIdentifier(selected.project.key, selected.issue.number),
          issueTitle: selected.issue.title,
          prNumber: selected.pr_number,
          prState: selected.pr_state,
          prRunId: selected.runId ?? undefined,
        }
      : null,
  );

  const groups = useMemo(
    () => groupByProject(visible, (p) => p.project),
    [visible],
  );
  // A filter in progress UNFOLDS everything and lifts the cup of five: searching is
  // ask to see what fits, not to know where it is stored.
  const filtering = query.trim().length > 0;

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
            <EmptyScene icon={GitPullRequest} title={t("emptyNoProject")}>
              <Button onClick={openCreateProject}>
                <Plus />
                {tProjects("firstProject")}
              </Button>
            </EmptyScene>
          ) : (
            /* Without a linked deposit, there is no button to offer: the deposit is linked
               in the settings OF ONE project, and we don't know which one. */
            <EmptyScene
              icon={GitPullRequest}
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
            state={filter}
            author={author}
            authors={authors}
            onStateChange={(next) => {
              setFilter(next);
              setLimit(PULL_REQUESTS_PAGE);
            }}
            onAuthorChange={setAuthor}
          />
        }
      >
        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          /* PRs necessarily exist here — the completely empty surface is
             processed above, before rendering the column. The list cannot
             therefore be empty only because a filter emptied it, and the same scene
             as the other empty states say, to the size of the column.
             “Nothing matches” and “no PR in this state” are not the
             same news: the first can be repaired by erasing three letters, the
             second request to reopen the filter — hence the button, which has nothing
             to offer as long as it is the seizure that restricts.

             And when the condition is the ONLY restriction, the scene names it. Of the
             that an author is added, it returns to the generic wording: “none
             pull request ouverte » serait faux s'il en existe, mais d'un autre. */
          <EmptyScene
            size="compact"
            icon={GitPullRequest}
            title={
              query.trim()
                ? tCommon("noFilterMatch")
                : t(
                    (author === AUTHOR_ALL
                      ? STATE_FILTERS.find((s) => s.value === filter)?.empty
                      : undefined) ?? "emptyState",
                  )
            }
            className="py-10"
          >
            {query.trim() ? null : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilter("all");
                  setAuthor(AUTHOR_ALL);
                  setLimit(PULL_REQUESTS_PAGE);
                }}
              >
                {t("emptyShowAll")}
              </Button>
            )}
          </EmptyScene>
        ) : (
          <div className="flex flex-col gap-2 px-2 pt-2 pb-4">
            {/* A project, its pull requests — same accordion as the column of
                agent conversations (`SidebarProjectGroup`). It is he who
                carries the project, and that’s why the lines don’t carry it
                plus: it would be written once per line under its own title. */}
            {groups.map((g) => (
              <PrGroupRows
                key={g.key}
                group={g}
                open={filtering || !collapsedGroups.has(g.key)}
                showAll={filtering || expandedGroups.has(g.key)}
                collapsible={!filtering}
                selectedId={selectedId}
                fmtDay={fmtDay}
                onToggle={() => toggleGroup(g.key)}
                onShowAll={() => setExpandedGroups((prev) => toggledSet(prev, g.key))}
                onSelect={(prId) => {
                  setSelectedPrId(prId);
                  setMobileDetail(true);
                }}
              />
            ))}

            {hasMore ? (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 self-center"
                disabled={fetching}
                onClick={() => setLimit((n) => n + PULL_REQUESTS_PAGE)}
              >
                {fetching ? <Spinner /> : null}
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
