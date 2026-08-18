/**
 * The vocabulary of project automations (MIN-147) — PURE logic,
 * shared client + server: the engine runs the rules, the editor of
 * rules draws the same fields. NO import `server-only`.
 *
 * An automation is a conditional rule:
 * • `when` — the EVENT that wakes it up. There are only two, because the
 * loop only needs these: a status change, and the end of a
 * run ;
 * • `if` — conditions on the TICKET (effort, priority, plan, categories,
 * assignment) ;
 * • `then` — actions: start Numo in a mode, set a status, stop
 * for a human, stop the chain.
 *
 * The MIN-147 effort matrix is NOT hardcoded: it is preset
 * `loop-by-effort`, an editable ruleset like any other. This is what makes
 * the feature customizable without making it complicated to use.
 *
 * ONE RULE PER EVENT. The engine plays the FIRST rule that matches and which
 * has not already been played on this chain (`played_rule_ids`). This is what
 * allows two rules to share the same trigger to describe two successive steps
 * — "write plan" then 'check plan' all end up
 * two on one `run_finished intent=plan` * — and it's also what breaks the loop
 * when the action `set_status` retriggers the hook that produced it.
 */

import type { IssueEffort, IssuePriority, IssueStatus } from "@/lib/issue-constants";
import { REASONING_LEVELS, type ReasoningLevel } from "@/lib/agent-reasoning";
import type { AgentLaunchMode } from "@/lib/server/agent/launch-message";
import type { AgentLaunchIntent } from "@/lib/server/agent/launch";
import { hasPlanTasks } from "@/lib/plan";
import { EFFORT_POINTS, effortToPoints } from "@/lib/cycle";

/**
 * Anti-runaway safeguard: beyond that, the chain stops regardless of what the
 * rules say. Same role as `AGENT_MAX_CONTINUATIONS` for a run — eight steps
 * largely cover the longest planned route (the four in l/xl mode, plus
 * a recovery after failed verification and its consequences).
 */
export const MAX_CHAIN_STEPS = 8;

/**
 * Restarts allowed when Numo fails ITS OWN implementation check.
 * One, and only one: the first retry carries the check report in
 * log, so it knows what to fix; a second failure on the same topic
 * says the ticket needs a human, not one more turn.
 */
export const MAX_VERIFICATION_RETRIES = 1;

/**
 * NO spending cap per channel — decision taken. Cutting a string in
 * right in the middle leaves a half-done ticket and a user who doesn't understand
 * why: the work stops without anyone asking, between
 * two steps he thought were linked. What limits the expense remains the QUOTA
 * OF THE ACCOUNT (`checkAgentQuota`): global, visible in the settings, and the same
 * for all uses of the AI. A string says what it cost when it ends (see `postChainComment`); she doesn't interrupt there.
 */

// ── Triggers ────────────────────────────── ───────────────────────────────

/**
 * WHO changed the status. Same vocabulary as `resolveIssueSource`
 * ([lib/server/create-issue.ts](lib/server/create-issue.ts)) — a second
 * taxonomy to say the same thing would be scheduled divergence — plus
 * `automation` for the loop fingerprint itself.
 *
 * This is the lever that prevents automation from conflicting with
 * manual work: "to do" does not mean the same thing depending on who put it in.
 *. A human moving a card is asking for something to start; a
 * MCP agent who puts away his ticket describes what HE is doing — him
 * throwing Numo on it is putting two workers on the same workbench.
 */
export const AUTOMATION_SOURCES = [
  /** A human gesture in minddy (web app, palette, drag and drop). */
  "web",
  /**
 * A human gesture made by the Numo ASSISTANT ("switches to MIN-42 to do").
 * This is a request, just like a drag and drop — only the keyboard
 * changes. Not to be confused with `agent` below.
 */
  "numo",
  /** An agent connected to the MCP server (Claude Code, Cursor, etc.). */
  "mcp",
  /**
 * minddy's CODE AGENT aligning status to its own lifecycle
 * (`issue-status-sync`): startup → `in_progress`, open PR → `in_review`,
 * merged PR → `done`, PR DENIED → `todo`. Nobody asked for these
 * entries, they describe the state of a run. Counting them as a request
 * caused the entire loop to restart at the slightest rejection of PR.
 */
  "agent",
  /** The loop itself (action `set_status`, put back into sorting). */
  "automation",
  /** The sync of the linked repository or a webhook from the forge. */
  "forge",
  /** Project integration (feedback API, etc.). */
  "integration",
  /** No actors — recurrences, crons. */
  "system",
] as const;
export type AutomationSource = (typeof AUTOMATION_SOURCES)[number];

/**
 * The origin of a writing, in the rules vocabulary. `raw` comes from
 * `resolveIssueSource` — we do not reimplement it here, we NARROW it (this module
 * is pure, it cannot import a module `server-only`), and an unknown code
 * falls on `system` rather than silently expanding the type.
 *
 * Two flags that `resolveIssueSource` does not know, and which take precedence in this
 * order:
 * • `viaAutomation` — the loop itself. It should never react to its
 * own fingerprint;
 * • `viaAgentRun` — the LIFE CYCLE of an agent run. `resolveIssueSource` the
 * renders `numo`, like the assistant: but the assistant relays a human REQUEST
 * ("put this ticket to to do") when the status sync only
 * describes the state of a run. Confusing them required dismissing the two, and therefore refusing to initiate the loop on a legitimate request.
 */
export function automationSourceOf(params: {
  raw: string;
  viaAutomation?: boolean;
  viaAgentRun?: boolean;
}): AutomationSource {
  if (params.viaAutomation) return "automation";
  if (params.viaAgentRun) return "agent";
  return (AUTOMATION_SOURCES as readonly string[]).includes(params.raw)
    ? (params.raw as AutomationSource)
    : "system";
}

/** The only two events the loop needs. */
export type AutomationTrigger =
  | {
      type: "status_changed";
      to: IssueStatus[];
      /**
 * Accepted origins. ABSENT = all — this is the weakest sense,
 * therefore the good default for a hand-written rule that doesn't care about it
 * (and for all those already in base). The presets, the
 * pose: cf. `HUMAN_SOURCES` / `WORKER_SOURCES`.
 */
      source?: AutomationSource[];
    }
  | { type: "run_finished"; intent: AgentLaunchIntent[]; outcome?: "ok" | "failed" };

export type AutomationTriggerType = AutomationTrigger["type"];

/** The ACTUAL event, as the brackets report it to the engine. */
export type AutomationEvent =
  | {
      type: "status_changed";
      from: IssueStatus | null;
      to: IssueStatus;
      /** Absent = unknown origin: this is the case for SIMULATED
 * (`simulateChain`) events, which should never be filtered on this — an estimation describes the nominal journey, not an actor audit. */
      source?: AutomationSource;
    }
  | { type: "run_finished"; intent: AgentLaunchIntent; outcome: "ok" | "failed" };

// ── Conditions ───────────────────────────────────────────────────────────────

/**
 * Conditions on the ticket. All optional, all cumulative (AND). An absent
 * field does not filter anything.
 *
 * `effort` accepts the value `"none"` for “effort not specified”. This is the
 * way to otherwise handle the ticket effortlessly: by default it follows the
 * rules of `m` mode, which starts with writing a plan — which will tell
 * the actual size, without paying a model call to guess it.
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
 * A step in the chain. `mode` includes the three NATIVE ways of launching Numo
 * (the same as the app buttons, see `AGENT_LAUNCH_MODES`) plus `custom`,
 * which carries a free setpoint.
 *
 * `model` and `reasoningLevel` are the “one model per step” lever: we pass
 * through OpenRouter, so there is no obligation to plan an XL and reread a diff of
 * three lines with the same model. `null` = launcher default.
 */
export interface AutomationRunAction {
  type: "run_numo";
  mode: AgentLaunchMode | "custom";
  prompt?: string;
  model?: string | null;
  reasoningLevel?: ReasoningLevel | null;
}

export type AutomationAction =
  | AutomationRunAction
  | { type: "set_status"; status: IssueStatus }
  /** Human breakpoint: The chain waits for an explicit "Continue". */
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
 * Modes offered by the rule editor, in loop order. Declared here
 * rather than imported from `launch-message.ts`: this module drags `next-intl` and
 * a dynamic import of all message catalogs, which a component
 * client has no reason to embark on. The TYPE comes from there — a
 * divergence breaks the compilation.
 */
export const AUTOMATION_RUN_MODES: readonly (AgentLaunchMode | "custom")[] = [
  "plan",
  "implement",
  "verify",
  "custom",
];

/**
 * Cost of falling back a step, in USD, when the project has NO history of
 * runs to be medianized (`estimateChainCost`). Orders of magnitude measured on the
 * minddy runs, not exact numbers: an estimate never had to be
 * just, it has to not surprise.
 *
 * A CONSTANT, not a key `app_config`: only `AI_MODEL_CONFIG_FIELDS` is
 * adjustable on the admin side, a key outside of this list would never be set by
 * anyone.
 */
export const DEFAULT_STEP_COST_USD: Record<AgentLaunchMode | "custom", number> = {
  plan: 0.08,
  implement: 0.3,
  verify: 0.1,
  custom: 0.2,
};

/**
 * Cost factor of a step according to the EFFORT of the ticket, the reference being the M.
 *
 * Planning an XS and planning an XL do not cost the same — neither the plan,
 * nor the code, nor the proofreading. A cost per step independent of size gave
 * a flat estimate ("XS and XL, 2% each"), therefore wrong at both ends:
 * it overestimated the small tickets and especially UNDERESTIMATED the large ones. The
 * second end is the serious one: the ceiling of a chain derives from this estimate,
 * and an XL budgeted like an M stops on "budget" in the middle of the work.
 *
 * The scale is not invented here: it is `EFFORT_POINTS` (Fibonacci
 * xs1 s2 m3 l5 xl8), already the product size measurement for the capacity of the
 * cycles. Unreported effort counts as an M, like everywhere else.
 * Two places that weigh a ticket must weigh it the same.
 *
 * (The estimate remains a DISPLAY: nothing interrupts on it.)
 */
export function effortCostFactor(effort: IssueEffort | null | undefined): number {
  return effortToPoints(effort) / EFFORT_POINTS.m;
}

/** Cost of folding one step ON THIS TICKET — mode × size. */
export function stepCostUsd(
  mode: AgentLaunchMode | "custom",
  effort: IssueEffort | null | undefined,
): number {
  return DEFAULT_STEP_COST_USD[mode] * effortCostFactor(effort);
}

// ── The ticket, as the rules read it ──────────────────────────────────

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
  /** Rules already played on the channel — a rule is never played again. */
  playedRuleIds: readonly string[];
}

function triggerMatches(trigger: AutomationTrigger, event: AutomationEvent): boolean {
  if (trigger.type !== event.type) return false;
  if (trigger.type === "status_changed" && event.type === "status_changed") {
    if (!trigger.to.includes(event.to)) return false;
    // Origin: we only filter if the rule requests it AND the event
    // door. An event without an origin is a SIMULATED event — filter it
    // would lie to the cost estimate, which must quantify the nominal journey.
    if (trigger.source && event.source && !trigger.source.includes(event.source)) {
      return false;
    }
    return true;
  }
  if (trigger.type === "run_finished" && event.type === "run_finished") {
    if (!trigger.intent.includes(event.intent)) return false;
    // `outcome` absent = both outcomes agree (rare, but that's the meaning
    // the weakest, therefore the correct default for an optional field).
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

/** Does a rule apply here and now? Pure, testable alone. */
export function matchesRule(rule: AutomationRule, ctx: AutomationMatchContext): boolean {
  if (!rule.enabled) return false;
  if (ctx.playedRuleIds.includes(rule.id)) return false;
  if (!triggerMatches(rule.when, ctx.event)) return false;
  return conditionsMatch(rule.if, ctx.issue);
}

/**
 * The rule to PLAY for this event: the first that matches in the order of the
 * rule set. Only one, never all — cf. the module header.
 */
export function nextRule(
  rules: readonly AutomationRule[],
  ctx: AutomationMatchContext,
): AutomationRule | null {
  return rules.find((rule) => matchesRule(rule, ctx)) ?? null;
}

/**
 * The rule that IMPLEMENTS, without looking at its trigger: what a
 * restart after a failed check plays. The trigger doesn't fit here —
 * it describes where the step normally comes from ("the plan is written"), and a
 * resume doesn't come from there. What defines it is its action.
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

// ── Simulation of a string ───────────────────────── ─────────────────────────

export interface SimulatedStep {
  ruleId: string;
  action: AutomationAction;
}

/** The event that an action produces when terminating — null = end of run. */
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
 * Unrolls the string TO DRY: what steps these rules would play on this ticket,
 * all being well. Used for the ESTIMATE displayed before launching and on the
 * settings screen ("an M ticket plays three steps").
 *
 * The real engine does exactly this route, a basic round trip per
 * step; it is the same choice function (`nextRule`) which decides, so the
 * simulation cannot lie about the order — only about what reality y
 * adds (a run that fails, a budget that falls, a recovery).
 *
 * `throughHumanStop`: pass the human breakpoint as if someone had
 * said "continue" — that's what the estimate should encrypt (the full journey), not what the status bar should announce.
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
  // The plan is written along the way: a condition `hasPlan` must see the ticket as
  // that he will be at that stage, not as he is now.
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
      // Resume: the engine replays the event of the LAST run in the chain — it
      // there is nothing else to connect the rest to.
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

/**
 * All rules play on the LIFE of a ticket, not a single
 * string. Two rules can react to two different statuses — "write plan
 * when entering todo" and "check when entering review" — and they are then
 * TWO chains, opened at two times, separated by human work.
 *
 * `simulateChain` sees none only one: part of “to do”, it stops before
 * the review. A plan+verification preset was therefore considered one step instead of
 * two, and a preset which only reacted to the review entry was displayed
 * downright FREE. For a screen whose whole reason for being is to say what
 * it costs, this was the worst place to go wrong.
 *
 * So we open a channel by status to which a rule reacts. Known reserve:
 * a rule set that would use `set_status` to a status that an OTHER
 * rule would count this sequence twice. No preset does this, and
 * this is an estimate — not an invoice.
 */
export function simulateIssueLifetime(
  rules: readonly AutomationRule[],
  issue: AutomationIssueFacts,
): SimulatedStep[] {
  const entries: IssueStatus[] = [];
  for (const rule of rules) {
    if (!rule.enabled || rule.when.type !== "status_changed") continue;
    for (const status of rule.when.to) {
      if (!entries.includes(status)) entries.push(status);
    }
  }
  return entries.flatMap((status) =>
    simulateChain(
      rules,
      { ...issue, status },
      { throughHumanStop: true, from: { type: "status_changed", from: null, to: status } },
    ),
  );
}

/** The run modes a course plays, in order (estimate, display). */
export function simulatedRunModes(steps: readonly SimulatedStep[]): (AgentLaunchMode | "custom")[] {
  return steps
    .map((s) => (s.action.type === "run_numo" ? s.action.mode : null))
    .filter((m): m is AgentLaunchMode | "custom" => m !== null);
}

/**
 * The rules to UNMARK when an implementation check fails and we
 * include: those that implement and those that check. The chain replays
 * then its normal course (implement → verify) instead of stopping due to a fault
 * of an unplayed rule — and the plan remains written: it is not the one that we
 * redo.
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

// ── Tolerant reading of jsonb ─────────────────────── ────────────────────────

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
const PRIORITIES: readonly IssuePriority[] = ["none", "low", "medium", "high", "urgent"];
const EFFORTS: readonly (IssueEffort | "none")[] = ["xs", "s", "m", "l", "xl", "none"];
const INTENTS: readonly AgentLaunchIntent[] = ["implement", "plan", "verify", "custom"];
// The complete vocabulary, that of models (see lib/agent-reasoning.ts): a
// list copied here would be a list that ages separately.
const REASONING: readonly ReasoningLevel[] = REASONING_LEVELS;

/** Cap of a free instruction stored in a rule (the rest is from the prompt). */
const MAX_RULE_PROMPT_CHARS = 4000;
const MAX_RULE_NAME_CHARS = 120;
/** Cap for the number of rules in a project — beyond that, no one rereads them. */
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
    if (!to) return null;
    const source = pickAll(obj.source, AUTOMATION_SOURCES);
    return { type: "status_changed", to, ...(source ? { source } : {}) };
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
      // A `custom` mode without instructions does not require anything from the agent.
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
 * Reads rules from a jsonb. TOLERANT BY PURPOSE: these rules come from the
 * base, where a writing of a previous version of the product may have left
 * a form that we no longer know. An unreadable rule is IGNORED — it does not drop the engine, which plays the others.
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

// ── Presets ─────────────────────────────── ───────────────────────────────

/**
 * Display order: the two that chain several steps first, then the
 * three that play only one — arranged in loop order
 * (plan, implement, verify).
 */
export const AUTOMATION_PRESET_IDS = [
  "loop-by-effort",
  "plan-and-verify",
  "plan-only",
  "implement-only",
  "verify-only",
] as const;
export type AutomationPresetId = (typeof AUTOMATION_PRESET_IDS)[number];

export function isAutomationPresetId(value: unknown): value is AutomationPresetId {
  return typeof value === "string" && (AUTOMATION_PRESET_IDS as readonly string[]).includes(value);
}

/** Efforts that follow mode “m”: the means, and those that have not been quantified. */
const MEDIUM_EFFORTS: (IssueEffort | "none")[] = ["m", "none"];
const BIG_EFFORTS: (IssueEffort | "none")[] = ["l", "xl"];
const SMALL_EFFORTS: (IssueEffort | "none")[] = ["xs", "s"];

/**
 * WRITING CODE only starts from a human REQUEST.
 *
 * “To do” does not mean the same thing depending on who asked it. You who
 * move a card - or who tell Numo to move it, it's the same gesture and
 * the same intention - you ask for it to start. An MCP agent who files his
 * ticket describes what HE is doing; the code agent that aligns a described status where
 * is ITS run; the forge reports the status of a PR. None of these three
 * are requests, and fulfilling them puts two workers on the same branch.
 */
const HUMAN_SOURCES: AutomationSource[] = ["web", "numo"];

/**
 * CHECK, on ​​the contrary, accepts anything that WORKS. “An agent has finished,
 * minddy rereads” is the best use of the loop — and prohibiting it from the MCP la
 * would deprive it of its strongest scenario: Claude Code finishes, reviews the ticket
 *, and the check goes away on its own. Rereading does not overwrite the work of
 * anyone, unlike coding.
 *
 * Only excluded: `automation` (the fingerprint of the loop itself, without which
 * a chain would react to its own `set_status`), `integration` and `system`.
 */
const WORKER_SOURCES: AutomationSource[] = ["web", "numo", "mcp", "agent", "forge"];

// `model` remains MISSING from the presets: an OpenRouter identifier pinned here
// would age without anyone seeing it, and absent already means “the defect
// from the launcher”. The cost driver of presets is reasoning.
const run = (mode: AgentLaunchMode, reasoningLevel: ReasoningLevel): AutomationRunAction => ({
  type: "run_numo",
  mode,
  reasoningLevel,
});

/**
 * The MIN-147 matrix, written in rules:
 * xs, s → direct implementation;
 * m → plan → implementation → verification of implementation;
 * l, xl → all four steps, with human breakpoint after verification of the plan.
 *
 * Two details that hold everything together:
 * • “check the plan” is not a separate mode — it's `mode: "plan"` on a
 * ticket which ALREADY HAS a plan (`agentPlanPromptVariant` then returns `reviewPlan`) (check
 * a diff) and goes up where it is not (frame an XL): this is the lever of
 * cost per step, without pinning a model identifier which would age.
 */
function loopByEffortRules(): AutomationRule[] {
  const p = "loop-by-effort";
  return [
    {
      id: `${p}:small-implement`,
      name: "XS/S — implémentation directe",
      enabled: true,
      when: { type: "status_changed", to: ["todo"], source: HUMAN_SOURCES },
      if: { effort: SMALL_EFFORTS },
      then: [run("implement", "low")],
    },
    {
      id: `${p}:medium-plan`,
      name: "M — écrire le plan",
      enabled: true,
      when: { type: "status_changed", to: ["todo"], source: HUMAN_SOURCES },
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
      when: { type: "status_changed", to: ["todo"], source: HUMAN_SOURCES },
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

/**
 * Supervise human work: the agent frames BEFORE, controls AFTER, and never writes
 * the code. The only preset where both ends of the loop rotate
 * without the middle — for teams that want the agent's help on what's being reread (a shot, a diff) without handing over the keyboard.
 */
function planAndVerifyRules(): AutomationRule[] {
  const p = "plan-and-verify";
  return [
    {
      id: `${p}:write`,
      name: "Écrire le plan à l'entrée en « à faire »",
      enabled: true,
      when: { type: "status_changed", to: ["todo"], source: HUMAN_SOURCES },
      if: {},
      then: [run("plan", "medium")],
    },
    {
      id: `${p}:verify`,
      name: "Vérifier l'implémentation à l'entrée en revue",
      enabled: true,
      when: { type: "status_changed", to: ["in_review"], source: WORKER_SOURCES },
      if: {},
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
      when: { type: "status_changed", to: ["todo"], source: HUMAN_SOURCES },
      if: {},
      then: [run("plan", "medium")],
    },
  ];
}

/**
 * Right to the code: no plan before, no verification after. The least expensive preset
 * and the only one without a net — that's what its description should say, because
 * on a poorly described ticket, no one proofreads until PR.
 */
function implementOnlyRules(): AutomationRule[] {
  return [
    {
      id: "implement-only:implement",
      name: "Implémenter à l'entrée en « à faire »",
      enabled: true,
      when: { type: "status_changed", to: ["todo"], source: HUMAN_SOURCES },
      if: {},
      then: [run("implement", "medium")],
    },
  ];
}

function verifyOnlyRules(): AutomationRule[] {
  return [
    {
      id: "verify-only:verify",
      name: "Vérifier l'implémentation à l'entrée en revue",
      enabled: true,
      when: { type: "status_changed", to: ["in_review"], source: WORKER_SOURCES },
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
  { id: "plan-and-verify", rules: planAndVerifyRules },
  { id: "plan-only", rules: planOnlyRules },
  { id: "implement-only", rules: implementOnlyRules },
  { id: "verify-only", rules: verifyOnlyRules },
];

/** The rules of a preset (fresh copy — caller can edit them). */
export function presetRules(id: AutomationPresetId): AutomationRule[] {
  return AUTOMATION_PRESETS.find((p) => p.id === id)?.rules() ?? [];
}

/**
 * The preset this ruleset comes from, if the identifiers say so. Serves
 * on the settings screen: "you are on `loop-by-effort`" rather than "here are new
 * rules". Null as soon as a rule has been added or removed — a modified preset
 * is no longer a preset.
 */
export function presetOfRules(rules: readonly AutomationRule[]): AutomationPresetId | null {
  for (const preset of AUTOMATION_PRESETS) {
    const ids = preset.rules().map((r) => r.id);
    if (ids.length !== rules.length) continue;
    if (ids.every((id, i) => rules[i]?.id === id)) return preset.id;
  }
  return null;
}

// ── The preset, in COUNT ──────────────────────── ─────────────────────────

/**
 * Account Preference (Account → Automations): The preset that governs
 * ALL projects I own. Stored in the `user_metadata`
 * Supabase, like `numo_default_status` and the cycle settings.
 *
 * By the account and not by the project, because we do not reconfigure the same loop at
 * each new project. The usual objection — "an account setting
 * would drive tickets for which it does not pay the deposit" — does not hold here: the preset read is that of the OWNER of the project, who is also the one who pays (`billTo: projectOwner`) and the only one who can arm a project. Payer and
 * configurator remain the same person.
 *
 * What remains for the project is the SWITCH: `projects.automations_enabled`,
 * one per project — turning on the loop on its production repository is not the
 * same decision as on a sandbox.
 */
export const AUTOMATION_PRESET_META_KEY = "automation_preset";

/**
 * DEPRISE before starting a chain, in minutes (Count → Automations).
 *
 * Dragging a card to "to do" is a WEAK move — we do it by sorting, sometimes by mistake, and change our mind within a minute. Click
 * “casting Numo” is a STRONG gesture. Without reprieve, automation transforms the
 * small gesture into an immediate expense; it is this disproportion that we correct.
 *
 * Semantics of `for:` of Prometheus alerts: the condition must hold EN
 * CONTINUOUS. When you wake up, the ticket should still be in the status that opened
 * the chain — which covers, without tracking anything more, "I copied the prompt
 * to do it myself" (the copy moves the ticket to `in_progress`), "I
 * put it back in the backlog", "I filed it .
 *
 * `0` = immediate boot, as before. ONLY valid for bootstrapping: a chain
 * part continues its steps without waiting.
 */
export const AUTOMATION_START_DELAY_META_KEY = "automation_start_delay_min";

/** Enough to change your mind, short enough for it to remain automatic. */
export const DEFAULT_AUTOMATION_START_DELAY_MIN = 5;
/** The values ​​offered on the screen — beyond that, it is no longer a reprieve. */
export const AUTOMATION_START_DELAY_CHOICES = [0, 2, 5, 10, 30] as const;
const MAX_AUTOMATION_START_DELAY_MIN = 120;

export function resolveAutomationStartDelayMinutes(
  meta: Record<string, unknown> | null | undefined,
): number {
  const raw = meta?.[AUTOMATION_START_DELAY_META_KEY];
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_AUTOMATION_START_DELAY_MIN;
  }
  return Math.min(MAX_AUTOMATION_START_DELAY_MIN, Math.max(0, Math.round(raw)));
}

/** The account preset, or `null` — none, so nothing triggers. */
export function resolveAutomationPreset(
  meta: Record<string, unknown> | null | undefined,
): AutomationPresetId | null {
  const raw = meta?.[AUTOMATION_PRESET_META_KEY];
  return isAutomationPresetId(raw) ? raw : null;
}

// ── Personnalisation par EFFORT, au compte ───────────────────────────────────

/**
 * Two settings per ticket size, next to the preset:
 * • on what efforts the loop is allowed to run;
 * • with what model, effort by effort.
 *
 * This is what replaces the rule editor: we keep the customization which
 * counts — “no automation on my XL”, “a small model on my XS” —
 * without asking it to read nine lines of conditional syntax. What we lose there, and that is
 * assumed: the model is no longer chosen by PHASE (plan vs. check), but
 * by size. The presets continue to dose the REASONING per phase.
 *
 * The uninformed effort does not have its line: it follows that of the M, as everywhere
 * elsewhere (rules of `m` mode, cycle points, cost factor).
 */
export const AUTOMATION_EFFORTS_META_KEY = "automation_efforts";
export const AUTOMATION_MODELS_META_KEY = "automation_models";

/** The line of settings that a ticket follows: its own, or that of the Mr. */
export function automationEffortKey(effort: IssueEffort | null | undefined): IssueEffort {
  return effort ?? "m";
}

const ALL_EFFORTS: readonly IssueEffort[] = ["xs", "s", "m", "l", "xl"];

/**
 * The forces on which the loop rotates. Default: ALL — someone who
 * chooses a preset wants it to apply; it's the removal that is a
 * gesture, not the inclusion. Only an explicit `false` turns off a size.
 */
export function resolveAutomationEfforts(
  meta: Record<string, unknown> | null | undefined,
): Record<IssueEffort, boolean> {
  const raw = meta?.[AUTOMATION_EFFORTS_META_KEY];
  const map = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(ALL_EFFORTS.map((e) => [e, map[e] !== false])) as Record<
    IssueEffort,
    boolean
  >;
}

export function isAutomationEffortEnabled(
  meta: Record<string, unknown> | null | undefined,
  effort: IssueEffort | null | undefined,
): boolean {
  return resolveAutomationEfforts(meta)[automationEffortKey(effort)];
}

/** Model chosen by effort. Absent = account default, such as manual launch. */
export function resolveAutomationModels(
  meta: Record<string, unknown> | null | undefined,
): Partial<Record<IssueEffort, string>> {
  const raw = meta?.[AUTOMATION_MODELS_META_KEY];
  const map = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const out: Partial<Record<IssueEffort, string>> = {};
  for (const effort of ALL_EFFORTS) {
    const value = map[effort];
    if (typeof value === "string" && value.trim()) out[effort] = value.trim();
  }
  return out;
}

export function automationModelFor(
  meta: Record<string, unknown> | null | undefined,
  effort: IssueEffort | null | undefined,
): string | null {
  return resolveAutomationModels(meta)[automationEffortKey(effort)] ?? null;
}

/**
 * The rules that govern a PROJECT: those written on the project if they
 * exist, otherwise those of its owner's preset.
 *
 * `projects.automations` is no longer the normal source — it is an EXEMPTION,
 * that no screen writes and that only the API and the MCP server pose. Keeping it
 * costs this line and avoids enclosing special cases.
 */
export function rulesForProject(
  projectRules: unknown,
  ownerMeta: Record<string, unknown> | null | undefined,
): AutomationRule[] {
  const written = parseAutomations(projectRules);
  if (written.length > 0) return written;
  const preset = resolveAutomationPreset(ownerMeta);
  return preset ? presetRules(preset) : [];
}

// ── Force by ticket ─────────────────────────── ────────────────────────────

/**
 * `issues.automation_override`: null = follows the project.
 *
 * WRITTEN BY THE PROJECT OWNER, AND BY NOBODY ELSE (MIN-339). Force
 * a preset here is to decide that agent runs will leave — on the
 * quota, plan and BYOK key of the owner, never on those who set
 * the force. The guard lives in `updateIssueFields` (403 `ownerOnly`): no
 * screen writes this field, only the API and the MCP server ask it, so it's
 * there — and nowhere else — that you have to (re)find it.
 */
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
 * The rules that govern THIS ticket: those of the project, unless the ticket
 * forces a preset — or opts out of automation altogether.
 */
export function rulesForIssue(
  projectRules: readonly AutomationRule[],
  override: AutomationOverride | null,
): AutomationRule[] {
  if (override && "disabled" in override) return [];
  if (override && "preset" in override) return presetRules(override.preset);
  return [...projectRules];
}
