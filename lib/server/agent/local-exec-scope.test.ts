import { describe, expect, it } from "vitest";

import { localRunScope, rowMayRunLocally } from "./local-exec-scope";

describe("local OpenCode admission", () => {
  it("admits every anchor and trigger through the same harness", () => {
    const inputs = [
      { triggeredBy: "button" },
      { triggeredBy: "chat", issueId: "issue-1" },
      { triggeredBy: "mention", pullRequestId: "pr-1" },
      { triggeredBy: "automation", chainId: "chain-1" },
      { triggeredBy: "routine", routineId: "routine-1" },
      { triggeredBy: "future-trigger" },
    ];
    for (const input of inputs)
      expect(localRunScope(input)).toEqual({ ok: true });
  });

  it("applies the same admission to persisted runs", () => {
    expect(rowMayRunLocally({})).toEqual({ ok: true });
    expect(
      rowMayRunLocally({
        triggered_by: "automation",
        routine_id: "routine-1",
        chain_id: "chain-1",
        pull_request_id: "pr-1",
        local_issue_context_confirmed: false,
      }),
    ).toEqual({ ok: true });
  });
});
