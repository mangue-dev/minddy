import { describe, expect, it } from "vitest";
import {
  ONBOARDING_DISMISSED_META_KEY,
  ONBOARDING_STARTED_META_KEY,
  ONBOARDING_STEPS_META_KEY,
  readAcknowledgedSteps,
  resolveOnboardingState,
  withAcknowledgedStep,
  type OnboardingStepId,
} from "@/lib/onboarding";

/** New account: nothing created, nothing paid. */
const FRESH = {
  meta: null,
  projectCount: 0,
  issueCount: 0,
  hasAiKey: false,
  cyclesEnabled: false,
};

/** New account already entered into onboarding (the mark is placed on the 1st display) —
 the state in which steps 2 to 4 take place. */
const STARTED = { [ONBOARDING_STARTED_META_KEY]: true };

const completedIds = (state: { steps: { id: OnboardingStepId; completed: boolean }[] }) =>
  state.steps.filter((s) => s.completed).map((s) => s.id);

describe("resolveOnboardingState", () => {
  it("starts a fresh account on the project step, onboarding visible", () => {
    const state = resolveOnboardingState(FRESH);
    expect(state.currentStepId).toBe("project");
    expect(state.currentStepNumber).toBe(1);
    expect(state.completedCount).toBe(0);
    expect(state.totalCount).toBe(5);
    expect(state.allComplete).toBe(false);
    expect(state.eligible).toBe(true);
    expect(state.visible).toBe(true);
    // First display: the caller must burn the entry in onboarding.
    expect(state.needsStartStamp).toBe(true);
  });

  it("ticks the project step from the real signal, not an acknowledgement", () => {
    const state = resolveOnboardingState({
      ...FRESH,
      meta: STARTED,
      projectCount: 1,
    });
    expect(completedIds(state)).toEqual(["project"]);
    expect(state.currentStepId).toBe("tickets");
    expect(state.currentStepNumber).toBe(2);
    expect(state.visible).toBe(true);
    expect(state.needsStartStamp).toBe(false);
  });

  it("ticks the tickets step as soon as a ticket exists, however it got there", () => {
    // Created by hand or imported: the data does not make the difference, and this
    // step doesn't have to do it either.
    const state = resolveOnboardingState({
      ...FRESH,
      meta: STARTED,
      projectCount: 1,
      issueCount: 3,
    });
    expect(completedIds(state)).toEqual(["project", "tickets"]);
    expect(state.currentStepId).toBe("mcp");
    expect(state.currentStepNumber).toBe(3);
    // The nerve of the entry mark: the account is no longer blank, onboarding
    // in progress must still continue.
    expect(state.visible).toBe(true);
  });

  it("lets an empty project step past the tickets step on an acknowledgement", () => {
    const withProject = { ...FRESH, meta: STARTED, projectCount: 1 };
    expect(resolveOnboardingState(withProject).currentStepId).toBe("tickets");

    const skipped = resolveOnboardingState({
      ...withProject,
      meta: { ...STARTED, [ONBOARDING_STEPS_META_KEY]: ["tickets"] },
    });
    expect(skipped.currentStepId).toBe("mcp");
    expect(skipped.currentStepNumber).toBe(3);
  });

  it("only ticks the MCP step on an explicit acknowledgement", () => {
    const withTickets = {
      ...FRESH,
      meta: STARTED,
      projectCount: 1,
      issueCount: 1,
    };
    expect(resolveOnboardingState(withTickets).currentStepId).toBe("mcp");

    const acknowledged = resolveOnboardingState({
      ...withTickets,
      meta: { ...STARTED, [ONBOARDING_STEPS_META_KEY]: ["mcp"] },
    });
    expect(acknowledged.currentStepId).toBe("key");
    expect(acknowledged.currentStepNumber).toBe(4);
  });

  it("ticks the key step from the real signal, not an acknowledgement", () => {
    // A registered BYOK key passes the step without paying anything — this is
    // exactly what the step asked for (MIN-149).
    const state = resolveOnboardingState({
      ...FRESH,
      meta: { ...STARTED, [ONBOARDING_STEPS_META_KEY]: ["mcp"] },
      projectCount: 1,
      issueCount: 1,
      hasAiKey: true,
    });
    expect(completedIds(state)).toEqual(["project", "tickets", "mcp", "key"]);
    expect(state.currentStepId).toBe("cycles");
    expect(state.currentStepNumber).toBe(5);
  });

  it("lets the key step be skipped like the MCP one", () => {
    const state = resolveOnboardingState({
      ...FRESH,
      meta: { ...STARTED, [ONBOARDING_STEPS_META_KEY]: ["mcp", "key"] },
      projectCount: 1,
      issueCount: 1,
    });
    expect(state.currentStepId).toBe("cycles");
    expect(state.currentStepNumber).toBe(5);
  });

  it("ticks the cycles step when cycles are enabled, with no acknowledgement", () => {
    const state = resolveOnboardingState({ ...FRESH, cyclesEnabled: true });
    expect(completedIds(state)).toEqual(["cycles"]);
    // A step taken further does not skip the previous ones.
    expect(state.currentStepId).toBe("project");
  });

  it("hides the onboarding once every step is done", () => {
    const state = resolveOnboardingState({
      meta: { ...STARTED, [ONBOARDING_STEPS_META_KEY]: ["mcp"] },
      projectCount: 1,
      issueCount: 1,
      hasAiKey: false,
      cyclesEnabled: true,
    });
    expect(state.allComplete).toBe(true);
    expect(state.currentStepId).toBeNull();
    expect(state.currentStepNumber).toBe(5);
    expect(state.visible).toBe(false);
  });

  it("does not reopen the onboarding of an account that finished it in four or five steps", () => {
    // THE non-regression test of step redesigns. These accounts have
    // paid `mcp` from the time when the stages were called something else: their home
    // must not be reconfiscated by a division changed after the fact.
    // Since MIN-149 it also covers `key`, added AFTER them and they don't have
    // obviously never paid: without exemption, a new step would make
    // their incomplete onboarding and would take back their home.
    for (const acknowledged of [["mcp"], ["import", "mcp"], ["issue", "import", "mcp"]]) {
      const state = resolveOnboardingState({
        meta: { ...STARTED, [ONBOARDING_STEPS_META_KEY]: acknowledged },
        projectCount: 2,
        issueCount: 40,
        hasAiKey: false,
        cyclesEnabled: true,
      });
      expect(completedIds(state)).toEqual(["project", "tickets", "mcp", "key", "cycles"]);
      expect(state.allComplete).toBe(true);
      expect(state.visible).toBe(false);
    }
  });

  it("keeps a mid-flight account past the merged tickets step", () => {
    // The tight case: an account that had SKIPPPED the old import step, without
    // never create a ticket, and who has not yet paid `mcp`. The brand
    // `import` is the only witness that he has already been there — without her he
    // would go back, to a stage that he has explicitly passed.
    const state = resolveOnboardingState({
      meta: { ...STARTED, [ONBOARDING_STEPS_META_KEY]: ["import"] },
      projectCount: 1,
      issueCount: 0,
      hasAiKey: false,
      cyclesEnabled: false,
    });
    expect(completedIds(state)).toEqual(["project", "tickets"]);
    expect(state.currentStepId).toBe("mcp");
  });

  it("hides the onboarding when it was skipped, even half-done", () => {
    const state = resolveOnboardingState({
      ...FRESH,
      meta: { [ONBOARDING_DISMISSED_META_KEY]: true },
    });
    expect(state.dismissed).toBe(true);
    expect(state.visible).toBe(false);
    // The state remains calculated — the card is hidden, not erased.
    expect(state.currentStepId).toBe("project");
  });

  it("never shows it to an account that already has projects and tickets", () => {
    // The case that counts: an installed account that has NEVER seen onboarding.
    // Two steps are missing (MCP never acknowledged, cycles turned off), but its
    // home should not be confiscated however.
    const state = resolveOnboardingState({
      meta: null,
      projectCount: 4,
      issueCount: 120,
      hasAiKey: false,
      cyclesEnabled: false,
    });
    expect(state.allComplete).toBe(false);
    expect(state.currentStepId).toBe("mcp");
    expect(state.eligible).toBe(false);
    expect(state.visible).toBe(false);
    expect(state.needsStartStamp).toBe(false);
  });

  it("leaves alone an unstamped account that already made a project", () => {
    // A new account is marked from the first display of the card, so it
    // keep your onboarding after creating your project (test above). A
    // account carrying a project WITHOUT the brand is therefore not an account in
    // onboarding course: it's an old account, we won't take his home.
    const state = resolveOnboardingState({ ...FRESH, projectCount: 1 });
    expect(state.eligible).toBe(false);
    expect(state.visible).toBe(false);
    expect(state.needsStartStamp).toBe(false);
  });

  it("does not stamp an account that is skipping or already done", () => {
    const skipped = resolveOnboardingState({
      ...FRESH,
      meta: { [ONBOARDING_DISMISSED_META_KEY]: true },
    });
    expect(skipped.needsStartStamp).toBe(false);

    const done = resolveOnboardingState({
      ...FRESH,
      meta: {
        [ONBOARDING_STEPS_META_KEY]: ["project", "tickets", "mcp", "cycles"],
      },
    });
    expect(done.allComplete).toBe(true);
    expect(done.needsStartStamp).toBe(false);
  });

  it("survives malformed metadata", () => {
    for (const meta of [
      { [ONBOARDING_STEPS_META_KEY]: "mcp" },
      { [ONBOARDING_STEPS_META_KEY]: null },
      { [ONBOARDING_STEPS_META_KEY]: ["nope", 42, null, "mcp"] },
      { [ONBOARDING_DISMISSED_META_KEY]: "true" },
    ]) {
      const state = resolveOnboardingState({ ...FRESH, meta });
      expect(state.totalCount).toBe(5);
      expect(state.dismissed).toBe(false);
      expect(state.visible).toBe(true);
    }
    // Only the known id of the noisy table is retained.
    expect([
      ...readAcknowledgedSteps({
        [ONBOARDING_STEPS_META_KEY]: ["nope", 42, null, "mcp"],
      }),
    ]).toEqual(["mcp"]);
  });
});

describe("withAcknowledgedStep", () => {
  it("adds a step in canonical order, without duplicates", () => {
    expect(withAcknowledgedStep(null, "mcp")).toEqual(["mcp"]);
    expect(
      withAcknowledgedStep({ [ONBOARDING_STEPS_META_KEY]: ["cycles"] }, "mcp")
    ).toEqual(["mcp", "cycles"]);
    expect(
      withAcknowledgedStep({ [ONBOARDING_STEPS_META_KEY]: ["mcp"] }, "mcp")
    ).toEqual(["mcp"]);
    // The canonical order, not the order of arrival: tickets precedes mcp, and `key`
    // is inserted between mcp and cycles.
    expect(
      withAcknowledgedStep({ [ONBOARDING_STEPS_META_KEY]: ["mcp"] }, "tickets")
    ).toEqual(["tickets", "mcp"]);
    expect(
      withAcknowledgedStep({ [ONBOARDING_STEPS_META_KEY]: ["cycles", "mcp"] }, "key")
    ).toEqual(["mcp", "key", "cycles"]);
  });

  it("drops unknown ids already stored rather than propagating them", () => {
    expect(
      withAcknowledgedStep({ [ONBOARDING_STEPS_META_KEY]: ["legacy"] }, "mcp")
    ).toEqual(["mcp"]);
  });
});
