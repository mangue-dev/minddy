import { describe, expect, it } from "vitest";

import { localRunScope, rowMayRunLocally } from "./local-exec-scope";

describe("local OpenCode admission", () => {
  it("admits direct button and chat launches", () => {
    expect(localRunScope({ triggeredBy: "button" })).toEqual({ ok: true });
    expect(localRunScope({ triggeredBy: "chat" })).toEqual({ ok: true });
  });

  it("requires explicit confirmation for issue context", () => {
    expect(
      localRunScope({ triggeredBy: "button", issueId: "issue-1" }),
    ).toEqual({ ok: false, reason: "issue_confirmation" });
    expect(
      localRunScope({
        triggeredBy: "button",
        issueId: "issue-1",
        localIssueContextConfirmed: true,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects pull requests, routines, chains, mentions, and future triggers", () => {
    expect(
      localRunScope({ triggeredBy: "button", pullRequestId: "pr-1" }),
    ).toEqual({ ok: false, reason: "pull_request" });
    expect(
      localRunScope({ triggeredBy: "button", routineId: "routine-1" }),
    ).toEqual({ ok: false, reason: "routine" });
    expect(
      localRunScope({ triggeredBy: "button", chainId: "chain-1" }),
    ).toEqual({ ok: false, reason: "chain" });
    for (const triggeredBy of ["mention", "automation", "routine", "future-trigger", ""]) {
      expect(localRunScope({ triggeredBy })).toEqual({
        ok: false,
        reason: "trigger",
      });
    }
  });

  it("applies the same closed policy to persisted rows", () => {
    expect(rowMayRunLocally({})).toEqual({ ok: false, reason: "trigger" });
    expect(rowMayRunLocally({ triggered_by: "button" })).toEqual({ ok: true });
    expect(
      rowMayRunLocally({
        triggered_by: "automation",
        routine_id: "routine-1",
        chain_id: "chain-1",
        pull_request_id: "pr-1",
        local_issue_context_confirmed: false,
      }),
    ).toEqual({ ok: false, reason: "pull_request" });
  });
});
