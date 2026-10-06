import { describe, expect, it } from "vitest";
import {
  ONBOARDING_DISMISSED_META_KEY, ONBOARDING_STARTED_META_KEY,
  ONBOARDING_STEPS_META_KEY, ONBOARDING_VERSION_META_KEY,
  ONBOARDING_STEPS, readAcknowledgedSteps, resolveOnboardingState, withAcknowledgedStep,
} from "@/lib/onboarding";

const FRESH = { meta: null, projectCount: 0, issueCount: 0, cyclesEnabled: false };
const STARTED = { [ONBOARDING_STARTED_META_KEY]: true, [ONBOARDING_VERSION_META_KEY]: 2 };
const resolve = (steps: string[], signals = {}) => resolveOnboardingState({
  ...FRESH, ...signals, meta: { ...STARTED, [ONBOARDING_STEPS_META_KEY]: steps },
});
const completed = (state: ReturnType<typeof resolveOnboardingState>) => state.steps.filter((step) => step.completed).map((step) => step.id);

describe("resolveOnboardingState", () => {
  it("offers five optional steps to an empty new account", () => {
    const state = resolveOnboardingState(FRESH);
    expect(state.steps.map((step) => step.id)).toEqual(["project", "tickets", "numo", "mcp", "cycles"]);
    expect(state.currentStepId).toBe("project");
    expect(state.completedCount).toBe(0);
    expect(state.visible).toBe(true);
    expect(state.needsStartStamp).toBe(true);
  });

  it("keeps a started account eligible after creating its project and issues", () => {
    const state = resolve([], { projectCount: 1, issueCount: 3 });
    expect(completed(state)).toEqual(["project", "tickets"]);
    expect(state.currentStepId).toBe("numo");
    expect(state.currentStepNumber).toBe(3);
    expect(state.visible).toBe(true);
    expect(state.needsStartStamp).toBe(false);
  });

  it("allows an empty project and every other step to be skipped", () => {
    const state = resolve([...ONBOARDING_STEPS]);
    expect(state.allComplete).toBe(true);
    expect(state.currentStepId).toBeNull();
    expect(state.visible).toBe(false);
  });

  it("does not treat a BYOK key as Numo discovery", () => {
    expect(completed(resolve([], { hasAiKey: true }))).toEqual([]);
  });

  it("requires explicit Numo discovery even after completing the other new steps", () => {
    const state = resolve(["project", "tickets", "mcp", "cycles"]);
    expect(state.currentStepId).toBe("numo");
    expect(state.allComplete).toBe(false);
  });

  it("does not complete earlier steps when a later step is selected", () => {
    expect(completed(resolve(["mcp"]))).toEqual(["mcp"]);
    expect(completed(resolve(["numo"]))).toEqual(["numo"]);
    expect(completed(resolve([], { cyclesEnabled: true }))).toEqual(["cycles"]);
  });

  it("keeps completed legacy four- and five-step journeys closed", () => {
    for (const steps of [["mcp"], ["import", "mcp"], ["issue", "import", "mcp", "key"], ["project", "tickets", "mcp", "cycles"]]) {
      const state = resolveOnboardingState({
        ...FRESH, projectCount: 1, issueCount: 12, cyclesEnabled: true,
        meta: { onboarding_started: true, onboarding_steps: steps },
      });
      expect(state.allComplete).toBe(true);
      expect(state.visible).toBe(false);
    }
  });

  it("preserves legacy ticket and API-key acknowledgments", () => {
    for (const legacy of ["issue", "import", "mcp"]) {
      const state = resolveOnboardingState({ ...FRESH, meta: { onboarding_started: true, onboarding_steps: [legacy, "key"] } });
      expect(completed(state)).toContain("tickets");
      expect(completed(state)).toContain("numo");
    }
  });

  it("respects dismissal without erasing the calculated progress", () => {
    const state = resolveOnboardingState({ ...FRESH, meta: { [ONBOARDING_DISMISSED_META_KEY]: true } });
    expect(state.visible).toBe(false);
    expect(state.needsStartStamp).toBe(false);
    expect(state.currentStepId).toBe("project");
  });

  it("does not introduce onboarding to established accounts", () => {
    for (const signals of [{ projectCount: 1 }, { projectCount: 4, issueCount: 120 }]) {
      const state = resolveOnboardingState({ ...FRESH, ...signals });
      expect(state.eligible).toBe(false);
      expect(state.visible).toBe(false);
      expect(state.needsStartStamp).toBe(false);
    }
  });

  it("reads malformed metadata defensively", () => {
    for (const raw of [null, "mcp", ["unknown", 42, null]]) {
      const state = resolveOnboardingState({ ...FRESH, meta: { onboarding_steps: raw } });
      expect(state.totalCount).toBe(5);
      expect(state.completedCount).toBe(0);
      expect(state.visible).toBe(true);
    }
    expect([...readAcknowledgedSteps({ ...STARTED, onboarding_steps: ["unknown", 42, "numo"] })]).toEqual(["numo"]);
  });
});

describe("withAcknowledgedStep", () => {
  it("adds steps in canonical order without duplicates or unknown ids", () => {
    const meta = { ...STARTED, onboarding_steps: ["cycles", "mcp", "unknown"] };
    expect(withAcknowledgedStep(meta, "numo")).toEqual(["numo", "mcp", "cycles"]);
    expect(withAcknowledgedStep(meta, "mcp")).toEqual(["mcp", "cycles"]);
  });

  it("migrates retired acknowledgments when saving another step", () => {
    expect(withAcknowledgedStep({ onboarding_steps: ["import", "key"] }, "cycles")).toEqual(["tickets", "numo", "cycles"]);
    expect(withAcknowledgedStep({ onboarding_steps: ["mcp"] }, "numo")).toEqual(["tickets", "numo", "mcp"]);
  });
});
