import { describe, expect, it } from "vitest";
import {
  AUTOMATION_EFFORTS_META_KEY,
  AUTOMATION_MODELS_META_KEY,
  AUTOMATION_PRESET_IDS,
  AUTOMATION_PRESET_META_KEY,
  AUTOMATION_SOURCES,
  automationEffortKey,
  automationModelFor,
  automationSourceOf,
  isAutomationEffortEnabled,
  DEFAULT_STEP_COST_USD,
  effortCostFactor,
  MAX_CHAIN_STEPS,
  nextRule,
  stepCostUsd,
  resolveAutomationPreset,
  rulesForProject,
  parseAutomationOverride,
  parseAutomations,
  presetOfRules,
  presetRules,
  rulesForIssue,
  rulesToReplayOnRetry,
  simulateChain,
  simulateIssueLifetime,
  simulatedRunModes,
  type AutomationEvent,
  type AutomationIssueFacts,
  type AutomationRule,
  type AutomationSource,
} from "@/lib/automations";
import type { IssueEffort } from "@/lib/issue-constants";
import { EFFORT_POINTS, effortToPoints } from "@/lib/cycle";

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

describe("simulateIssueLifetime — ce que ça coûte sur la vie du ticket", () => {
  it("compte les DEUX chaînes d'un préréglage plan + vérification", () => {
    // Elles sont séparées par le travail d'un humain : une chaîne partie de
    // « à faire » ne voit jamais l'entrée en revue.
    const rules = presetRules("plan-and-verify");
    expect(simulatedRunModes(simulateChain(rules, facts("m")))).toEqual(["plan"]);
    expect(simulatedRunModes(simulateIssueLifetime(rules, facts("m")))).toEqual([
      "plan",
      "verify",
    ]);
  });

  it("un préréglage qui ne réagit qu'à la revue n'est pas GRATUIT", () => {
    const rules = presetRules("verify-only");
    expect(simulateChain(rules, facts("m"))).toHaveLength(0);
    expect(simulatedRunModes(simulateIssueLifetime(rules, facts("m")))).toEqual(["verify"]);
  });

  it("ne change rien quand toutes les règles partent du même statut", () => {
    const rules = presetRules("loop-by-effort");
    for (const effort of ["xs", "m", "xl"] as const) {
      expect(simulatedRunModes(simulateIssueLifetime(rules, facts(effort)))).toEqual(
        simulatedRunModes(simulateChain(rules, facts(effort), { throughHumanStop: true })),
      );
    }
  });

  it("une règle désactivée n'ouvre pas de chaîne", () => {
    const rules = presetRules("plan-and-verify").map((r) =>
      r.id.endsWith(":verify") ? { ...r, enabled: false } : r,
    );
    expect(simulatedRunModes(simulateIssueLifetime(rules, facts("m")))).toEqual(["plan"]);
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

describe("les préréglages à une seule étape", () => {
  it("chacun ne joue QUE son étape — c'est ce qui les distingue", () => {
    expect(walk(presetRules("plan-only"), facts("m"))).toEqual(["plan"]);
    expect(walk(presetRules("implement-only"), facts("m"))).toEqual(["implement"]);
  });

  it("implement-only saute les deux filets, quel que soit l'effort", () => {
    const rules = presetRules("implement-only");
    for (const effort of ["xs", "s", "m", "l", "xl", null] as const) {
      const modes = simulatedRunModes(simulateIssueLifetime(rules, facts(effort)));
      expect(modes).toEqual(["implement"]);
      expect(modes).not.toContain("plan");
      expect(modes).not.toContain("verify");
    }
  });

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
    for (const id of AUTOMATION_PRESET_IDS) {
      expect(presetOfRules(presetRules(id))).toBe(id);
    }
    expect(presetOfRules(presetRules("loop-by-effort").slice(1))).toBeNull();
    expect(presetOfRules([])).toBeNull();
  });
});

describe("préréglage plan-and-verify — encadrer le travail humain", () => {
  const rules = presetRules("plan-and-verify");

  it("cadre à l'entrée en « à faire », contrôle à l'entrée en revue", () => {
    expect(walk(rules, facts("m"))).toEqual(["plan"]);
    expect(
      nextRule(rules, {
        event: { type: "status_changed", from: "in_progress", to: "in_review" },
        issue: { ...facts("m"), status: "in_review" },
        playedRuleIds: [],
      })?.id,
    ).toBe("plan-and-verify:verify");
  });

  it("n'implémente JAMAIS — c'est tout l'intérêt du préréglage", () => {
    const modes = rules.flatMap((r) =>
      r.then.map((a) => (a.type === "run_numo" ? a.mode : a.type)),
    );
    expect(modes).toEqual(["plan", "verify"]);
    expect(modes).not.toContain("implement");
  });

  it("ne dépend d'aucun effort : les deux règles valent pour tous", () => {
    for (const effort of ["xs", "s", "m", "l", "xl", null] as const) {
      expect(walk(rules, facts(effort))).toEqual(["plan"]);
    }
  });
});

describe("origine du changement de statut — ne pas marcher sur le travail manuel", () => {
  const entering = (to: "todo" | "in_review", source: AutomationSource): AutomationEvent => ({
    type: "status_changed",
    from: "backlog",
    to,
    source,
  });
  const at = (status: "todo" | "in_review") => ({ ...facts("m"), status });

  const fires = (rules: AutomationRule[], event: AutomationEvent, status: "todo" | "in_review") =>
    nextRule(rules, { event, issue: at(status), playedRuleIds: [] }) !== null;

  it("ÉCRIRE du code ne part que d'une DEMANDE humaine", () => {
    // Le cas signalé : mon agent MCP range son ticket en « à faire » pour dire
    // ce qu'IL fait — lui envoyer Numo par-dessus met deux ouvriers sur la même
    // branche. Idem pour la forge et pour le cycle de vie d'un run.
    for (const preset of ["loop-by-effort", "plan-only", "implement-only"] as const) {
      const rules = presetRules(preset);
      for (const source of ["web", "numo"] as const) {
        expect(fires(rules, entering("todo", source), "todo")).toBe(true);
      }
      for (const source of ["mcp", "agent", "forge", "automation", "system"] as const) {
        expect(fires(rules, entering("todo", source), "todo")).toBe(false);
      }
    }
  });

  it("demander à Numo de déplacer le ticket AMORCE la boucle — c'est mon geste", () => {
    // `numo` = l'ASSISTANT relayant une instruction. Seul le clavier change par
    // rapport à un glisser-déposer : l'intention est la même, donc l'effet aussi.
    const rules = presetRules("loop-by-effort");
    expect(fires(rules, entering("todo", "numo"), "todo")).toBe(true);
    expect(fires(rules, entering("todo", "agent"), "todo")).toBe(false);
  });

  it("VÉRIFIER accepte tout ce qui travaille — c'est le meilleur usage de la boucle", () => {
    // « Claude Code a fini et passe le ticket en revue → minddy relit » : le
    // scénario le plus fort de la feature. Relire n'écrase le travail de
    // personne, contrairement à coder.
    const rules = presetRules("verify-only");
    for (const source of ["web", "mcp", "numo", "forge"] as const) {
      expect(fires(rules, entering("in_review", source), "in_review")).toBe(true);
    }
    // …sauf la boucle elle-même : une chaîne ne réagit pas à sa propre empreinte.
    expect(fires(rules, entering("in_review", "automation"), "in_review")).toBe(false);
  });

  it("plan-and-verify applique les deux règles à ses deux bouts", () => {
    const rules = presetRules("plan-and-verify");
    expect(fires(rules, entering("todo", "mcp"), "todo")).toBe(false);
    expect(fires(rules, entering("in_review", "mcp"), "in_review")).toBe(true);
  });

  it("REFUSER une PR ne relance pas la boucle depuis le début", () => {
    // `issueStatusForPrState("closed")` renvoie le ticket en « à faire », écrit
    // par Numo (fermeture in-app) ou par la forge (webhook). C'est une ENTRÉE en
    // `todo` comme une autre : sans filtre d'origine, refuser la PR rouvrait une
    // chaîne NEUVE — la précédente étant `completed`, ni `played_rule_ids` ni
    // `MAX_CHAIN_STEPS` ne protégeaient. Rejeter le travail le faisait donc
    // recommencer, indéfiniment.
    //
    // `agent` = fermeture in-app (le cycle de vie du run) ; `forge` = webhook.
    const rules = presetRules("loop-by-effort");
    for (const source of ["agent", "forge"] as const) {
      expect(fires(rules, entering("todo", source), "todo")).toBe(false);
    }
  });

  it("une règle SANS origine n'est pas filtrée — les règles déjà en base marchent", () => {
    const [written] = parseAutomations([
      {
        id: "libre",
        when: { type: "status_changed", to: ["todo"] },
        then: [{ type: "run_numo", mode: "implement" }],
      },
    ]);
    expect(written.when).toEqual({ type: "status_changed", to: ["todo"] });
    for (const source of AUTOMATION_SOURCES) {
      expect(fires([written], entering("todo", source), "todo")).toBe(true);
    }
  });

  it("un événement SIMULÉ n'est jamais filtré — l'estimation chiffre le nominal", () => {
    // `simulateChain` synthétise des événements sans origine : les filtrer
    // afficherait « 0 étape » sur l'écran dont toute la raison d'être est de
    // dire ce que ça coûte.
    for (const id of AUTOMATION_PRESET_IDS) {
      const steps = simulateIssueLifetime(presetRules(id), facts("m"));
      expect(steps.length).toBeGreaterThan(0);
    }
  });

  it("parseAutomations relit l'origine et jette les codes inconnus", () => {
    const [rule] = parseAutomations([
      {
        id: "r",
        when: { type: "status_changed", to: ["todo"], source: ["web", "pigeon", "mcp"] },
        then: [{ type: "stop" }],
      },
    ]);
    expect(rule.when).toEqual({ type: "status_changed", to: ["todo"], source: ["web", "mcp"] });
  });

  it("automationSourceOf : la boucle prime, puis le run, l'inconnu tombe en system", () => {
    expect(automationSourceOf({ raw: "web" })).toBe("web");
    expect(automationSourceOf({ raw: "mcp" })).toBe("mcp");
    // Une écriture de la boucle est `via_assistant` ET `via_automation` : c'est
    // la seconde qui doit gagner, sinon la chaîne se relance elle-même.
    expect(automationSourceOf({ raw: "numo", viaAutomation: true })).toBe("automation");
    // Le nœud du problème : l'ASSISTANT et le CYCLE DE VIE d'un run arrivent ici
    // tous deux en `numo`. Seul le second est écarté.
    expect(automationSourceOf({ raw: "numo" })).toBe("numo");
    expect(automationSourceOf({ raw: "numo", viaAgentRun: true })).toBe("agent");
    expect(automationSourceOf({ raw: "martien" })).toBe("system");
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
    // Sur la LISTE, pas sur trois ids écrits en dur : un préréglage ajouté doit
    // entrer dans ce test tout seul.
    for (const id of AUTOMATION_PRESET_IDS) {
      const rules = presetRules(id);
      expect(parseAutomations(JSON.parse(JSON.stringify(rules)))).toEqual(rules);
    }
  });
});

describe("coût d'une étape — la taille du ticket compte autant que l'étape", () => {
  it("un XS coûte moins qu'un M, un XL davantage — sur la même étape", () => {
    expect(stepCostUsd("plan", "xs")).toBeLessThan(stepCostUsd("plan", "m"));
    expect(stepCostUsd("plan", "xl")).toBeGreaterThan(stepCostUsd("plan", "m"));
    expect(stepCostUsd("implement", "xl")).toBeGreaterThan(stepCostUsd("implement", "l"));
  });

  it("le M est la référence, et l'effort absent compte comme un M", () => {
    expect(effortCostFactor("m")).toBe(1);
    expect(effortCostFactor(null)).toBe(effortCostFactor("m"));
    expect(stepCostUsd("implement", "m")).toBe(DEFAULT_STEP_COST_USD.implement);
  });

  it("l'échelle est celle des points du produit, pas une deuxième", () => {
    // Deux endroits qui pèsent un ticket doivent le peser pareil.
    for (const effort of ["xs", "s", "m", "l", "xl"] as const) {
      expect(effortCostFactor(effort)).toBeCloseTo(
        effortToPoints(effort) / EFFORT_POINTS.m,
        10,
      );
    }
  });

  it("le facteur est monotone : jamais deux tailles au même prix", () => {
    const factors = (["xs", "s", "m", "l", "xl"] as const).map(effortCostFactor);
    for (let i = 1; i < factors.length; i++) {
      expect(factors[i]).toBeGreaterThan(factors[i - 1]);
    }
  });

  it("un parcours complet de XL coûte nettement plus qu'un de XS", () => {
    const rules = presetRules("loop-by-effort");
    const total = (effort: "xs" | "xl") =>
      simulatedRunModes(simulateIssueLifetime(rules, facts(effort))).reduce(
        (sum, mode) => sum + stepCostUsd(mode, effort),
        0,
      );
    // Un XS n'implémente que ; un XL joue quatre étapes, chacune plus chère.
    expect(total("xl")).toBeGreaterThan(total("xs") * 5);
  });
});

describe("personnalisation par taille de ticket", () => {
  it("toutes les tailles sont couvertes par défaut — c'est le retrait qui est un geste", () => {
    for (const effort of ["xs", "s", "m", "l", "xl"] as const) {
      expect(isAutomationEffortEnabled(null, effort)).toBe(true);
      expect(isAutomationEffortEnabled({}, effort)).toBe(true);
    }
  });

  it("seul un `false` explicite éteint une taille", () => {
    const meta = { [AUTOMATION_EFFORTS_META_KEY]: { xl: false, xs: true } };
    expect(isAutomationEffortEnabled(meta, "xl")).toBe(false);
    expect(isAutomationEffortEnabled(meta, "xs")).toBe(true);
    expect(isAutomationEffortEnabled(meta, "m")).toBe(true);
  });

  it("un ticket SANS taille suit la ligne du M, comme partout ailleurs", () => {
    expect(automationEffortKey(null)).toBe("m");
    expect(isAutomationEffortEnabled({ [AUTOMATION_EFFORTS_META_KEY]: { m: false } }, null)).toBe(
      false,
    );
    expect(automationModelFor({ [AUTOMATION_MODELS_META_KEY]: { m: "x/y" } }, null)).toBe("x/y");
  });

  it("le modèle par taille : absent = le défaut du compte", () => {
    const meta = { [AUTOMATION_MODELS_META_KEY]: { xs: "cheap/model", xl: "  " } };
    expect(automationModelFor(meta, "xs")).toBe("cheap/model");
    expect(automationModelFor(meta, "xl")).toBeNull();
    expect(automationModelFor(meta, "l")).toBeNull();
    expect(automationModelFor(null, "m")).toBeNull();
  });

  it("des métadonnées corrompues ne cassent rien", () => {
    // La CARTE elle-même illisible → on retombe sur les défauts.
    for (const junk of [42, "oui", null, []]) {
      expect(isAutomationEffortEnabled({ [AUTOMATION_EFFORTS_META_KEY]: junk }, "xs")).toBe(true);
      expect(automationModelFor({ [AUTOMATION_MODELS_META_KEY]: junk }, "xs")).toBeNull();
    }
    // Une VALEUR du bon type mais absurde dans une carte lisible : seul ce qui
    // n'est pas une chaîne non vide est écarté (un id de modèle est du texte
    // libre — le catalogue tranche à l'usage, pas ici).
    const meta = { [AUTOMATION_MODELS_META_KEY]: { xs: 42, s: "", m: "vendor/model" } };
    expect(automationModelFor(meta, "xs")).toBeNull();
    expect(automationModelFor(meta, "s")).toBeNull();
    expect(automationModelFor(meta, "m")).toBe("vendor/model");
  });
});

describe("cascade ticket > projet > compte", () => {
  const meta = { automation_preset: "plan-only" };

  it("sans règles sur le projet, c'est le préréglage du propriétaire qui gouverne", () => {
    expect(rulesForProject(null, meta)).toEqual(presetRules("plan-only"));
    expect(rulesForProject([], meta)).toEqual(presetRules("plan-only"));
  });

  it("des règles écrites sur le projet (API/MCP) DÉROGENT au préréglage", () => {
    const written = presetRules("verify-only");
    expect(rulesForProject(JSON.parse(JSON.stringify(written)), meta)).toEqual(written);
  });

  it("aucun préréglage au compte = aucune règle, donc rien ne se déclenche", () => {
    expect(rulesForProject(null, null)).toEqual([]);
    expect(rulesForProject(null, {})).toEqual([]);
    expect(rulesForProject(null, { automation_preset: "inconnu" })).toEqual([]);
  });

  it("resolveAutomationPreset ne laisse passer qu'un id connu", () => {
    for (const id of AUTOMATION_PRESET_IDS) {
      expect(resolveAutomationPreset({ [AUTOMATION_PRESET_META_KEY]: id })).toBe(id);
    }
    expect(resolveAutomationPreset({ [AUTOMATION_PRESET_META_KEY]: 42 })).toBeNull();
    expect(resolveAutomationPreset(undefined)).toBeNull();
  });

  it("le forçage du ticket gagne sur les deux", () => {
    const projectLevel = rulesForProject(null, meta);
    expect(rulesForIssue(projectLevel, { disabled: true })).toEqual([]);
    expect(rulesForIssue(projectLevel, { preset: "implement-only" })).toEqual(
      presetRules("implement-only"),
    );
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
