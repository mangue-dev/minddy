import { describe, expect, it } from "vitest";

import {
  LOCAL_CLAIM_IDLE_DELAY_MS,
  LOCAL_CLAIM_MAX_PROJECTS,
  LOCAL_CLAIM_REFUSED_DELAY_MS,
  LOCAL_CLAIM_RETRY_DELAY_MS,
  localClaimProjectIds,
  nextLocalClaimDelay,
} from "./local-claim";

describe("localClaimProjectIds", () => {
  it("n'expose que les ids de projet, jamais leurs chemins", () => {
    const id = "11111111-2222-4333-8444-555555555555";
    expect(localClaimProjectIds({ [id]: "/Users/clement/secret/repo", hostile: "/tmp/x" }))
      .toEqual([id]);
  });

  it("bounds a machine announcement", () => {
    const store = Object.fromEntries(
      Array.from({ length: 60 }, (_, n) => [
        `11111111-2222-4333-8444-${String(n).padStart(12, "0")}`,
        `/repo/${n}`,
      ]),
    );
    expect(localClaimProjectIds(store)).toHaveLength(LOCAL_CLAIM_MAX_PROJECTS);
  });
});

describe("nextLocalClaimDelay", () => {
  it("chains a successful claim and spaces out idle or failed states", () => {
    expect(nextLocalClaimDelay("claimed")).toBe(0);
    expect(nextLocalClaimDelay("idle")).toBe(LOCAL_CLAIM_IDLE_DELAY_MS);
    expect(nextLocalClaimDelay("refused")).toBe(LOCAL_CLAIM_REFUSED_DELAY_MS);
    expect(nextLocalClaimDelay("unavailable")).toBe(LOCAL_CLAIM_RETRY_DELAY_MS);
  });
});
