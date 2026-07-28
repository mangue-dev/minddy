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

/** Compte neuf : rien de créé, rien d'acquitté. */
const FRESH = {
  meta: null,
  projectCount: 0,
  issueCount: 0,
  cyclesEnabled: false,
};

/** Compte neuf déjà entré en onboarding (la marque est posée au 1er affichage) —
    l'état dans lequel se déroulent les étapes 2 à 4. */
const STARTED = { [ONBOARDING_STARTED_META_KEY]: true };

const completedIds = (state: { steps: { id: OnboardingStepId; completed: boolean }[] }) =>
  state.steps.filter((s) => s.completed).map((s) => s.id);

describe("resolveOnboardingState", () => {
  it("starts a fresh account on the project step, onboarding visible", () => {
    const state = resolveOnboardingState(FRESH);
    expect(state.currentStepId).toBe("project");
    expect(state.currentStepNumber).toBe(1);
    expect(state.completedCount).toBe(0);
    expect(state.totalCount).toBe(4);
    expect(state.allComplete).toBe(false);
    expect(state.eligible).toBe(true);
    expect(state.visible).toBe(true);
    // Premier affichage : l'appelant doit graver l'entrée en onboarding.
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
    // Créé à la main ou importé : la donnée ne fait pas la différence, et cette
    // étape n'a pas à la faire non plus.
    const state = resolveOnboardingState({
      ...FRESH,
      meta: STARTED,
      projectCount: 1,
      issueCount: 3,
    });
    expect(completedIds(state)).toEqual(["project", "tickets"]);
    expect(state.currentStepId).toBe("mcp");
    expect(state.currentStepNumber).toBe(3);
    // Le nerf de la marque d'entrée : le compte n'est plus vierge, l'onboarding
    // en cours doit quand même continuer.
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
    expect(acknowledged.currentStepId).toBe("cycles");
    expect(acknowledged.currentStepNumber).toBe(4);
  });

  it("ticks the cycles step when cycles are enabled, with no acknowledgement", () => {
    const state = resolveOnboardingState({ ...FRESH, cyclesEnabled: true });
    expect(completedIds(state)).toEqual(["cycles"]);
    // Une étape franchie plus loin ne saute pas les précédentes.
    expect(state.currentStepId).toBe("project");
  });

  it("hides the onboarding once every step is done", () => {
    const state = resolveOnboardingState({
      meta: { ...STARTED, [ONBOARDING_STEPS_META_KEY]: ["mcp"] },
      projectCount: 1,
      issueCount: 1,
      cyclesEnabled: true,
    });
    expect(state.allComplete).toBe(true);
    expect(state.currentStepId).toBeNull();
    expect(state.currentStepNumber).toBe(4);
    expect(state.visible).toBe(false);
  });

  it("does not reopen the onboarding of an account that finished it in four or five steps", () => {
    // LE test de non-régression des refontes d'étapes. Ces comptes-là ont
    // acquitté `mcp` du temps où les étapes s'appelaient autrement : leur home
    // ne doit pas se faire reconfisquer par un découpage changé après coup.
    for (const acknowledged of [["mcp"], ["import", "mcp"], ["issue", "import", "mcp"]]) {
      const state = resolveOnboardingState({
        meta: { ...STARTED, [ONBOARDING_STEPS_META_KEY]: acknowledged },
        projectCount: 2,
        issueCount: 40,
        cyclesEnabled: true,
      });
      expect(completedIds(state)).toEqual(["project", "tickets", "mcp", "cycles"]);
      expect(state.allComplete).toBe(true);
      expect(state.visible).toBe(false);
    }
  });

  it("keeps a mid-flight account past the merged tickets step", () => {
    // Le cas serré : un compte qui avait SAUTÉ l'ancienne étape import, sans
    // jamais créer de ticket, et qui n'a pas encore acquitté `mcp`. La marque
    // `import` est le seul témoin qu'il est déjà passé par là — sans elle il
    // repartirait en arrière, sur une étape qu'il a explicitement passée.
    const state = resolveOnboardingState({
      meta: { ...STARTED, [ONBOARDING_STEPS_META_KEY]: ["import"] },
      projectCount: 1,
      issueCount: 0,
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
    // L'état reste calculé — la carte est cachée, pas effacée.
    expect(state.currentStepId).toBe("project");
  });

  it("never shows it to an account that already has projects and tickets", () => {
    // Le cas qui compte : un compte installé qui n'a JAMAIS vu l'onboarding.
    // Deux étapes lui manquent (MCP jamais acquitté, cycles éteints), mais son
    // home ne doit pas se faire confisquer pour autant.
    const state = resolveOnboardingState({
      meta: null,
      projectCount: 4,
      issueCount: 120,
      cyclesEnabled: false,
    });
    expect(state.allComplete).toBe(false);
    expect(state.currentStepId).toBe("mcp");
    expect(state.eligible).toBe(false);
    expect(state.visible).toBe(false);
    expect(state.needsStartStamp).toBe(false);
  });

  it("leaves alone an unstamped account that already made a project", () => {
    // Un compte neuf est marqué dès le premier affichage de la carte, donc il
    // garde son onboarding après avoir créé son projet (test plus haut). Un
    // compte porteur d'un projet SANS la marque n'est donc pas un compte en
    // cours d'onboarding : c'est un ancien compte, on ne lui prend pas sa home.
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
      expect(state.totalCount).toBe(4);
      expect(state.dismissed).toBe(false);
      expect(state.visible).toBe(true);
    }
    // Seul l'id connu du tableau bruité est retenu.
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
    // L'ordre canonique, pas l'ordre d'arrivée : tickets précède mcp.
    expect(
      withAcknowledgedStep({ [ONBOARDING_STEPS_META_KEY]: ["mcp"] }, "tickets")
    ).toEqual(["tickets", "mcp"]);
  });

  it("drops unknown ids already stored rather than propagating them", () => {
    expect(
      withAcknowledgedStep({ [ONBOARDING_STEPS_META_KEY]: ["legacy"] }, "mcp")
    ).toEqual(["mcp"]);
  });
});
