import { describe, expect, it } from "vitest";

import {
  isAgentRunResumable,
  isLatestAgentRunResumable,
} from "./agent-api";
import { agentRunCanResume } from "./agent-run-resumability";

describe("agent run resumability", () => {
  it("distinguishes an interrupted turn from a failed bootstrap", () => {
    expect(agentRunCanResume({ status: "failed", checkpoint: {} })).toBe(true);
    expect(agentRunCanResume({ status: "failed", checkpoint: null })).toBe(false);
  });

  it("uses the private server verdict for failed run summaries", () => {
    expect(isAgentRunResumable("failed", true)).toBe(true);
    expect(isAgentRunResumable("failed", false)).toBe(false);
    expect(isAgentRunResumable("completed")).toBe(true);
  });

  it("bases conversation availability on the latest run", () => {
    expect(
      isLatestAgentRunResumable([
        { status: "failed", resumable: false },
        { status: "failed", resumable: true },
      ]),
    ).toBe(false);
    expect(
      isLatestAgentRunResumable([
        { status: "failed", resumable: true },
        { status: "failed", resumable: false },
      ]),
    ).toBe(true);
    expect(isLatestAgentRunResumable([])).toBe(false);
  });
});
