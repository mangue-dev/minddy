import { describe, expect, it } from "vitest";
import { prStateFromRef } from "./pull-requests";
import type { PullRequestRef } from "./pr";

/**
 * `prStateFromRef` — “what the forge API responds to” → minddy state. This is the
 * THIRD of the three state rules (along with `githubPrState` / `gitlabMrState`, which
 * reads webhook payloads), and the only one that speaks the NEUTRAL
 * vocabulary of `PullRequestRef`: both forges are already there normalized by their respective
 * `toRef`.
 *
 * It carries the most recent paths — in-app reopening (`pr-actions`,
 * which reads the state on the PR that the forge returns rather than assume
 * `open`) and scan reconciliation (`syncRepoPullRequests`) — plus
 * `registerPr` and inheritance prompt. Getting it wrong here doesn't mean anything: it moves
 * a ticket.
 *
 * ORDER is all it asserts, and it fits in two sentences: merged
 * trumps closed, and a draft is only a draft as long as it is
 * open.
 */

const ref = (over: Partial<PullRequestRef>): PullRequestRef => ({
  number: 12,
  url: "https://example.test/pull/12",
  state: "open",
  ...over,
});

describe("prStateFromRef", () => {
  it("fusionnée l'emporte sur fermée — les deux forges ferment en fusionnant", () => {
    // GitHub : `state: "closed"` + `merged: true`. GitLab : `toRef` traduit
    // `state: "merged"` en `state: "closed"` + `merged: true`.
    expect(prStateFromRef(ref({ state: "closed", merged: true }))).toBe("merged");
    expect(prStateFromRef(ref({ state: "closed" }))).toBe("closed");
  });

  it("un brouillon n'est brouillon que tant qu'il est OUVERT", () => {
    expect(prStateFromRef(ref({ state: "open", draft: true }))).toBe("draft");
    // GitHub NE RETIRE PAS `draft` en fermant : l'annoncer « brouillon »
    // would hide that he is dead, and the ticket would go “in progress” instead
    // of “to do”. This is the case that motivated MIN-164.
    expect(prStateFromRef(ref({ state: "closed", draft: true }))).toBe("closed");
    // Same as a merged draft PR (rare, but GitHub authorizes it after
    // `ready_for_review` API side).
    expect(prStateFromRef(ref({ state: "closed", draft: true, merged: true }))).toBe("merged");
  });

  it("tout le reste est ouvert — `locked` compris (déjà traduit par `toRef`)", () => {
    expect(prStateFromRef(ref({ state: "open" }))).toBe("open");
    expect(prStateFromRef(ref({ state: "open", draft: false, merged: false }))).toBe("open");
  });
});
