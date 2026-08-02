import { describe, expect, it } from "vitest";
import {
  MAX_CHAIN_STEPS,
  nextRule,
  parseAutomationOverride,
  parseAutomations,
  presetOfRules,
  presetRules,
  rulesForIssue,
  rulesToReplayOnRetry,
  simulateChain,
  simulatedRunModes,
  type AutomationEvent,
  type AutomationIssueFacts,
  type AutomationRule,
} from "@/lib/automations";
import type { IssueEffort } from "@/lib/issue-constants";

/**
 * La matrice par effort de MIN-147 est un JEU DE RÈGLES, pas un `switch` : ce
 * qu'on vérifie ici, c'est le parcours qu'elle produit, déroulé état par état,
 * exactement comme le moteur le déroulera.
 */

const facts = (effort: IssueEffort | null, plan: string | null = null): AutomationIssueFacts => ({
  status: "todo",
  effort,
  priority: "none",
  plan,
  assigneeId: null,
  categoryIds: [],
});

const enteredTodo: AutomationEvent = { type: "status_changed", from: "backlog", to: "todo" };

/**
 * Nomme les étapes d'un parcours simulé. « Vérifier le plan » n'est pas un mode
 * à part : c'est `mode: plan` sur un ticket qui en a déjà un — on le distingue
 * ici pour que les attentes des tests se lisent comme la matrice de MIN-147.
 */
function walk(
  rules: AutomationRule[],
  issue: AutomationIssueFacts,
  opts: { resumeAfterHuman?: boolean } = {},
): string[] {
  const steps = simulateChain(rules, issue, {
    throughHumanStop: opts.resumeAfterHuman,
    from: enteredTodo,
  });
  const named: string[] = [];
  for (const step of steps) {
    if (step.action.type === "run_numo") {
      const isReview = step.action.mode === "plan" && named.includes("plan");
      named.push(isReview ? "review_plan" : step.action.mode);
    } else {
      named.push(step.action.type);
    }
  }
  return named;
}

describe("préréglage loop-by-effort — la matrice par effort", () => {
  const rules = presetRules("loop-by-effort");

  it("xs et s ne planifient JAMAIS : implémentation directe, et c'est fini", () => {
    expect(walk(rules, facts("xs"))).toEqual(["implement"]);
    expect(walk(rules, facts("s"))).toEqual(["implement"]);
  });

  it("m joue trois étapes et ne s'arrête jamais pour un humain", () => {
    const steps = walk(rules, facts("m"));
    expect(steps).toEqual(["plan", "implement", "verify"]);
    expect(steps).not.toContain("await_human");
  });

  it("effort absent → le chemin du mode m (le plan dira la taille réelle)", () => {
    expect(walk(rules, facts(null))).toEqual(walk(rules, facts("m")));
  });

  it("l et xl jouent les quatre étapes, avec UN arrêt humain après la vérif du plan", () => {
    for (const effort of ["l", "xl"] as const) {
      expect(walk(rules, facts(effort))).toEqual(["plan", "review_plan", "await_human"]);
      const resumed = walk(rules, facts(effort), { resumeAfterHuman: true });
      expect(resumed).toEqual([
        "plan",
        "review_plan",
        "await_human",
        "implement",
        "verify",
      ]);
      // Une fois et une seule : la reprise ne redemande pas un second arrêt.
      expect(resumed.filter((s) => s === "await_human")).toHaveLength(1);
    }
  });

  it("le parcours le plus long, reprise comprise, tient sous le garde-fou", () => {
    const longest = simulateChain(rules, facts("xl"), { throughHumanStop: true });
    expect(longest).toHaveLength(5);
    // + implémenter/vérifier rejoués une fois après une vérification en échec.
    expect(longest.length + 2).toBeLessThanOrEqual(MAX_CHAIN_STEPS);
    expect(rulesToReplayOnRetry(rules).length).toBeGreaterThan(0);
  });

  it("l'estimation ne chiffre QUE des runs — l'arrêt humain n'en est pas un", () => {
    const steps = simulateChain(rules, facts("xl"), { throughHumanStop: true });
    expect(simulatedRunModes(steps)).toEqual(["plan", "plan", "implement", "verify"]);
  });
});

describe("une règle déjà jouée ne rematche pas", () => {
  const rules = presetRules("loop-by-effort");

  it("le même événement, deux fois, ne relance pas la même étape", () => {
    const ctx = { event: enteredTodo, issue: facts("m"), playedRuleIds: [] as string[] };
    const first = nextRule(rules, ctx);
    expect(first?.id).toBe("loop-by-effort:medium-plan");
    expect(nextRule(rules, { ...ctx, playedRuleIds: [first!.id] })).toBeNull();
  });

  it("c'est ce qui coupe la boucle set_status → crochet de statut", () => {
    const loop: AutomationRule[] = [
      {
        id: "r1",
        name: "repasse en todo",
        enabled: true,
        when: { type: "status_changed", to: ["todo"] },
        if: {},
        then: [{ type: "set_status", status: "todo" }],
      },
    ];
    const played: string[] = [];
    for (let i = 0; i < 5; i++) {
      const rule = nextRule(loop, { event: enteredTodo, issue: facts("m"), playedRuleIds: played });
      if (!rule) break;
      played.push(rule.id);
    }
    expect(played).toEqual(["r1"]);
  });
});

describe("rulesToReplayOnRetry", () => {
  it("démarque l'implémentation et sa vérification, jamais le plan", () => {
    const ids = rulesToReplayOnRetry(presetRules("loop-by-effort"));
    expect(ids).toContain("loop-by-effort:medium-implement");
    expect(ids).toContain("loop-by-effort:medium-verify");
    expect(ids).not.toContain("loop-by-effort:medium-plan");
    expect(ids).not.toContain("loop-by-effort:big-review-plan");
  });
});

describe("les deux autres préréglages", () => {
  it("plan-only n'écrit qu'un plan, verify-only ne réagit qu'à l'entrée en revue", () => {
    expect(walk(presetRules("plan-only"), facts("m"))).toEqual(["plan"]);
    const verify = presetRules("verify-only");
    expect(nextRule(verify, { event: enteredTodo, issue: facts("m"), playedRuleIds: [] })).toBeNull();
    expect(
      nextRule(verify, {
        event: { type: "status_changed", from: "in_progress", to: "in_review" },
        issue: { ...facts("m"), status: "in_review" },
        playedRuleIds: [],
      })?.id,
    ).toBe("verify-only:verify");
  });

  it("presetOfRules reconnaît un préréglage intact et rien d'autre", () => {
    expect(presetOfRules(presetRules("loop-by-effort"))).toBe("loop-by-effort");
    expect(presetOfRules(presetRules("loop-by-effort").slice(1))).toBeNull();
    expect(presetOfRules([])).toBeNull();
  });
});

describe("parseAutomations — tolérante par construction", () => {
  it("ignore la règle illisible et garde les autres", () => {
    const rules = parseAutomations([
      { id: "ok", when: { type: "status_changed", to: ["todo"] }, then: [{ type: "stop" }] },
      null,
      "nope",
      { when: { type: "status_changed", to: ["todo"] }, then: [{ type: "stop" }] }, // sans id
      { id: "no-trigger", then: [{ type: "stop" }] },
      { id: "no-action", when: { type: "status_changed", to: ["todo"] }, then: [] },
      { id: "bad-status", when: { type: "status_changed", to: ["nope"] }, then: [{ type: "stop" }] },
    ]);
    expect(rules.map((r) => r.id)).toEqual(["ok"]);
  });

  it("ne rend rien sur du jsonb qui n'est pas un tableau", () => {
    expect(parseAutomations(null)).toEqual([]);
    expect(parseAutomations({ rules: [] })).toEqual([]);
    expect(parseAutomations("[]")).toEqual([]);
  });

  it("nettoie l'action run_numo : mode inconnu rejeté, custom sans consigne rejeté", () => {
    const rules = parseAutomations([
      { id: "a", when: { type: "run_finished", intent: ["plan"] }, then: [{ type: "run_numo", mode: "danser" }] },
      { id: "b", when: { type: "run_finished", intent: ["plan"] }, then: [{ type: "run_numo", mode: "custom" }] },
      {
        id: "c",
        when: { type: "run_finished", intent: ["plan"], outcome: "ok" },
        then: [{ type: "run_numo", mode: "custom", prompt: "  relis les tests  ", reasoningLevel: "bof" }],
      },
    ]);
    expect(rules.map((r) => r.id)).toEqual(["c"]);
    expect(rules[0].then[0]).toEqual({ type: "run_numo", mode: "custom", prompt: "relis les tests" });
  });

  it("dédoublonne les identifiants et retombe sur l'id comme nom", () => {
    const rules = parseAutomations([
      { id: "x", when: { type: "status_changed", to: ["todo"] }, then: [{ type: "stop" }] },
      { id: "x", name: "doublon", when: { type: "status_changed", to: ["done"] }, then: [{ type: "stop" }] },
    ]);
    expect(rules).toHaveLength(1);
    expect(rules[0].name).toBe("x");
  });

  it("un survol de la base : les préréglages relus par le parseur sont eux-mêmes", () => {
    for (const id of ["loop-by-effort", "plan-only", "verify-only"] as const) {
      const rules = presetRules(id);
      expect(parseAutomations(JSON.parse(JSON.stringify(rules)))).toEqual(rules);
    }
  });
});

describe("forçage par ticket", () => {
  it("null suit le projet, disabled coupe tout, preset remplace", () => {
    const projectRules = presetRules("plan-only");
    expect(rulesForIssue(projectRules, null)).toEqual(projectRules);
    expect(rulesForIssue(projectRules, { disabled: true })).toEqual([]);
    expect(rulesForIssue(projectRules, { preset: "verify-only" })).toEqual(
      presetRules("verify-only"),
    );
  });

  it("parseAutomationOverride rejette ce qu'il ne comprend pas", () => {
    expect(parseAutomationOverride(null)).toBeNull();
    expect(parseAutomationOverride({ disabled: true })).toEqual({ disabled: true });
    expect(parseAutomationOverride({ preset: "loop-by-effort" })).toEqual({
      preset: "loop-by-effort",
    });
    expect(parseAutomationOverride({ preset: "inconnu" })).toBeNull();
  });
});
