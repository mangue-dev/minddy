import { describe, expect, it } from "vitest";

import { localExecRequested } from "./local-exec";

/** Local execution requires both an explicit choice and a trusted run scope. */
describe("localExecRequested", () => {
  const base = { triggeredBy: "button" } as const;

  it("allows an interactive launch that requests local execution", () => {
    expect(localExecRequested({ ...base, localExec: true })).toBe(true);
    expect(localExecRequested({ triggeredBy: "chat", localExec: true })).toBe(
      true,
    );
  });

  it("never invents local execution when it was not requested", () => {
    expect(localExecRequested(base)).toBe(false);
    expect(localExecRequested({ ...base, localExec: false })).toBe(false);
  });

  it("rejects routine-triggered local execution", () => {
    expect(
      localExecRequested({ triggeredBy: "routine", localExec: true }),
    ).toBe(false);
    expect(
      localExecRequested({ ...base, localExec: true, routineId: "r-1" }),
    ).toBe(false);
  });

  it("rejects automation and chain-triggered local execution", () => {
    expect(
      localExecRequested({ ...base, localExec: true, chainId: "c-1" }),
    ).toBe(false);
    expect(
      localExecRequested({ triggeredBy: "automation", localExec: true }),
    ).toBe(false);
  });

  it("rejects mention-triggered local execution", () => {
    expect(
      localExecRequested({ triggeredBy: "mention", localExec: true }),
    ).toBe(false);
  });

  it("rejects pull-request context even when issue context was confirmed", () => {
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
    ).toBe(false);
  });
});
