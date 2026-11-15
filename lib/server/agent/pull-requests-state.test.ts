import { describe, expect, it } from "vitest";
import { prStateFromRef } from "./pull-requests";
import type { PullRequestRef } from "@/lib/pull-request-contract";

/**
 * `prStateFromRef` — “what the forge API answers” → minddy state. It is the
 * THIRD of the three state rules (alongside `githubPrState` / `gitlabMrState`,
 * which read webhook payloads), and the only one that speaks the NEUTRAL
 * vocabulary of `PullRequestRef`: both forges are already normalized there by
 * their own `toRef`.
 *
 * It backs the newest paths, in-app reopening (`pr-state-actions`, which reads the
 * state from the PR the forge returns rather than assuming `open`) and scan
 * reconciliation (`syncRepoPullRequests`), plus `registerPr` and the legacy
 * prompt. A mistake here is not harmless: it moves an issue.
 *
 * ORDER is all it asserts, and it fits in two sentences: merged trumps
 * closed, and a draft is only a draft while it is open.
 */

const ref = (over: Partial<PullRequestRef>): PullRequestRef => ({
  number: 12,
  url: "https://example.test/pull/12",
  state: "open",
  ...over,
});

describe("prStateFromRef", () => {
  it("merged wins over closed: both forges close when merging", () => {
    // GitHub: `state: "closed"` + `merged: true`. GitLab: `toRef` maps
    // `state: "merged"` to `state: "closed"` + `merged: true`.
    expect(prStateFromRef(ref({ state: "closed", merged: true }))).toBe("merged");
    expect(prStateFromRef(ref({ state: "closed" }))).toBe("closed");
  });

  it("a draft is a draft only while it is OPEN", () => {
    expect(prStateFromRef(ref({ state: "open", draft: true }))).toBe("draft");
    // GitHub does NOT clear `draft` on close: reporting it as “draft” would
    // hide that it is dead, and the issue would go “in progress” instead of
    // “to do”. This is the case that motivated MIN-164.
    expect(prStateFromRef(ref({ state: "closed", draft: true }))).toBe("closed");
    // Same for a merged draft PR (rare, but GitHub allows it after an
    // API-side `ready_for_review`).
    expect(prStateFromRef(ref({ state: "closed", draft: true, merged: true }))).toBe("merged");
  });

  it("everything else is open, `locked` included (already mapped by `toRef`)", () => {
    expect(prStateFromRef(ref({ state: "open" }))).toBe("open");
    expect(prStateFromRef(ref({ state: "open", draft: false, merged: false }))).toBe("open");
  });
});
