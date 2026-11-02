import { describe, expect, it } from "vitest";
import { prPreviewChecks } from "./pr-preview-checks";
import { reducePullRequestReadiness, type ReadinessCheck, type ReadinessInput } from "./pr-readiness";

const readiness = (checks: ReadinessCheck[] | null, overrides: Partial<ReadinessInput> = {}) =>
  reducePullRequestReadiness({
    state: "open",
    merged: false,
    draft: false,
    mergeabilityReason: "clean",
    policy: null,
    checks,
    checksStatus: checks ? "loaded" : "unavailable",
    approvals: null,
    changesRequested: null,
    reviewThreads: null,
    canWrite: true,
    ...overrides,
  });

describe("prPreviewChecks", () => {
  it("says the required checks passed", () => {
    expect(prPreviewChecks(readiness([
      { name: "build", state: "success", required: true },
      { name: "lint", state: "success", required: true },
    ]))).toEqual({ status: "passed", count: 2, names: [] });
  });

  it("names the failed checks", () => {
    expect(prPreviewChecks(readiness([
      { name: "build", state: "success", required: true },
      { name: "e2e", state: "failure", required: true },
    ]))).toEqual({ status: "failed", count: 1, names: ["e2e"] });
  });

  it("shows a running suite as running even when a check already failed", () => {
    expect(prPreviewChecks(readiness([
      { name: "e2e", state: "failure", required: true },
      { name: "build", state: "pending", required: true },
    ]))).toMatchObject({ status: "running", names: ["build"] });
  });

  it("says nothing when the forge would not give the checks", () => {
    expect(prPreviewChecks(readiness(null))).toBeNull();
  });

  it("says nothing of a merged or closed pull request", () => {
    expect(prPreviewChecks(readiness([], { merged: true }))).toBeNull();
    expect(prPreviewChecks(readiness([], { state: "closed" }))).toBeNull();
    expect(prPreviewChecks(null)).toBeNull();
  });
});
