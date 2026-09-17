import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import type {
  AgentRunPrResponse,
  PullRequestListItem,
  PullRequestListResponse,
} from "./agent-api";
import {
  ALL_PULL_REQUESTS_QUERY_KEY,
  matchesStateFilter,
  updateCachedPullRequestState,
} from "./pull-request-list-cache";

/**
 * The caches of the Pull Requests page against ONE state change
 * (`updateCachedPullRequestState`) — the write every merge, close, reopen and
 * draft flip goes through, be it clicked in the panel, landed in the
 * background by a Numo merge, or reread live from the forge.
 *
 * What it must NOT do is decide anything about the FILTERS: a line that
 * leaves the current lens disappears, and when it was the last open PR the
 * list simply empties (the selection falls to zero — the page never widens
 * the lens on its own to keep a merged PR visible). The tests below pin the
 * mechanics the selection derivation of the page reads.
 */

const item = (over: Partial<PullRequestListItem>): PullRequestListItem => ({
  prId: "pr-1",
  pr_number: 12,
  pr_url: null,
  pr_state: "open",
  provider: "github",
  title: "Fix the flaky test",
  author: { login: "ada", avatar_url: null },
  head_branch: "numo/fix",
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-01T10:00:00Z",
  issue: null,
  project: null,
  runId: null,
  numoOpened: false,
  activeRunId: null,
  busyRunId: null,
  runIds: [],
  ...over,
});

const page = (pullRequests: PullRequestListItem[]): PullRequestListResponse => ({
  pullRequests,
  hasMore: false,
  truncated: false,
  repoCount: 1,
  anyPr: true,
});

const OPEN_KEY = ["pull-requests", "all", "open", 100, null, null] as const;
const ALL_KEY = ["pull-requests", "all", "all", 100, null, null] as const;
const MERGED_KEY = ["pull-requests", "all", "merged", 100, null, null] as const;
const DETAIL_KEY = ["pull-request", "pr-1"] as const;

const newClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe("matchesStateFilter", () => {
  it("`open` understands drafts, like the filter served by the API", () => {
    expect(matchesStateFilter("open", "open")).toBe(true);
    expect(matchesStateFilter("draft", "open")).toBe(true);
    expect(matchesStateFilter("merged", "open")).toBe(false);
  });

  it("`all` keeps everything; the other lenses keep their own state", () => {
    for (const state of ["draft", "open", "merged", "closed"] as const) {
      expect(matchesStateFilter(state, "all")).toBe(true);
    }
    expect(matchesStateFilter("merged", "merged")).toBe(true);
    expect(matchesStateFilter("open", "merged")).toBe(false);
  });
});

describe("updateCachedPullRequestState", () => {
  it("drops the line from a lens it no longer matches, keeps it in the others", () => {
    const client = newClient();
    client.setQueryData(
      OPEN_KEY,
      page([item({ prId: "pr-1" }), item({ prId: "pr-2" })]),
    );
    client.setQueryData(ALL_KEY, page([item({ prId: "pr-1" })]));

    updateCachedPullRequestState(client, "pr-1", "merged");

    // The “open” lens lost the line and kept the other one...
    expect(
      client.getQueryData<PullRequestListResponse>(OPEN_KEY)?.pullRequests.map(
        (pr) => pr.prId,
      ),
    ).toEqual(["pr-2"]);
    // ...and the “all” lens kept it, under its new state.
    expect(
      client.getQueryData<PullRequestListResponse>(ALL_KEY)?.pullRequests,
    ).toEqual([expect.objectContaining({ prId: "pr-1", pr_state: "merged" })]);
  });

  it("an untouched cache is left exactly as it was", () => {
    const client = newClient();
    client.setQueryData(OPEN_KEY, page([item({ prId: "pr-2" })]));

    updateCachedPullRequestState(client, "pr-1", "merged");

    expect(
      client.getQueryData<PullRequestListResponse>(OPEN_KEY)?.pullRequests.map(
        (pr) => pr.prId,
      ),
    ).toEqual(["pr-2"]);
  });

  it("patches the detail's own cache so the panel does not flash two states", () => {
    const client = newClient();
    client.setQueryData<AgentRunPrResponse>(DETAIL_KEY, {
      pr: { number: 12, url: "", state: "open", draft: false, merged: false },
      files: [],
    });

    updateCachedPullRequestState(client, "pr-1", "merged");

    expect(
      client.getQueryData<AgentRunPrResponse>(DETAIL_KEY)?.pr,
    ).toMatchObject({ state: "merged", merged: true, draft: false });
  });

  it("never renames a filter: only existing cache variants are rewritten", () => {
    const client = newClient();
    client.setQueryData(OPEN_KEY, page([item({ prId: "pr-1" })]));

    updateCachedPullRequestState(client, "pr-1", "merged");

    // The “merged” lens was never open: no cache for it must appear — the
    // reader opens it themselves, the page does not widen anything.
    const keys = client.getQueryCache().getAll().map((query) => query.queryKey);
    expect(keys.some((key) => key[2] === "merged")).toBe(false);
    expect(keys).toEqual([OPEN_KEY]);
  });

  it("the prefix key matches every variant of the list", () => {
    expect(ALL_PULL_REQUESTS_QUERY_KEY).toEqual(["pull-requests", "all"]);
    const client = newClient();
    for (const key of [OPEN_KEY, MERGED_KEY, ALL_KEY]) {
      client.setQueryData(key, page([]));
    }
    // Same shape as the updater's own lookup.
    const found = client.getQueriesData<PullRequestListResponse>({
      queryKey: ALL_PULL_REQUESTS_QUERY_KEY,
    });
    expect(found).toHaveLength(3);
  });
});
