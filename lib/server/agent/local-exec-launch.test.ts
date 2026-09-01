import { describe, expect, it } from "vitest";

import { localExecRequested } from "./local-exec";

/**
 * MIN-359 — the `localExec` flag arrives in the body of a POST: it is a
 * REQUEST. These cases say what transforms it into a fact. Automated or
 * externally-triggered context never reaches the user's machine; issue and
 * pull-request context additionally require explicit acknowledgement.
 */
describe("localExecRequested", () => {
  const base = { triggeredBy: "button" } as const;

  it("allows an interactive launch that requests local execution", () => {
    expect(localExecRequested({ ...base, localExec: true })).toBe(true);
    expect(localExecRequested({ triggeredBy: "chat", localExec: true })).toBe(true);
  });

  it("never invents local execution when it was not requested", () => {
    expect(localExecRequested(base)).toBe(false);
    expect(localExecRequested({ ...base, localExec: false })).toBe(false);
  });

  it("refuses a routine even when it appears to come from a button", () => {
    expect(
      localExecRequested({ triggeredBy: "routine", localExec: true }),
    ).toBe(false);
    expect(
      localExecRequested({ ...base, localExec: true, routineId: "r-1" }),
    ).toBe(false);
  });

  it("refuses an automation chain step", () => {
    expect(localExecRequested({ ...base, localExec: true, chainId: "c-1" })).toBe(false);
    expect(
      localExecRequested({ triggeredBy: "automation", localExec: true }),
    ).toBe(false);
  });

  it("refuses a mention because it may come from a forge webhook", () => {
    // Nothing here distinguishes a mention typed in minddy from a
    // pull request comment copied by a webhook. As long as the source
    // is not carried so far (MIN-360), refusal is the only safe choice.
    expect(localExecRequested({ triggeredBy: "mention", localExec: true })).toBe(false);
  });

  it("allows a pull-request review only after explicit confirmation", () => {
    expect(
      localExecRequested({ ...base, pullRequestId: "pr-1", localExec: true }),
    ).toBe(false);
    expect(
      localExecRequested({
        ...base,
        pullRequestId: "pr-1",
        localExec: true,
        localIssueContextConfirmed: true,
      }),
    ).toBe(true);
  });
});
