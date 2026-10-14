import { hashKey, isCancelledError, onlineManager, type Query, type QueryClient, type QueryFunctionContext } from "@tanstack/react-query";
import { prepareAppTabSurface } from "./app-tab-surfaces";
import { preparePageNavigation } from "./use-pages-query";
import { appTabRoute, normalizeAppTabLocation } from "./app-tab-location";
import { appTabPendingIssueSelection, appTabPreparationQueries, appTabSelectionSource, prefetchPullRequestDetail } from "./prefetch-tab-destination";
import { issueWrites } from "./optimistic/issue-writes";
import { isCachedTabReconciliation, navigationPreparationPriority } from "./navigation-preparation-priority";
import { allPullRequestsQueryOptions } from "./use-agent-runs";
import { prActivityPreparationQueries } from "./pr-activity-query";
import { createPageNavigationPreparation } from "./page-navigation-preparation";
import { adjacentProjectDestination } from "./project-navigation-working-set";
import { pullRequestAccountRetryAt } from "./pull-request-query";
import { createNavigationWorkingSet } from "./navigation-working-set";
import { createProjectBootstrapPair, ProjectBootstrapLimitError } from "./project-bootstrap-api";

const PASSIVE_SHELL_READS = new Set([
  ["me", "summary"], ["me", "triage-counts"], ["me", "smart-assign-warnings"],
  ["me", "branch-cleanup-targets"], ["pull-requests", "open-count"],
].map(hashKey));
const BACKGROUND_PR_LIST_HASH = hashKey(allPullRequestsQueryOptions().queryKey);

/** Only established shell summaries may reconcile alongside bounded scoped preparation. */
export function isPassiveShellMaintenanceRead(query: Pick<Query, "queryKey" | "queryHash" | "state">): boolean {
  if (query.state.status !== "success" || query.state.data === undefined) return false;
  if (PASSIVE_SHELL_READS.has(query.queryHash)) return true;
  // This exact producer belongs to tab labels, with no route or editing authority.
  const key = query.queryKey;
  return key.length === 3 && key[0] === "app-tab-metadata" && typeof key[1] === "string" && key[1].length > 0 &&
    Array.isArray(key[2]) && key[2].every((href) => typeof href === "string");
}

/** Recent visible detail activities precede optional lists for old pinned PRs. */
function recentActivityQueries(client: QueryClient) {
  const list = client.getQueryData<{ pullRequests: { prId: string; pr_state: string }[] }>(allPullRequestsQueryOptions().queryKey);
  const recent = [...new Set((list?.pullRequests ?? []).filter((pr) => ["open", "draft"].includes(pr.pr_state)).map((pr) => pr.prId))].slice(0, 5);
  return recent.flatMap((id) => {
    const detail = client.getQueryState<{ pr: unknown }>(["pull-request", id]);
    return detail?.status === "success" && detail.data?.pr ? prActivityPreparationQueries(id) : [];
  });
}

function missingRecentActivity(client: QueryClient): boolean {
  return recentActivityQueries(client).some((options) => {
    const state = client.getQueryState(options.queryKey);
    return state?.status !== "error" && (state?.data === undefined || state.isInvalidated);
  });
}

/** Only the displayed working set is prepared; larger accounts keep normal intent navigation. */
export const RESTORED_TAB_PREPARATION_LIMIT = 10;
/** Scoped preparation retains at most two HTTP transports, including one paired read. */
export const SCOPED_PREPARATION_CONCURRENCY = 2;

/** Drain a finite account-owned working set, yielding each read to foreground work. */
export function createPrTabPreparation(
  client: QueryClient,
  schedule: (work: () => void) => () => void = (work) => {
    let idle: number | undefined;
    const timer = setTimeout(() => {
      if (typeof requestIdleCallback === "function") idle = requestIdleCallback(work, { timeout: 200 });
      else work();
    }, 0);
    return () => { clearTimeout(timer); if (idle !== undefined) cancelIdleCallback(idle); };
  },
) {
  const pagePreparation = createPageNavigationPreparation(client);
  const workingSet = createNavigationWorkingSet(client);
  const visits: string[] = [];
  let available: readonly string[] = [];
  let active = "", disposed = false;
  const neighborAttempts = new Map<string, number>();
  const attempted = new Set<string>();
  const parkedForge = new Set<string>();
  const deferredForge = new Set<string>();
  let forgeWake: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  type Read = { key: readonly unknown[]; identity: string; cancelled: boolean; forge: boolean; dispatched: boolean; pair?: BootstrapPair; generation?: number; superseded?: boolean };
  const preparing = new Map<string, Read>();
  type BootstrapReader = { key: readonly unknown[]; original: PreparedQuery["options"]["queryFn"]; installed: PreparedQuery["options"]["queryFn"] };
  type BootstrapPair = { transport: ReturnType<typeof createProjectBootstrapPair>; pending: Set<string>; readers: Map<string, BootstrapReader>; reads: Map<string, Read>; joined: Set<string>; generations: Map<string, number>; stop: () => void; disposed: boolean };
  const bootstrapPairs = new Set<BootstrapPair>();
  const transportSlots = () => {
    const pairedOwners = new Set<string>();
    for (const pair of bootstrapPairs) for (const identity of pair.pending) if (preparing.has(identity)) pairedOwners.add(identity);
    return preparing.size - pairedOwners.size + bootstrapPairs.size;
  };
  const disposeBootstrapPair = (pair: BootstrapPair) => {
    if (pair.disposed) return;
    pair.disposed = true; pair.stop(); pair.transport.dispose();
  };
  const restoreBootstrapReader = (pair: BootstrapPair, identity: string) => {
    const reader = pair.readers.get(identity);
    if (!reader) return;
    pair.readers.delete(identity);
    const query = client.getQueryCache().find({ queryKey: reader.key, exact: true });
    // A foreground observer may already have installed newer ordinary options.
    // Restore only the exact temporary function this preparation operation owns.
    if (query && query.options.queryFn === reader.installed) query.setOptions({ ...query.options, queryFn: reader.original });
  };
  const activeQueryHashes = new Set<string>();
  const priority = navigationPreparationPriority(client);
  const visible = () => typeof document === "undefined" || document.visibilityState !== "hidden";
  const cancelScheduled = () => { cancel?.(); cancel = undefined; };
  const missing = (key: readonly unknown[]) => {
    const state = client.getQueryState(key);
    return state?.data === undefined || state.isInvalidated || state.status === "error";
  };
  const otherTransport = () => {
    const auxiliary = new Set(recentActivityQueries(client).map((options) => hashKey(options.queryKey)));
    // The shell's exact default list discovers background PR owners. Keep its
    // cold request running, but visible PR destinations retain foreground priority.
    const backgroundPrList = normalizeAppTabLocation(active) !== null && appTabRoute(active).section !== "pull-requests"
      ? BACKGROUND_PR_LIST_HASH : undefined;
    return client.getQueryCache().getAll().some((query) => query.state.fetchStatus === "fetching" && !isCachedTabReconciliation(query) && !isPassiveShellMaintenanceRead(query) &&
      query.queryHash !== backgroundPrList &&
      !(preparing.has(query.queryHash) && !preparing.get(query.queryHash)!.cancelled && !preparing.get(query.queryHash)!.superseded && !query.isActive()) &&
      !(auxiliary.has(query.queryHash) && !query.isActive()));
  };
  type PreparedQuery = { options: ReturnType<typeof appTabPreparationQueries>[number]; identity: string };
  type Destination = { href: string; route: ReturnType<typeof appTabRoute>; queries: PreparedQuery[]; pendingIssue: string | null };
  let listed: Destination[] = [], neighbor: Destination | undefined;
  const manifest = new Map<string, { query: PreparedQuery; neighboring: boolean }>();
  const selectionSources = new Map<string, Set<Destination>>();
  const pendingInsertSources = new Map<string, Set<string>>();
  const indexPendingInsertSources = () => {
    pendingInsertSources.clear();
    for (const [source, destinations] of selectionSources) for (const item of destinations) {
      if (!item.pendingIssue) continue;
      const sources = pendingInsertSources.get(item.pendingIssue) ?? new Set<string>();
      sources.add(source); pendingInsertSources.set(item.pendingIssue, sources);
    }
  };
  const pendingKeys = new Set<string>();
  const destination = (href: string): Destination => ({ href, route: appTabRoute(href), pendingIssue: appTabPendingIssueSelection(client, href),
    queries: appTabPreparationQueries(client, href).map((options) => ({ options, identity: hashKey(options.queryKey) })) });
  const refreshPending = (identity?: string) => {
    const update = (key: string, entry: { query: PreparedQuery; neighboring: boolean }) => {
      if (!attempted.has(key) && missing(entry.query.options.queryKey) &&
          (!entry.neighboring || Date.now() - (neighborAttempts.get(key) ?? -Infinity) >= 30_000)) pendingKeys.add(key);
      else pendingKeys.delete(key);
    };
    if (identity) { const entry = manifest.get(identity); if (entry) update(identity, entry); }
    else { pendingKeys.clear(); for (const [key, entry] of manifest) update(key, entry); }
  };
  const refreshNeighbor = () => {
    const href = adjacentProjectDestination(client, active, visits, available);
    const next = href && !available.includes(href) ? href : undefined;
    if (next === neighbor?.href) return;
    neighbor = next ? destination(next) : undefined;
    manifest.clear();
    for (const item of listed) for (const query of item.queries) manifest.set(query.identity, { query, neighboring: false });
    for (const query of neighbor?.queries ?? []) if (!manifest.has(query.identity)) manifest.set(query.identity, { query, neighboring: true });
    refreshPending();
  };
  const rebuildManifest = () => {
    listed = available.filter((href) => href !== active).map(destination).filter((item) => item.queries.length);
    selectionSources.clear();
    for (const item of listed) {
      const source = appTabSelectionSource(item.href);
      if (!source) continue;
      const identity = hashKey(source), destinations = selectionSources.get(identity) ?? new Set<Destination>();
      destinations.add(item); selectionSources.set(identity, destinations);
    }
    indexPendingInsertSources();
    neighbor = undefined; manifest.clear();
    for (const item of listed) for (const query of item.queries) manifest.set(query.identity, { query, neighboring: false });
    refreshNeighbor(); refreshPending();
    workingSet.replace(listed.flatMap((item) => item.queries.map(({ options }) => options.queryKey)));
  };
  const actionable = (item: Destination) => item.queries.some((query) => pendingKeys.has(query.identity));
  const hasQueuedNormal = () => listed.some((item) => item.route.section !== "pull-requests" && actionable(item));
  const syncPriority = () => {
    if (hasQueuedNormal() || [...preparing.values()].some((read) => !read.forge)) priority.acquire();
    else priority.release();
  };
  const enqueue = () => {
    if (!disposed && [...pendingKeys].some((identity) => !parkedForge.has(identity)) && !cancel && transportSlots() < SCOPED_PREPARATION_CONCURRENCY &&
        visible() && onlineManager.isOnline() && !otherTransport()) cancel = schedule(prepare);
  };
  const wakeForgeAfterSettlement = () => {
    if (forgeWake) return;
    forgeWake = setTimeout(() => {
      forgeWake = undefined;
      if (disposed || !parkedForge.size) return;
      parkedForge.clear(); refreshPending(); changed();
    }, 0);
  };
  const yieldRead = (read: Read) => {
    if (read.superseded) {
      // The replacement operation is foreground work on this same key. Retire
      // old bookkeeping without canceling that newer query's transport.
      read.cancelled = true; attempted.delete(read.identity); refreshPending(read.identity);
      return;
    }
    if (read.cancelled || client.getQueryCache().find({ queryKey: read.key, exact: true })?.getObserversCount()) return;
    if (!disposed && visible() && onlineManager.isOnline() && activeQueryHashes.has(read.identity)) return;
    read.cancelled = true;
    // A canceled slot remains occupied until its operation settles. This keeps
    // late callbacks from clearing a replacement or admitting a third request.
    attempted.delete(read.identity);
    refreshPending(read.identity);
    void client.cancelQueries({ queryKey: read.key, exact: true });
    const pair = read.pair;
    if (pair && Array.from(pair.reads.values()).some((owner) => !owner.dispatched)) {
      // A synchronous listener can interrupt admission before the second query
      // joins. Retire that incomplete request rather than leave an orphan wait.
      pair.transport.finishAdmission();
      for (const identity of Array.from(pair.readers.keys())) restoreBootstrapReader(pair, identity);
      disposeBootstrapPair(pair);
      for (const owner of pair.reads.values()) if (!owner.dispatched) {
        owner.cancelled = true;
        if (preparing.get(owner.identity) === owner) preparing.delete(owner.identity);
        pair.pending.delete(owner.identity);
        attempted.delete(owner.identity); refreshPending(owner.identity);
        priority.finishRead(owner.key);
      }
      if (!pair.pending.size) bootstrapPairs.delete(pair);
    }
  };
  const yieldReads = () => { for (const read of preparing.values()) yieldRead(read); };
  const refreshSelectedDependencies = (identity: string) => {
    const destinations = selectionSources.get(identity);
    if (!destinations) return;
    let changed = false;
    for (const item of destinations) {
      const next = destination(item.href), queries = next.queries;
      item.pendingIssue = next.pendingIssue;
      if (queries.length === item.queries.length && queries.every((query, index) => query.identity === item.queries[index].identity)) continue;
      item.queries = queries; changed = true;
    }
    indexPendingInsertSources();
    if (!changed) return;
    const previous = [...manifest.keys()];
    manifest.clear();
    for (const item of listed) for (const query of item.queries) manifest.set(query.identity, { query, neighboring: false });
    for (const query of neighbor?.queries ?? []) if (!manifest.has(query.identity)) manifest.set(query.identity, { query, neighboring: true });
    workingSet.replace(listed.flatMap((item) => item.queries.map(({ options }) => options.queryKey)));
    for (const key of previous) if (!manifest.has(key)) {
      attempted.delete(key); parkedForge.delete(key); deferredForge.delete(key);
      const read = preparing.get(key);
      if (read) yieldRead(read);
    }
    refreshPending(); syncPriority();
  };
  const prepare = () => {
    cancel = undefined;
    if (disposed || transportSlots() >= SCOPED_PREPARATION_CONCURRENCY || !visible() || !onlineManager.isOnline() || otherTransport()) return;
    const firstPage = listed.find((item) => item.route.pageId);
    if (firstPage) pagePreparation.prioritize(firstPage.href);
    const missingNavigation = hasQueuedNormal() || [...preparing.values()].some((read) => !read.forge);
    const pairedReads = new Map<string, { options: PreparedQuery["options"]; pair: BootstrapPair; read: Read }>();
    syncPriority();
    // Optional neighboring data never displaces a listed destination.
    for (const item of [...listed, ...(neighbor ? [neighbor] : [])]) {
      const route = item.route;
      const neighboring = item === neighbor;
      // Optional neighbors wait until every listed operation has actually settled.
      if (neighboring && (listed.some(actionable) || [...preparing.keys()].some((identity) => manifest.get(identity)?.neighboring === false))) continue;
      const forge = route.section === "pull-requests";
      if (forge && [...preparing.values()].some((read) => read.forge)) continue;
      if (route.section === "pull-requests" && !missingNavigation && missingRecentActivity(client)) return;
      for (const [index, query] of item.queries.entries()) {
        const { identity } = query;
        let options = pairedReads.get(identity)?.options ?? query.options;
        const admitted = pairedReads.get(identity);
        if (admitted?.read.cancelled) continue;
        if (!admitted && (!pendingKeys.has(identity) || preparing.has(identity) || parkedForge.has(identity))) continue;
        // Earlier fetch/priority listeners may have admitted foreground work
        // during this same pass. A new read must still satisfy current admission.
        if (!admitted && (!visible() || !onlineManager.isOnline() || otherTransport())) { changed(); return; }
        if (!admitted && transportSlots() >= SCOPED_PREPARATION_CONCURRENCY) return;
        if (forge && [...preparing.values()].some((read) => read.forge)) break;
        // A second slot must not let an optional list overtake recent activity
        // while the final ordinary navigation prerequisite is still in flight.
        if (forge && options.queryKey[0] !== "pull-request" && missingRecentActivity(client)) continue;
        if (neighboring && Date.now() - (neighborAttempts.get(identity) ?? -Infinity) < 30_000) continue;
        // One exact pair may share a second HTTP slot alongside one ordinary
        // read. Never wait, reorder work or admit a second paired transport.
        if (!admitted && !forge && !neighboring && !bootstrapPairs.size && preparing.size <= 1 &&
            Array.from(preparing.values()).every((read) => !read.forge) && options.queryKey.length === 2 && options.queryKey[0] === "members" &&
            typeof options.queryKey[1] === "string") {
          const next = item.queries.slice(index + 1).find((candidate) => pendingKeys.has(candidate.identity) &&
            !preparing.has(candidate.identity) && !parkedForge.has(candidate.identity));
          if (next?.options.queryKey.length === 2 && next.options.queryKey[0] === "objectives" &&
              next.options.queryKey[1] === options.queryKey[1] &&
              [options, next.options].every((candidate) => {
                const state = client.getQueryState(candidate.queryKey);
                return (!state || state.fetchStatus === "idle") && state?.data === undefined && !state?.isInvalidated;
              })) {
            const transport = createProjectBootstrapPair(client, options.queryKey[1]);
            // Restore immediately after the first join. A repeated invalidate
            // may emit no cache event while an already invalidated query fetches.
            let pair!: BootstrapPair;
            let fallback: Promise<unknown> = Promise.resolve();
            const sizeFallback = (error: unknown, reader: string, context: QueryFunctionContext, original: PreparedQuery["options"]["queryFn"]) => {
              restoreBootstrapReader(pair, reader);
              if (!(error instanceof ProjectBootstrapLimitError) || disposed || pair.disposed || context.signal.aborted || typeof original !== "function") throw error;
              const generation = pair.generations.get(reader);
              const guard = () => {
                if (disposed || pair.disposed || context.signal.aborted) throw error;
                if (pair.generations.get(reader) !== generation) throw new DOMException("Project read generation changed", "AbortError");
              };
              // The shared stream has ended. Serialize complete ordinary
              // readers within its one reserved physical transport slot.
              const nextFallback = fallback.catch(() => {}).then(() => {
                guard();
                return original(context);
              }).then((value) => {
                // The coordinator's stream subscription has ended on overflow;
                // this owner still fences invalidation through its ordinary GET.
                guard();
                return value;
              });
              fallback = nextFallback;
              return nextFallback;
            };
            const originalMemberFn = options.queryFn, originalObjectiveFn = next.options.queryFn;
            const memberFn: PreparedQuery["options"]["queryFn"] = (context) => {
              pair.joined.add(identity);
              try {
                return transport.members({ signal: context.signal }).catch((error: unknown) => sizeFallback(error, identity, context, originalMemberFn));
              } finally { restoreBootstrapReader(pair, identity); }
            };
            const objectiveFn: PreparedQuery["options"]["queryFn"] = (context) => {
              pair.joined.add(next.identity);
              try {
                return transport.objectives({ signal: context.signal }).catch((error: unknown) => sizeFallback(error, next.identity, context, originalObjectiveFn));
              } finally { restoreBootstrapReader(pair, next.identity); }
            };
            pair = { transport, pending: new Set([identity, next.identity]), reads: new Map(), joined: new Set(),
              generations: new Map([[identity, 0], [next.identity, 0]]), stop: () => {}, disposed: false, readers: new Map([
              [identity, { key: options.queryKey, original: options.queryFn, installed: memberFn }],
              [next.identity, { key: next.options.queryKey, original: next.options.queryFn, installed: objectiveFn }],
            ]) };
            pair.stop = client.getQueryCache().subscribe((event) => {
              const reader = event.query.queryHash;
              if (pair.generations.has(reader) && (event.type === "removed" || (event.type === "updated" && event.action.type === "invalidate"))) {
                pair.generations.set(reader, pair.generations.get(reader)! + 1);
                // invalidateQueries may synchronously refetch an inactive
                // cached key before this operation's Promise settles.
                restoreBootstrapReader(pair, reader);
              }
              const owner = pair.reads.get(reader);
              if (owner?.dispatched && event.type === "updated" && event.action.type === "fetch" &&
                  pair.generations.get(reader) !== owner.generation) {
                owner.superseded = true;
                changed();
              }
            });
            const memberRead: Read = { key: options.queryKey, identity, cancelled: false, forge: false, dispatched: false, pair, generation: 0 };
            const objectiveRead: Read = { key: next.options.queryKey, identity: next.identity, cancelled: false, forge: false, dispatched: false, pair, generation: 0 };
            pair.reads.set(identity, memberRead); pair.reads.set(next.identity, objectiveRead);
            bootstrapPairs.add(pair);
            options = { ...options, queryFn: memberFn };
            pairedReads.set(identity, { options, pair, read: memberRead });
            pairedReads.set(next.identity, { options: { ...next.options, queryFn: objectiveFn }, pair, read: objectiveRead });
            // Both exact query owners exist before any priority/cache listener
            // can observe dispatch. Cancellation still belongs to each owner.
            for (const owner of pair.reads.values()) {
              preparing.set(owner.identity, owner);
              attempted.add(owner.identity); pendingKeys.delete(owner.identity);
            }
            for (const owner of pair.reads.values()) if (!owner.cancelled && preparing.get(owner.identity) === owner) priority.startRead(owner.key);
            syncPriority();
          }
        }
        const detail = options.queryKey[0] === "pull-request";
        // The helper keeps account-wide Retry-After and serial detail ownership.
        // Register ownership before the cache emits the start of the request.
        const read: Read = pairedReads.get(identity)?.read ?? { key: options.queryKey, identity, cancelled: false, forge, dispatched: false };
        if (!read.pair) {
          preparing.set(identity, read);
          attempted.add(identity); pendingKeys.delete(identity);
        }
        if (read.cancelled) continue;
        if (neighboring) {
          neighborAttempts.set(identity, Date.now());
          if (neighborAttempts.size > 64) neighborAttempts.delete(neighborAttempts.keys().next().value!);
        }
        syncPriority();
        if (!forge && !read.pair) priority.startRead(read.key);
        const pageRead = route.pageId && options.queryKey[0] === "page";
        read.dispatched = true;
        const pending = detail ? prefetchPullRequestDetail(client, route.prId!)
          : client.fetchQuery<unknown>({ ...options, retry: false }).then(() => {
            if (pageRead && !disposed && !read.cancelled && !client.getQueryState(options.queryKey)?.isInvalidated) preparePageNavigation(route.pageId!);
          }).catch((error: unknown) => { if (isCancelledError(error)) read.cancelled = true; });
        // A synchronous listener can fill or fetch the sibling before its
        // fetchQuery call. Actual joins, not declared owners, start the stream.
        if (read.pair && Array.from(read.pair.reads.values()).every((owner) => owner.dispatched) && !read.pair.transport.finishAdmission()) {
          for (const pairedIdentity of Array.from(read.pair.readers.keys())) restoreBootstrapReader(read.pair, pairedIdentity);
          disposeBootstrapPair(read.pair);
          for (const owner of read.pair.reads.values()) if (read.pair.joined.has(owner.identity)) {
            owner.cancelled = true;
            attempted.delete(owner.identity); refreshPending(owner.identity);
            if (!owner.superseded) void client.cancelQueries({ queryKey: owner.key, exact: true });
          }
        }
        // Cache fetch listeners run before Query installs its retryer. Replay
        // an interruption after dispatch so the exact new operation is aborted.
        if (read.cancelled && !read.superseded) void client.cancelQueries({ queryKey: read.key, exact: true });
        if (!pending) {
          preparing.delete(identity); priority.finishRead(read.key);
          // A busy account helper has not attempted this displayed tab. Keep
          // its work, but wait for a real forge completion instead of spinning.
          attempted.delete(identity); parkedForge.add(identity); refreshPending(identity);
          // A fresh cached hover holds the helper for a Promise turn without
          // emitting transport events. Defer once, with no polling or quota bypass.
          if (!deferredForge.has(identity) && pullRequestAccountRetryAt(client) <= Date.now() &&
              !client.getQueryCache().getAll().some((query) => query.queryKey[0] === "pull-request" && query.state.fetchStatus !== "idle")) {
            deferredForge.add(identity); wakeForgeAfterSettlement();
          }
          syncPriority(); continue;
        }
        // Query.fetch may resolve prior data after a reverted cancellation.
        // Observe the exact operation's cancellation before that cached result
        // can mark a body prepared or consume its restored preparation attempt.
        const operation = client.getQueryCache().find({ queryKey: read.key, exact: true })?.promise;
        void operation?.catch((error: unknown) => { if (isCancelledError(error)) read.cancelled = true; });
        void pending.finally(() => {
          const pair = pairedReads.get(identity)?.pair;
          if (pair) {
            restoreBootstrapReader(pair, identity);
            pair.pending.delete(identity);
            if (!pair.pending.size && bootstrapPairs.delete(pair)) disposeBootstrapPair(pair);
          }
          if (preparing.get(identity) === read) preparing.delete(identity);
          priority.finishRead(read.key);
          if (disposed) return;
          if (read.cancelled) attempted.delete(identity);
          refreshPending(read.identity);
          syncPriority();
          enqueue();
        });
        // A normal read and one exact pair occupy at most two HTTP slots.
        // Forge-backed reads retain their separate serial ownership.
        if (forge) break;
      }
    }
    syncPriority();
  };
  const changed = () => {
    if (disposed || (!pendingKeys.size && !preparing.size)) return;
    if (!visible() || !onlineManager.isOnline() || otherTransport()) {
      cancelScheduled(); yieldReads();
    }
    enqueue();
  };
  const stopInsertSettlement = issueWrites.subscribeInsertSettlement((id) => {
    const sources = pendingInsertSources.get(id);
    if (!sources) return;
    // Creation failure removes its optimistic row immediately after fail().
    // Resume this indexed selection only after that synchronous rollback.
    queueMicrotask(() => {
      if (disposed || !pendingInsertSources.has(id)) return;
      for (const source of sources) refreshSelectedDependencies(source);
      changed();
    });
  });
  const stop = client.getQueryCache().subscribe((event) => {
    if (disposed) return;
    // Completed working sets ignore unrelated data and observer churn. Only a
    // relevant data transition or transport transition can wake this owner.
    const identity = event.query.queryHash;
    const relevant = manifest.has(identity);
    const projects = event.query.queryKey.length === 1 && event.query.queryKey[0] === "projects";
    if (event.type === "removed") {
      refreshSelectedDependencies(identity);
      if (relevant) { attempted.delete(identity); refreshPending(identity); changed(); }
      return;
    }
    if (event.type === "observerAdded" || event.type === "observerRemoved") {
      if (preparing.has(identity)) changed();
      return;
    }
    if (event.type !== "updated") return;
    const action = event.action;
    // Only the ordinary source read discovers details. Optimistic/manual
    // notifications and unrelated observer churn never scan secondary lists.
    if (action.type === "error" || (action.type === "success" && !action.manual)) refreshSelectedDependencies(identity);
    if (event.query.queryKey[0] === "pull-request" && !preparing.has(identity) && pendingKeys.size && !forgeWake &&
        (action.type === "error" || (action.type === "success" && !action.manual))) {
      // Cache settlement precedes the helper's Promise.finally lock release.
      // One event-owned turn wakes parked work after that release, including
      // work parked by another cache listener during this same notification.
      deferredForge.clear(); wakeForgeAfterSettlement();
    }
    if (projects && ["success", "invalidate", "error"].includes(action.type)) refreshNeighbor();
    if (relevant) {
      if (action.type === "invalidate") attempted.delete(identity);
      refreshPending(identity);
    }
    const transport = ["fetch", "success", "error", "pause", "continue"].includes(action.type) &&
      !(action.type === "success" && action.manual);
    if (relevant || projects || (transport && (preparing.size || pendingKeys.size))) changed();
  });
  const resume = () => {
    if (!visible()) { changed(); return; }
    // Realtime owns freshness. Resume only missing/invalidated reads rather
    // than treating the passage of time as permission to trust stale data.
    for (const [identity, entry] of manifest) {
      const state = client.getQueryState(entry.query.options.queryKey);
      if (state?.isInvalidated || (state?.status !== "error" && state?.data === undefined)) attempted.delete(identity);
    }
    refreshNeighbor(); refreshPending(); changed();
  };
  const stopOnline = onlineManager.subscribe(resume);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", resume);
  if (typeof window !== "undefined") window.addEventListener("focus", resume);
  return {
    visit(href: string, hrefs: readonly string[]) {
      if (disposed) return;
      cancelScheduled();
      clearTimeout(forgeWake); forgeWake = undefined; parkedForge.clear(); deferredForge.clear();
      active = href;
      const counts = new Map<string, number>();
      visits.forEach((target) => counts.set(target, (counts.get(target) ?? 0) + 1));
      const ranked = [...new Set(hrefs)].filter((target) => target !== href).sort((a, b) =>
        (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || visits.lastIndexOf(b) - visits.lastIndexOf(a) ||
        Number(appTabRoute(a).section === "pull-requests") - Number(appTabRoute(b).section === "pull-requests"));
      available = [href, ...ranked].slice(0, RESTORED_TAB_PREPARATION_LIMIT);
      const options = appTabPreparationQueries(client, href);
      activeQueryHashes.clear();
      for (const option of options) activeQueryHashes.add(hashKey(option.queryKey));
      if (!options.length || options.some((option) => missing(option.queryKey))) {
        for (const read of preparing.values()) if (!options.some((option) => hashKey(option.queryKey) === read.identity)) yieldRead(read);
      }
      visits.push(href); if (visits.length > 32) visits.shift();
      attempted.clear(); rebuildManifest();
      // Public code has no account payload and must not wait for query transport.
      for (const target of available) void prepareAppTabSurface(target)?.catch(() => {});
      syncPriority();
      pagePreparation.visit(href, available);
      enqueue();
    },
    dispose() {
      disposed = true; activeQueryHashes.clear(); cancelScheduled(); stop(); stopOnline(); stopInsertSettlement();
      clearTimeout(forgeWake); forgeWake = undefined; parkedForge.clear(); deferredForge.clear();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", resume);
      if (typeof window !== "undefined") window.removeEventListener("focus", resume);
      neighborAttempts.clear();
      selectionSources.clear();
      pendingInsertSources.clear();
      pagePreparation.dispose();
      for (const pair of bootstrapPairs) {
        for (const identity of Array.from(pair.readers.keys())) restoreBootstrapReader(pair, identity);
        disposeBootstrapPair(pair);
      }
      bootstrapPairs.clear();
      workingSet.dispose();
      priority.release();
      yieldReads();
    },
  };
}
