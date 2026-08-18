import { describe, expect, it } from "vitest";

import {
  parsePrLiveParts,
  prLiveQueryKeys,
  pullRequestTopic,
  type PrLivePart,
} from "./pr-live";

const PR = "8f14e45f-ceea-467a-9a67-1c8dcbc4b2d3";

describe("pullRequestTopic", () => {
  it("nomme le topic comme les autres topics privés", () => {
    expect(pullRequestTopic(PR)).toBe(`pull-request:${PR}`);
  });
});

describe("prLiveQueryKeys", () => {
  it("mappe chaque partie sur le cache que l'écran lit", () => {
    expect(prLiveQueryKeys(PR, ["pr"])).toEqual([["pull-request", PR]]);
    expect(prLiveQueryKeys(PR, ["conversation"])).toEqual([["pr-comments", PR]]);
    expect(prLiveQueryKeys(PR, ["commits"])).toEqual([["pr-commits", PR]]);
  });

  it("rend les remarques de ligne en PRÉFIXE, sans endpoint", () => {
    // Two endpoint forms read the same comments — the PR page
    // (`prEndpoint`) and the diff view of a session (`runPrEndpoint`). Appoint
    // one of the two would leave the other obsolete.
    expect(prLiveQueryKeys(PR, ["reviewComments"])).toEqual([["pr-review-comments"]]);
  });

  it("garde l'ordre des parties du message", () => {
    expect(prLiveQueryKeys(PR, ["conversation", "pr"])).toEqual([
      ["pr-comments", PR],
      ["pull-request", PR],
    ]);
  });

  it("dédoublonne les clés d'un même message", () => {
    // A review moves the thread, the comments AND the header; two parties can
    // aiming at the same key, and invalidating twice would trigger two refetches.
    expect(
      prLiveQueryKeys(PR, ["pr", "conversation", "reviewComments", "pr", "reviewComments"]),
    ).toEqual([["pull-request", PR], ["pr-comments", PR], ["pr-review-comments"]]);
  });

  it("ne rend rien pour un message sans partie", () => {
    expect(prLiveQueryKeys(PR, [])).toEqual([]);
  });

  it("couvre les quatre parties du type", () => {
    const all: PrLivePart[] = ["pr", "conversation", "commits", "reviewComments"];
    expect(prLiveQueryKeys(PR, all)).toHaveLength(4);
  });
});

describe("parsePrLiveParts", () => {
  it("garde les parties connues et jette le reste", () => {
    expect(parsePrLiveParts(["pr", "nope", 3, null, "commits"])).toEqual(["pr", "commits"]);
  });

  it("répond vide sur ce qui n'est pas une liste", () => {
    expect(parsePrLiveParts(undefined)).toEqual([]);
    expect(parsePrLiveParts("pr")).toEqual([]);
    expect(parsePrLiveParts({ parts: ["pr"] })).toEqual([]);
  });
});
