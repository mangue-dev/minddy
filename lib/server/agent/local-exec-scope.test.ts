import { describe, expect, it } from "vitest";

import { localRunScope, rowMayRunLocally } from "./local-exec-scope";

/**
 * MIN-360 — THE INVARIANT OF RUNS WITH THIRD-PARTY CONTENT.
 *
 * Pure logic, tested like [prune.test.ts](prune.test.ts): call it and assert.
 * What it decides is not minor — starting a run whose context contains text
 * from a potential attacker can turn prompt injection into a shell on the
 * developer's computer.
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
  it("allows an interactive launch from the signed-in user", () => {
    expect(localRunScope(ctx())).toEqual({ ok: true });
    expect(localRunScope(ctx({ triggeredBy: "chat" }))).toEqual({ ok: true });
  });

  it("requires explicit trust before reviewing a pull request locally", () => {
    expect(localRunScope(ctx({ pullRequestId: "pr-1" }))).toEqual({
      ok: false,
      reason: "issue_confirmation",
    });
    expect(
      localRunScope(
        ctx({ pullRequestId: "pr-1", localIssueContextConfirmed: true }),
      ),
    ).toEqual({ ok: true });
  });

  it("refuses unattended launch sources", () => {
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

  it("refuses a mention even when it looks internal", () => {
    // A mention can come from a forge comment copied by a webhook, and
    // nothing here distinguishes the two.
    expect(localRunScope(ctx({ triggeredBy: "mention" }))).toEqual({
      ok: false,
      reason: "trigger",
    });
  });

  it("refuses an unknown source because admission is closed by default", () => {
    // A future entry point must be refused by default instead of becoming
    // authorized simply because this predicate did not know about it.
    expect(localRunScope(ctx({ triggeredBy: "feedback_board" }))).toEqual({
      ok: false,
      reason: "trigger",
    });
    expect(localRunScope(ctx({ triggeredBy: "" }))).toEqual({ ok: false, reason: "trigger" });
  });

  it("returns the first applicable refusal reason", () => {
    // Automation remains forbidden even if a forged request claims that the
    // pull-request context was accepted.
    expect(localRunScope(ctx({ pullRequestId: "pr-1", chainId: "c-1" }))).toEqual({
      ok: false,
      reason: "chain",
    });
  });
});

describe("rowMayRunLocally", () => {
  it("applies the same rule to a persisted run", () => {
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
        local_issue_context_confirmed: false,
      }),
    ).toEqual({ ok: false, reason: "issue_confirmation" });
    expect(
      rowMayRunLocally({
        triggered_by: "button",
        routine_id: null,
        chain_id: null,
        pull_request_id: "pr-1",
        local_issue_context_confirmed: true,
      }),
    ).toEqual({ ok: true });
  });

  it("refuses a row without a known trigger", () => {
    // An absent column is not authorization: it is ignorance.
    expect(rowMayRunLocally({})).toEqual({ ok: false, reason: "trigger" });
  });
});
