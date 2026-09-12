import { describe, expect, it } from "vitest";

import { resolveAgentExecutionTarget } from "./agent-execution-target";

const selfHosted = {
  AGENT_EXECUTION_BACKEND: "self-hosted",
  AGENT_RUNNER_URL: "http://agent-runner:6464",
  AGENT_RUNNER_SECRET: "runner-secret",
};

describe("agent execution target", () => {
  it("routes interactive Numo and routine runs to the same self-hosted sandbox backend", () => {
    expect(resolveAgentExecutionTarget(selfHosted)).toBe("self-hosted");
  });

  it("routes desktop-initiated workers through the configured server backend", () => {
    expect(resolveAgentExecutionTarget(selfHosted)).not.toBe("desktop");
  });

  it("does not invent a server backend when none is configured", () => {
    expect(resolveAgentExecutionTarget({})).toBeNull();
  });
});
