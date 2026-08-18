import { describe, expect, it } from "vitest";

import { localRunScope, rowMayRunLocally } from "./local-exec-scope";

/**
 * MIN-360 — THE INVARIANT OF RUNS WITH THIRD-PARTY CONTENT.
 *
 * PURE logic, tested like [prune.test.ts](prune.test.ts): we call, on
 * assert. What it decides, on the other hand, is nothing minor — a run whose
 * context is text from a potential attacker which would start on a local
 * machine, it is a prompt injection which becomes a shell on the computer of the
 * developer.
 *
 * The case which motivated the module is the last of this file: `job.interactive`
 * is `!run.routine_id`, so **true** for a replay of pull request
 * triggered by a webhook.
 */

const ctx = (over: Partial<Parameters<typeof localRunScope>[0]> = {}) => ({
  triggeredBy: "button" as const,
  ...over,
});

describe("localRunScope", () => {
  it("laisse passer ce que la personne lance elle-même", () => {
    expect(localRunScope(ctx())).toEqual({ ok: true });
    expect(localRunScope(ctx({ triggeredBy: "chat" }))).toEqual({ ok: true });
  });

  it("refuse une relecture de pull request", () => {
    // A fork's diff and comments are written by anyone. THE
    // repository already recognizes this by refusing a `repo-write` token in these sessions.
    expect(localRunScope(ctx({ pullRequestId: "pr-1" }))).toEqual({
      ok: false,
      reason: "pull_request",
    });
  });

  it("refuse ce que personne n'a devant les yeux", () => {
    expect(localRunScope(ctx({ routineId: "r-1" }))).toEqual({ ok: false, reason: "routine" });
    expect(localRunScope(ctx({ chainId: "c-1" }))).toEqual({ ok: false, reason: "chain" });
    expect(localRunScope(ctx({ triggeredBy: "automation" }))).toEqual({
      ok: false,
      reason: "trigger",
    });
    expect(localRunScope(ctx({ triggeredBy: "routine" }))).toEqual({
      ok: false,
      reason: "trigger",
    });
  });

  it("refuse une mention, même quand elle a l'air interne", () => {
    // A mention can come from a forge comment copied by a webhook, and
    // nothing here distinguishes the two.
    expect(localRunScope(ctx({ triggeredBy: "mention" }))).toEqual({
      ok: false,
      reason: "trigger",
    });
  });

  it("refuse une source qu'il ne connaît pas — la liste est FERMÉE", () => {
    // The gateway that we will write next year (public board, webhook of a
    // other forge) must be refused by default, not authorized by forgetting.
    expect(localRunScope(ctx({ triggeredBy: "feedback_board" }))).toEqual({
      ok: false,
      reason: "trigger",
    });
    expect(localRunScope(ctx({ triggeredBy: "" }))).toEqual({ ok: false, reason: "trigger" });
  });

  it("refuse dès la PREMIÈRE raison, et la nomme", () => {
    // A chain run ON a pull request: the pattern rendered is the one that is
    // tells the best story, and the order is stable so that the logs are stable too.
    expect(localRunScope(ctx({ pullRequestId: "pr-1", chainId: "c-1" }))).toEqual({
      ok: false,
      reason: "pull_request",
    });
  });
});

describe("rowMayRunLocally", () => {
  it("pose la même question d'une ligne de la base", () => {
    expect(
      rowMayRunLocally({
        triggered_by: "button",
        routine_id: null,
        chain_id: null,
        pull_request_id: null,
      }),
    ).toEqual({ ok: true });
    expect(
      rowMayRunLocally({
        triggered_by: "button",
        routine_id: null,
        chain_id: null,
        pull_request_id: "pr-1",
      }),
    ).toEqual({ ok: false, reason: "pull_request" });
  });

  it("refuse une ligne muette", () => {
    // An absent column is not authorization: it is ignorance.
    expect(rowMayRunLocally({})).toEqual({ ok: false, reason: "trigger" });
  });
});
