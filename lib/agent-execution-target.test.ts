import { describe, expect, it } from "vitest";

import { resolveAgentExecutionTarget } from "./agent-execution-target";

const selfHosted = {
  AGENT_EXECUTION_BACKEND: "self-hosted",
  AGENT_RUNNER_URL: "http://agent-runner:6464",
  AGENT_RUNNER_SECRET: "runner-secret",
};

describe("agent execution target", () => {
  it("routes interactive Numo and routine runs to the same self-hosted sandbox backend", () => {
    const interactiveRun = { localExec: false, routineId: null };
    const routineRun = { localExec: false, routineId: "routine-1" };

    expect(resolveAgentExecutionTarget(interactiveRun, selfHosted)).toBe("self-hosted");
    expect(resolveAgentExecutionTarget(routineRun, selfHosted)).toBe("self-hosted");
  });

  it("keeps an explicit desktop-local run on the desktop", () => {
    expect(resolveAgentExecutionTarget({ localExec: true }, selfHosted)).toBe("desktop");
  });

  it("does not invent a server backend when none is configured", () => {
    expect(resolveAgentExecutionTarget({ localExec: false }, {})).toBeNull();
  });
});
