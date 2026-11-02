import { afterEach, describe, expect, it, vi } from "vitest";

import { getPullRequest } from "./pr";

/**
 * The PR read behind the detail (MIN-889). Its merge-flow GraphQL query used
 * to wait for the REST response to learn the node id, doubling the critical
 * path of every detail read.
 */

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

const CALL = { token: "t", repoFullName: "acme/app", number: 7 };

const REST_PR = {
  number: 7,
  html_url: "https://github.com/acme/app/pull/7",
  state: "open",
  draft: false,
  title: "Fix",
  head: { ref: "fix", sha: "head-sha", repo: { full_name: "acme/app" } },
  base: { ref: "main" },
  node_id: "PR_node",
  mergeable_state: "blocked",
  auto_merge: { enabled_by: { login: "octo" } },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("getPullRequest", () => {
  it("asks for the merge flow without waiting for the REST response", async () => {
    let graphqlBody: { query: string; variables: Record<string, unknown> } | null = null;
    let graphqlSeen!: () => void;
    const graphqlStarted = new Promise<void>((resolve) => { graphqlSeen = resolve; });
    globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url).endsWith("/graphql")) {
        graphqlBody = JSON.parse(String(init?.body));
        graphqlSeen();
        return json({ data: { repository: { pullRequest: {
          mergeQueueEntry: null, autoMergeRequest: null, reviewDecision: "CHANGES_REQUESTED",
        } } } });
      }
      // The REST read only answers once the GraphQL read has started.
      await graphqlStarted;
      return json(REST_PR);
    }) as unknown as typeof fetch;

    const ref = await getPullRequest(CALL);

    expect(graphqlBody!.variables).toEqual({ owner: "acme", name: "app", number: 7 });
    expect(ref.reviewDecision).toBe("CHANGES_REQUESTED");
    expect(ref.mergeFlowActive).toBe(false);
    expect(ref.mergeabilityReason).toBe("changes_requested");
  });

  it("keeps the REST view when the merge flow cannot be read", async () => {
    globalThis.fetch = vi.fn(async (url: unknown) =>
      String(url).endsWith("/graphql") ? json({ message: "boom" }, 502) : json(REST_PR),
    ) as unknown as typeof fetch;

    const ref = await getPullRequest(CALL);

    expect(ref.headSha).toBe("head-sha");
    expect(ref.mergeFlowActive).toBe(true);
    expect(ref.reviewDecision).toBeUndefined();
  });
});
