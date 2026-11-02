import { describe, expect, it } from "vitest";

import {
  parsePrLiveParts,
  prLiveQueryKeys,
  pullRequestTopic,
  type PrLivePart,
} from "./pr-live";

const PR = "8f14e45f-ceea-467a-9a67-1c8dcbc4b2d3";

describe("pullRequestTopic", () => {
  it("names the topic like the other private topics", () => {
    expect(pullRequestTopic(PR)).toBe(`pull-request:${PR}`);
  });
});

describe("prLiveQueryKeys", () => {
  it("maps each part to the cache the screen reads", () => {
    expect(prLiveQueryKeys(PR, ["pr"])).toEqual([
      ["pull-request", PR],
      ["pull-request-deployment", PR],
      ["pull-request-readiness"],
    ]);
    expect(prLiveQueryKeys(PR, ["conversation"])).toEqual([["pr-comments", PR]]);
    expect(prLiveQueryKeys(PR, ["commits"])).toEqual([["pr-commits", PR]]);
  });

  it("returns line comments as a PREFIX, without an endpoint", () => {
    // Two endpoint forms read the same comments — the PR page
    // (`prEndpoint`) and the diff view of a session (`runPrEndpoint`). Naming
    // one of the two would leave the other stale.
    expect(prLiveQueryKeys(PR, ["reviewComments"])).toEqual([["pr-review-comments"]]);
  });

  it("keeps the order of the message parts", () => {
    expect(prLiveQueryKeys(PR, ["conversation", "pr"])).toEqual([
      ["pr-comments", PR],
      ["pull-request", PR],
      ["pull-request-deployment", PR],
      ["pull-request-readiness"],
    ]);
  });

  it("deduplicates the keys of one message", () => {
    // A review moves the thread, the comments AND the header; two parts can
    // target the same key, and invalidating twice would trigger two refetches.
    expect(
      prLiveQueryKeys(PR, ["pr", "conversation", "reviewComments", "pr", "reviewComments"]),
    ).toEqual([
      ["pull-request", PR],
      ["pull-request-deployment", PR],
      ["pull-request-readiness"],
      ["pr-comments", PR],
      ["pr-review-comments"],
    ]);
  });

  it("returns nothing for a message without parts", () => {
    expect(prLiveQueryKeys(PR, [])).toEqual([]);
  });

  it("covers the four parts of the type", () => {
    const all: PrLivePart[] = ["pr", "conversation", "commits", "reviewComments"];
    expect(prLiveQueryKeys(PR, all)).toHaveLength(6);
  });
});

describe("parsePrLiveParts", () => {
  it("keeps known parts and drops the rest", () => {
    expect(parsePrLiveParts(["pr", "nope", 3, null, "commits"])).toEqual(["pr", "commits"]);
  });

  it("answers empty for anything that is not a list", () => {
    expect(parsePrLiveParts(undefined)).toEqual([]);
    expect(parsePrLiveParts("pr")).toEqual([]);
    expect(parsePrLiveParts({ parts: ["pr"] })).toEqual([]);
  });
});
