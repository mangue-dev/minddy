import { describe, expect, it } from "vitest";

import { localExecRequested } from "./local-exec";

/** The local execution flag is an explicit destination choice, independent
 * from the run's trigger or anchor. */
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

  it("allows routine-triggered local execution", () => {
    expect(
      localExecRequested({ triggeredBy: "routine", localExec: true }),
    ).toBe(true);
    expect(
      localExecRequested({ ...base, localExec: true, routineId: "r-1" }),
    ).toBe(true);
  });

  it("allows an automation chain step", () => {
    expect(
      localExecRequested({ ...base, localExec: true, chainId: "c-1" }),
    ).toBe(true);
    expect(
      localExecRequested({ triggeredBy: "automation", localExec: true }),
    ).toBe(true);
  });

  it("allows a mention-triggered local run", () => {
    expect(
      localExecRequested({ triggeredBy: "mention", localExec: true }),
    ).toBe(true);
  });

  it("does not require a separate confirmation for pull-request context", () => {
    expect(
      localExecRequested({ ...base, pullRequestId: "pr-1", localExec: true }),
    ).toBe(true);
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
