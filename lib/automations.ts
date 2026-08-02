/**
 * Le vocabulaire des automatisations de projet (MIN-147) — logique PURE,
 * partagée client + serveur : le moteur en fait tourner les règles, l'éditeur de
 * règles en dessine les mêmes champs. AUCUN import `server-only`.
 *
 * Une automatisation est un `quand … si … alors …` :
 *   • `when` — l'ÉVÉNEMENT qui la réveille. Il n'y en a que deux, parce que la
 *     boucle n'a besoin que de ceux-là : un changement de statut, et la fin d'un
 *     run ;
 *   • `if`   — des conditions sur le TICKET (effort, priorité, plan, catégories,
 *     assignation) ;
 *   • `then` — des actions : lancer Numo dans un mode, poser un statut, s'arrêter
 *     pour un humain, arrêter la chaîne.
 *
 * La matrice par effort de MIN-147 n'est PAS codée en dur : c'est le préréglage
 * `loop-by-effort`, un jeu de règles éditable comme un autre. C'est ce qui rend
 * la feature personnalisable sans la rendre compliquée à prendre en main.
 *
 * UNE RÈGLE PAR ÉVÉNEMENT. Le moteur joue la PREMIÈRE règle qui matche et qui
 * n'a pas déjà été jouée sur cette chaîne (`played_rule_ids`). C'est ce qui
 * permet à deux règles de partager le même déclencheur pour décrire deux étapes
 * successives — « écrire le plan » puis « vérifier le plan » finissent toutes
 * deux sur un `run_finished intent=plan` — et c'est aussi ce qui coupe la boucle
 * quand l'action `set_status` redéclenche le crochet qui l'a produite.
 */

import type { IssueEffort, IssuePriority, IssueStatus } from "@/lib/issue-constants";
import type { ReasoningLevel } from "@/lib/agent-reasoning";
import type { AgentLaunchMode } from "@/lib/server/agent/launch-message";
import type { AgentLaunchIntent } from "@/lib/server/agent/launch";
import { hasPlanTasks } from "@/lib/plan";

/**
 * Garde-fou anti-runaway : au-delà, la chaîne s'arrête quoi qu'en disent les
 * règles. Même rôle qu'`AGENT_MAX_CONTINUATIONS` pour un run — huit étapes
 * couvrent largement le plus long parcours prévu (les quatre du mode l/xl, plus
 * une reprise après vérification en échec et ses conséquences).
 */
export const MAX_CHAIN_STEPS = 8;

/**
 * Reprises autorisées quand Numo échoue SA PROPRE vérification d'implémentation.
 * Une, et une seule : la première relance porte le rapport de vérification en
 * consigne, donc elle sait quoi corriger ; un deuxième échec sur le même sujet
 * dit que le ticket a besoin d'un humain, pas d'un tour de plus.
 */
export const MAX_VERIFICATION_RETRIES = 1;

/**
 * Marge du plafond de dépense d'une chaîne, appliquée à son estimation. Une
 * estimation est une médiane : la moitié des chaînes la dépassent. Le plafond
 * n'est pas là pour tenir la moyenne, il est là pour arrêter les dérives — d'où
 * le facteur 2 plutôt qu'un ajustement fin qui couperait des chaînes saines.
 */
export const CHAIN_BUDGET_MARGIN = 2;

// ── Déclencheurs ─────────────────────────────────────────────────────────────

/** Les deux seuls événements dont la boucle a besoin. */
export type AutomationTrigger =
  | { type: "status_changed"; to: IssueStatus[] }
  | { type: "run_finished"; intent: AgentLaunchIntent[]; outcome?: "ok" | "failed" };

export type AutomationTriggerType = AutomationTrigger["type"];

/** L'événement RÉEL, tel que les crochets le rapportent au moteur. */
export type AutomationEvent =
  | { type: "status_changed"; from: IssueStatus | null; to: IssueStatus }
  | { type: "run_finished"; intent: AgentLaunchIntent; outcome: "ok" | "failed" };

// ── Conditions ───────────────────────────────────────────────────────────────

/**
 * Conditions sur le ticket. Toutes optionnelles, toutes cumulatives (ET). Un
 * champ absent ne filtre rien.
 *
 * `effort` accepte la valeur `"none"` pour « effort non renseigné ». C'est la
 * façon de traiter autrement le ticket sans effort : par défaut il suit les
 * règles du mode `m`, qui commencent justement par écrire un plan — lequel dira
 * la taille réelle, sans payer un appel modèle pour la deviner.
 */
export interface AutomationConditions {
  effort?: (IssueEffort | "none")[];
  priority?: IssuePriority[];
  hasPlan?: boolean;
  categoryIds?: string[];
  assigned?: boolean;
}

// ── Actions ──────────────────────────────────────────────────────────────────

/**
 * Une étape de la chaîne. `mode` reprend les trois façons NATIVES de lancer Numo
 * (les mêmes que les boutons de l'app, cf. `AGENT_LAUNCH_MODES`) plus `custom`,
 * qui porte une consigne libre.
 *
 * `model` et `reasoningLevel` sont le levier « un modèle par étape » : on passe
 * par OpenRouter, donc rien n'oblige à planifier un XL et à relire un diff de
 * trois lignes avec le même modèle. `null` = le défaut du lanceur.
 */
export interface AutomationRunAction {
  type: "run_numo";
  mode: AgentLaunchMode | "custom";
  prompt?: string;
  model?: string | null;
  reasoningLevel?: ReasoningLevel | null;
  /** Plafond de CE run, en USD. `null` = seul le plafond de la chaîne borne. */
  budgetUsd?: number | null;
}

export type AutomationAction =
  | AutomationRunAction
  | { type: "set_status"; status: IssueStatus }
  /** Point d'arrêt humain : la chaîne attend un « Continuer » explicite. */
  | { type: "await_human"; message?: string }
  | { type: "stop" };

export type AutomationActionType = AutomationAction["type"];

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  when: AutomationTrigger;
  if: AutomationConditions;
  then: AutomationAction[];
}

/**
 * Modes offerts par l'éditeur de règles, dans l'ordre de la boucle. Déclaré ici
 * plutôt qu'importé de `launch-message.ts` : ce module-là traîne `next-intl` et
 * un import dynamique de tous les catalogues de messages, ce qu'un composant
 * client n'a aucune raison d'embarquer. Le TYPE, lui, vient bien de là — une
 * divergence casse la compilation.
 */
export const AUTOMATION_RUN_MODES: readonly (AgentLaunchMode | "custom")[] = [
  "plan",
  "implement",
  "verify",
  "custom",
];

/**
 * Coût de repli d'une étape, en USD, quand le projet n'a AUCUN historique de
 * runs à médianiser (`estimateChainCost`). Ordres de grandeur mesurés sur les
 * runs de minddy, pas des chiffres exacts : une estimation n'a jamais eu à être
 * juste, elle a à ne pas surprendre.
 *
 * Une CONSTANTE, pas une clé `app_config` : seul `AI_MODEL_CONFIG_FIELDS` est
 * réglable côté admin, une clé hors de cette liste ne serait jamais posée par
 * personne.
 */
export const DEFAULT_STEP_COST_USD: Record<AgentLaunchMode | "custom", number> = {
  plan: 0.08,
  implement: 0.3,
  verify: 0.1,
  custom: 0.2,
};

// ── Le ticket, tel que les règles le lisent ──────────────────────────────────

export interface AutomationIssueFacts {
  status: IssueStatus;
  effort: IssueEffort | null;
  priority: IssuePriority;
  plan: string | null;
  assigneeId: string | null;
  categoryIds: string[];
}

export interface AutomationMatchContext {
  event: AutomationEvent;
  issue: AutomationIssueFacts;
  /** Règles déjà jouées sur la chaîne — une règle ne se rejoue jamais. */
  playedRuleIds: readonly string[];
}

function triggerMatches(trigger: AutomationTrigger, event: AutomationEvent): boolean {
  if (trigger.type !== event.type) return false;
  if (trigger.type === "status_changed" && event.type === "status_changed") {
    return trigger.to.includes(event.to);
  }
  if (trigger.type === "run_finished" && event.type === "run_finished") {
    if (!trigger.intent.includes(event.intent)) return false;
    // `outcome` absent = les deux issues conviennent (rare, mais c'est le sens
    // le plus faible, donc le bon défaut pour un champ optionnel).
    return trigger.outcome === undefined || trigger.outcome === event.outcome;
  }
  return false;
}

function conditionsMatch(
  conditions: AutomationConditions,
  issue: AutomationIssueFacts,
): boolean {
  if (conditions.effort && conditions.effort.length > 0) {
    if (!conditions.effort.includes(issue.effort ?? "none")) return false;
  }
  if (conditions.priority && conditions.priority.length > 0) {
    if (!conditions.priority.includes(issue.priority)) return false;
  }
  if (conditions.hasPlan !== undefined) {
    if (hasPlanTasks(issue.plan) !== conditions.hasPlan) return false;
  }
  if (conditions.categoryIds && conditions.categoryIds.length > 0) {
    if (!conditions.categoryIds.some((id) => issue.categoryIds.includes(id))) return false;
  }
  if (conditions.assigned !== undefined) {
    if ((issue.assigneeId !== null) !== conditions.assigned) return false;
  }
  return true;
}

/** Une règle s'applique-t-elle ici et maintenant ? Pure, testable seule. */
export function matchesRule(rule: AutomationRule, ctx: AutomationMatchContext): boolean {
  if (!rule.enabled) return false;
  if (ctx.playedRuleIds.includes(rule.id)) return false;
  if (!triggerMatches(rule.when, ctx.event)) return false;
  return conditionsMatch(rule.if, ctx.issue);
}

/**
 * La règle à JOUER pour cet événement : la première qui matche dans l'ordre du
 * jeu de règles. Une seule, jamais toutes — cf. l'en-tête du module.
 */
export function nextRule(
  rules: readonly AutomationRule[],
  ctx: AutomationMatchContext,
): AutomationRule | null {
  return rules.find((rule) => matchesRule(rule, ctx)) ?? null;
}

/**
 * La règle qui IMPLÉMENTE, sans regarder son déclencheur : ce que joue une
 * reprise après une vérification en échec. Le déclencheur ne convient pas ici —
 * il décrit d'où l'étape vient normalement (« le plan est écrit »), et une
 * reprise ne vient pas de là. Ce qui la définit, c'est son action.
 */
export function findImplementRule(
  rules: readonly AutomationRule[],
  ctx: Omit<AutomationMatchContext, "event">,
): AutomationRule | null {
  return (
    rules.find(
      (rule) =>
        rule.enabled &&
        !ctx.playedRuleIds.includes(rule.id) &&
        rule.then[0]?.type === "run_numo" &&
        rule.then[0].mode === "implement" &&
        conditionsMatch(rule.if, ctx.issue),
    ) ?? null
  );
}

// ── Simulation d'une chaîne ──────────────────────────────────────────────────

export interface SimulatedStep {
  ruleId: string;
  action: AutomationAction;
}

/** L'événement qu'une action produit en se terminant — null = fin de parcours. */
function eventAfter(action: AutomationAction): AutomationEvent | null {
  switch (action.type) {
    case "run_numo":
      return {
        type: "run_finished",
        intent: action.mode === "custom" ? "custom" : action.mode,
        outcome: "ok",
      };
    case "set_status":
      return { type: "status_changed", from: null, to: action.status };
    default:
      return null;
  }
}

/**
 * Déroule la chaîne À SEC : quelles étapes ces règles joueraient sur ce ticket,
 * tout allant bien. Sert à l'ESTIMATION affichée avant de lancer et à l'écran de
 * réglages (« un ticket M joue trois étapes »).
 *
 * Le vrai moteur fait exactement ce parcours-ci, un aller-retour de base par
 * étape ; c'est la même fonction de choix (`nextRule`) qui décide, donc la
 * simulation ne peut pas mentir sur l'ordre — seulement sur ce que la réalité y
 * ajoute (un run qui échoue, un budget qui tombe, une reprise).
 *
 * `throughHumanStop` : passer le point d'arrêt humain comme si quelqu'un avait
 * dit « continue » — c'est ce que l'estimation doit chiffrer (le parcours
 * complet), pas ce que la barre d'état doit annoncer.
 */
export function simulateChain(
  rules: readonly AutomationRule[],
  issue: AutomationIssueFacts,
  opts: { throughHumanStop?: boolean; from?: AutomationEvent } = {},
): SimulatedStep[] {
  const steps: SimulatedStep[] = [];
  const played: string[] = [];
  let event: AutomationEvent | null =
    opts.from ?? { type: "status_changed", from: null, to: issue.status };
  // Le plan s'écrit en chemin : une condition `hasPlan` doit voir le ticket tel
  // qu'il sera à cette étape-là, pas tel qu'il est maintenant.
  let facts = issue;
  let lastRunEvent: AutomationEvent | null = null;

  while (event && steps.length < MAX_CHAIN_STEPS) {
    const rule = nextRule(rules, { event, issue: facts, playedRuleIds: played });
    if (!rule) break;
    played.push(rule.id);
    const action = rule.then[0];
    steps.push({ ruleId: rule.id, action });

    if (action.type === "await_human") {
      if (!opts.throughHumanStop) break;
      // Reprise : le moteur rejoue l'événement du DERNIER run de la chaîne — il
      // n'y a rien d'autre à quoi rattacher la suite.
      event = lastRunEvent;
      continue;
    }
    if (action.type === "run_numo" && action.mode === "plan") {
      facts = { ...facts, plan: facts.plan ?? "- [ ] (plan écrit par Numo)" };
    }
    if (action.type === "set_status") facts = { ...facts, status: action.status };
    event = eventAfter(action);
    if (event?.type === "run_finished") lastRunEvent = event;
  }
  return steps;
}

/** Les modes de run qu'un parcours joue, dans l'ordre (estimation, affichage). */
export function simulatedRunModes(steps: readonly SimulatedStep[]): (AgentLaunchMode | "custom")[] {
  return steps
    .map((s) => (s.action.type === "run_numo" ? s.action.mode : null))
    .filter((m): m is AgentLaunchMode | "custom" => m !== null);
}

/**
 * Les règles à DÉMARQUER quand une vérification d'implémentation échoue et qu'on
 * reprend : celles qui implémentent et celles qui vérifient. La chaîne rejoue
 * alors son parcours normal (implémenter → vérifier) au lieu de s'arrêter faute
 * de règle non jouée — et le plan, lui, reste écrit : ce n'est pas lui qu'on
 * refait.
 */
export function rulesToReplayOnRetry(rules: readonly AutomationRule[]): string[] {
  return rules
    .filter((rule) =>
      rule.then.some(
        (action) =>
          action.type === "run_numo" &&
          (action.mode === "implement" || action.mode === "verify"),
      ),
    )
    .map((rule) => rule.id);
}

// ── Lecture tolérante du jsonb ───────────────────────────────────────────────

const STATUSES: readonly IssueStatus[] = [
  "triage",
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "canceled",
  "duplicate",
];
const PRIORITIES: readonly IssuePriority[] = ["none", "urgent", "high", "medium", "low"];
const EFFORTS: readonly (IssueEffort | "none")[] = ["xs", "s", "m", "l", "xl", "none"];
const INTENTS: readonly AgentLaunchIntent[] = ["implement", "plan", "verify", "custom"];
const REASONING: readonly ReasoningLevel[] = ["off", "low", "medium", "high"];

/** Cap d'une consigne libre stockée dans une règle (le reste est du prompt). */
const MAX_RULE_PROMPT_CHARS = 4000;
const MAX_RULE_NAME_CHARS = 120;
/** Cap du nombre de règles d'un projet — au-delà, personne ne les relit. */
export const MAX_AUTOMATION_RULES = 30;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickAll<T extends string>(value: unknown, allowed: readonly T[]): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const kept = value.filter((v): v is T => typeof v === "string" && (allowed as readonly string[]).includes(v));
  return kept.length > 0 ? [...new Set(kept)] : undefined;
}

function parseTrigger(raw: unknown): AutomationTrigger | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  if (obj.type === "status_changed") {
    const to = pickAll(obj.to, STATUSES);
    return to ? { type: "status_changed", to } : null;
  }
  if (obj.type === "run_finished") {
    const intent = pickAll(obj.intent, INTENTS);
    if (!intent) return null;
    const outcome = obj.outcome === "ok" || obj.outcome === "failed" ? obj.outcome : undefined;
    return { type: "run_finished", intent, ...(outcome ? { outcome } : {}) };
  }
  return null;
}

function parseConditions(raw: unknown): AutomationConditions {
  const obj = asRecord(raw);
  if (!obj) return {};
  const conditions: AutomationConditions = {};
  const effort = pickAll(obj.effort, EFFORTS);
  if (effort) conditions.effort = effort;
  const priority = pickAll(obj.priority, PRIORITIES);
  if (priority) conditions.priority = priority;
  if (typeof obj.hasPlan === "boolean") conditions.hasPlan = obj.hasPlan;
  if (Array.isArray(obj.categoryIds)) {
    const ids = obj.categoryIds.filter((v): v is string => typeof v === "string");
    if (ids.length > 0) conditions.categoryIds = ids;
  }
  if (typeof obj.assigned === "boolean") conditions.assigned = obj.assigned;
  return conditions;
}

function parseAction(raw: unknown): AutomationAction | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  switch (obj.type) {
    case "run_numo": {
      const mode = AUTOMATION_RUN_MODES.includes(obj.mode as AgentLaunchMode | "custom")
        ? (obj.mode as AgentLaunchMode | "custom")
        : null;
      if (!mode) return null;
      const action: AutomationRunAction = { type: "run_numo", mode };
      if (typeof obj.prompt === "string" && obj.prompt.trim()) {
        action.prompt = obj.prompt.trim().slice(0, MAX_RULE_PROMPT_CHARS);
      }
      if (typeof obj.model === "string" && obj.model.trim()) action.model = obj.model.trim();
      if (typeof obj.reasoningLevel === "string" && (REASONING as readonly string[]).includes(obj.reasoningLevel)) {
        action.reasoningLevel = obj.reasoningLevel as ReasoningLevel;
      }
      if (typeof obj.budgetUsd === "number" && Number.isFinite(obj.budgetUsd) && obj.budgetUsd > 0) {
        action.budgetUsd = obj.budgetUsd;
      }
      // Un mode `custom` sans consigne n'a rien à demander à l'agent.
      if (action.mode === "custom" && !action.prompt) return null;
      return action;
    }
    case "set_status":
      return typeof obj.status === "string" && (STATUSES as readonly string[]).includes(obj.status)
        ? { type: "set_status", status: obj.status as IssueStatus }
        : null;
    case "await_human":
      return {
        type: "await_human",
        ...(typeof obj.message === "string" && obj.message.trim()
          ? { message: obj.message.trim().slice(0, MAX_RULE_PROMPT_CHARS) }
          : {}),
      };
    case "stop":
      return { type: "stop" };
    default:
      return null;
  }
}

/**
 * Lit les règles d'un jsonb. TOLÉRANTE À DESSEIN : ces règles viennent de la
 * base, où une écriture d'une version antérieure du produit peut en avoir laissé
 * une forme qu'on ne connaît plus. Une règle illisible est IGNORÉE — elle ne
 * fait pas tomber le moteur, qui joue les autres.
 */
export function parseAutomations(raw: unknown): AutomationRule[] {
  if (!Array.isArray(raw)) return [];
  const rules: AutomationRule[] = [];
  const seen = new Set<string>();
  for (const item of raw.slice(0, MAX_AUTOMATION_RULES)) {
    const obj = asRecord(item);
    if (!obj) continue;
    const id = typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : null;
    if (!id || seen.has(id)) continue;
    const when = parseTrigger(obj.when);
    if (!when) continue;
    const then = Array.isArray(obj.then)
      ? obj.then.map(parseAction).filter((a): a is AutomationAction => a !== null)
      : [];
    if (then.length === 0) continue;
    seen.add(id);
    rules.push({
      id,
      name:
        typeof obj.name === "string" && obj.name.trim()
          ? obj.name.trim().slice(0, MAX_RULE_NAME_CHARS)
          : id,
      enabled: obj.enabled !== false,
      when,
      if: parseConditions(obj.if),
      then,
    });
  }
  return rules;
}

// ── Préréglages ──────────────────────────────────────────────────────────────

export const AUTOMATION_PRESET_IDS = ["loop-by-effort", "plan-only", "verify-only"] as const;
export type AutomationPresetId = (typeof AUTOMATION_PRESET_IDS)[number];

export function isAutomationPresetId(value: unknown): value is AutomationPresetId {
  return typeof value === "string" && (AUTOMATION_PRESET_IDS as readonly string[]).includes(value);
}

/** Efforts qui suivent le mode « m » : les moyens, et ceux qu'on n'a pas chiffrés. */
const MEDIUM_EFFORTS: (IssueEffort | "none")[] = ["m", "none"];
const BIG_EFFORTS: (IssueEffort | "none")[] = ["l", "xl"];
const SMALL_EFFORTS: (IssueEffort | "none")[] = ["xs", "s"];

// `model` reste ABSENT des préréglages : un identifiant OpenRouter épinglé ici
// vieillirait sans que personne ne le voie, et absent veut déjà dire « le défaut
// du lanceur ». Le levier de coût des préréglages, c'est le raisonnement.
const run = (mode: AgentLaunchMode, reasoningLevel: ReasoningLevel): AutomationRunAction => ({
  type: "run_numo",
  mode,
  reasoningLevel,
});

/**
 * La matrice de MIN-147, écrite en règles :
 *   xs, s  → implémentation directe ;
 *   m      → plan → implémentation → vérification de l'implémentation ;
 *   l, xl  → les quatre étapes, avec point d'arrêt humain après la vérif du plan.
 *
 * Deux détails qui font tout tenir :
 *   • « vérifier le plan » n'est pas un mode à part — c'est `mode: "plan"` sur un
 *     ticket qui A DÉJÀ un plan (`agentPlanPromptVariant` rend alors `reviewPlan`).
 *     D'où trois règles l/xl qui partagent le déclencheur `run_finished/plan`,
 *     départagées par `played_rule_ids` dans l'ordre où elles sont écrites ;
 *   • le niveau de raisonnement descend là où le travail est mécanique (vérifier
 *     un diff) et monte là où il ne l'est pas (cadrer un XL) : c'est le levier de
 *     coût par étape, sans épingler d'identifiant de modèle qui vieillirait.
 */
function loopByEffortRules(): AutomationRule[] {
  const p = "loop-by-effort";
  return [
    {
      id: `${p}:small-implement`,
      name: "XS/S — implémentation directe",
      enabled: true,
      when: { type: "status_changed", to: ["todo"] },
      if: { effort: SMALL_EFFORTS },
      then: [run("implement", "low")],
    },
    {
      id: `${p}:medium-plan`,
      name: "M — écrire le plan",
      enabled: true,
      when: { type: "status_changed", to: ["todo"] },
      if: { effort: MEDIUM_EFFORTS },
      then: [run("plan", "medium")],
    },
    {
      id: `${p}:medium-implement`,
      name: "M — implémenter le plan",
      enabled: true,
      when: { type: "run_finished", intent: ["plan"], outcome: "ok" },
      if: { effort: MEDIUM_EFFORTS },
      then: [run("implement", "medium")],
    },
    {
      id: `${p}:medium-verify`,
      name: "M — vérifier l'implémentation",
      enabled: true,
      when: { type: "run_finished", intent: ["implement"], outcome: "ok" },
      if: { effort: MEDIUM_EFFORTS },
      then: [run("verify", "low")],
    },
    {
      id: `${p}:big-plan`,
      name: "L/XL — écrire le plan",
      enabled: true,
      when: { type: "status_changed", to: ["todo"] },
      if: { effort: BIG_EFFORTS },
      then: [run("plan", "high")],
    },
    {
      id: `${p}:big-review-plan`,
      name: "L/XL — vérifier le plan",
      enabled: true,
      when: { type: "run_finished", intent: ["plan"], outcome: "ok" },
      if: { effort: BIG_EFFORTS },
      then: [run("plan", "high")],
    },
    {
      id: `${p}:big-await-human`,
      name: "L/XL — point d'arrêt humain",
      enabled: true,
      when: { type: "run_finished", intent: ["plan"], outcome: "ok" },
      if: { effort: BIG_EFFORTS },
      then: [{ type: "await_human" }],
    },
    {
      id: `${p}:big-implement`,
      name: "L/XL — implémenter le plan",
      enabled: true,
      when: { type: "run_finished", intent: ["plan"], outcome: "ok" },
      if: { effort: BIG_EFFORTS },
      then: [run("implement", "medium")],
    },
    {
      id: `${p}:big-verify`,
      name: "L/XL — vérifier l'implémentation",
      enabled: true,
      when: { type: "run_finished", intent: ["implement"], outcome: "ok" },
      if: { effort: BIG_EFFORTS },
      then: [run("verify", "low")],
    },
  ];
}

function planOnlyRules(): AutomationRule[] {
  return [
    {
      id: "plan-only:write",
      name: "Écrire le plan à l'entrée en « à faire »",
      enabled: true,
      when: { type: "status_changed", to: ["todo"] },
      if: {},
      then: [run("plan", "medium")],
    },
  ];
}

function verifyOnlyRules(): AutomationRule[] {
  return [
    {
      id: "verify-only:verify",
      name: "Vérifier l'implémentation à l'entrée en revue",
      enabled: true,
      when: { type: "status_changed", to: ["in_review"] },
      if: {},
      then: [run("verify", "low")],
    },
  ];
}

export interface AutomationPreset {
  id: AutomationPresetId;
  rules: () => AutomationRule[];
}

export const AUTOMATION_PRESETS: AutomationPreset[] = [
  { id: "loop-by-effort", rules: loopByEffortRules },
  { id: "plan-only", rules: planOnlyRules },
  { id: "verify-only", rules: verifyOnlyRules },
];

/** Les règles d'un préréglage (copie fraîche — l'appelant peut les éditer). */
export function presetRules(id: AutomationPresetId): AutomationRule[] {
  return AUTOMATION_PRESETS.find((p) => p.id === id)?.rules() ?? [];
}

/**
 * Le préréglage dont ce jeu de règles vient, si les identifiants le disent. Sert
 * à l'écran de réglages : « tu es sur `loop-by-effort` » plutôt que « voici neuf
 * règles ». Null dès qu'une règle a été ajoutée ou retirée — un préréglage
 * modifié n'est plus un préréglage.
 */
export function presetOfRules(rules: readonly AutomationRule[]): AutomationPresetId | null {
  for (const preset of AUTOMATION_PRESETS) {
    const ids = preset.rules().map((r) => r.id);
    if (ids.length !== rules.length) continue;
    if (ids.every((id, i) => rules[i]?.id === id)) return preset.id;
  }
  return null;
}

// ── Forçage par ticket ───────────────────────────────────────────────────────

/** `issues.automation_override` : null = suit le projet. */
export type AutomationOverride =
  | { disabled: true }
  | { preset: AutomationPresetId };

export function parseAutomationOverride(raw: unknown): AutomationOverride | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  if (obj.disabled === true) return { disabled: true };
  return isAutomationPresetId(obj.preset) ? { preset: obj.preset } : null;
}

/**
 * Les règles qui gouvernent CE ticket : celles du projet, sauf si le ticket
 * force un préréglage — ou se retire complètement de l'automatisation.
 */
export function rulesForIssue(
  projectRules: readonly AutomationRule[],
  override: AutomationOverride | null,
): AutomationRule[] {
  if (override && "disabled" in override) return [];
  if (override && "preset" in override) return presetRules(override.preset);
  return [...projectRules];
}
