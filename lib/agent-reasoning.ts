/**
 * Niveau de raisonnement d'un run de l'agent de code (MIN-122). Logique PURE :
 * vocabulary (`off` / `minimal` / `low` / `medium` / `high` / `xhigh` /
 * `max`) and its translation into query fields, provider by provider.
 *
 * THIS VOCABULARY IS THAT OF THE MODELS, NOT OURS. He does not invent himself: he
 * is published model by model in `/models` of OpenRouter (object `reasoning`,
 * field `supported_efforts`), and that's where it goes down to the selector —
 * 128 out of 406 models publish one, and two of them rarely have the same
 * (`high|medium|low`, `xhigh|high|medium|low|minimal`, `max|high|low`…). Ce que
 * the screen suggests is therefore what the CHOSEN model accepts, and nothing else
 * (`reasoningLevelsFor`): three generic levels applied to all
 * n'affichaient ni ce qu'il savait faire de plus, ni ce qu'il ne savait pas
 * faire du tout.
 *
 * Shared client + server (NO server-only import), like
 * `lib/agent-providers.ts` whose capacity it reads: the launch selector has
 * need the level list, the launch route of `isReasoningLevel`,
 * and the `reasoningRequestFields` loop. One file rather than two
 * halves that could diverge.
 *
 * UN SEUL vocabulaire produit, traduit au dernier moment : `reasoning: { effort }`
 * (OpenRouter), `reasoning_effort` (OpenAI/Gemini) or `thinking` (the
 * compatibility Anthropic retains its native contract here).
 *
 * The gate is the register: a provider without `reasoningField` sends NOTHING.
 * This is the safe default — an unknown field sent to an OpenAI-compatible server
 * strict (BYOK generic) returns to 400, and a 400 kills the round.
 */

import { getAgentProvider, type AgentProviderId } from "./agent-providers";

export type ReasoningLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

/**
 * All the vocabulary, from least expensive to most expensive. It's OpenRouter's
 * (`minimal`, `low`, `medium`, `high`, `xhigh`, `max`), except for one word: their
 * `none` is our `off`, which means something a little stronger —
 * send NO reasoning fields, rather than sending one that asks
 * zero. This is the only safe fault outside OpenRouter, where an unknown field returns
 * 400 and kills the round.
 *
 * This list is NOT what the selector displays: a given model does not accept
 * only part of these values, and it is he who says it (`reasoningLevelsFor`).
 */
export const REASONING_LEVELS: ReasoningLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

/**
 * What we propose about a model that publishes NOTHING about its reasoning — a BYOK
 * direct, a non-index model, a provider for which we do not have a capacity index.
 *
 * The four histories, and not the seven: propose `xhigh` to a model of which we
 * ignores everything, it is proposing a level which will be silently reduced (at
 * OpenRouter) or refused (elsewhere). A selector should only offer choices that
 * changent quelque chose.
 */
export const GENERIC_REASONING_LEVELS: ReasoningLevel[] = ["off", "low", "medium", "high"];

/**
 * What a model says about its own reasoning, such as the OpenRouter index
 * publishes (`/models`, object `reasoning`). Read server side
 * ([openrouter-index.ts](server/agent/openrouter-index.ts)), il voyage jusqu'au
 * selector with the catalog.
 *
 * We only keep two fields out of the five published, because they are the two
 * which change the screen. `default_effort` and `default_enabled` describe what the
 * model made when we ask for nothing — but we always ask for something.
 * `supports_max_tokens` (10 models out of 406) would open a SECOND form of
 * adjustment, a token budget, and a selector which changes nature depending on the
 * model is a selector that we no longer know how to read: OpenRouter translates everything
 * way our budget levels for models that only hear that.
 */
export interface ModelReasoning {
  /**
   * The tiers that THIS model accepts, from least expensive to most expensive. Empty = he
   * reasons, but does not publish any enumeration (this is the case of Claude): we
   * then falls back to `GENERIC_REASONING_LEVELS`.
   */
  efforts: ReasoningLevel[];
  /**
   * The model ALWAYS reasons (`mandatory`): “without reasoning” is not
   * an option to offer him — he refuses `none`, and sending it to him breaks the call.
   */
  mandatory: boolean;
}

/**
 * What the selector displays for a given model. Without metadata (model
 * unknown, provider without index), the four historical levels; with, those who
 * the model publishes, more `off` when it allows us not to reason.
 *
 * `null` (not an empty list) = this model has NO reasoning ability:
 * the caller then shows an inert selector rather than a choice with no effect.
 */
export function reasoningLevelsFor(
  reasoning: ModelReasoning | null | undefined,
): ReasoningLevel[] {
  if (!reasoning) return GENERIC_REASONING_LEVELS;
  const efforts = reasoning.efforts.length > 0 ? reasoning.efforts : GENERIC_REASONING_LEVELS;
  const withoutOff = efforts.filter((l) => l !== "off");
  return reasoning.mandatory ? withoutOff : ["off", ...withoutOff];
}

/**
 * Drop a level on what the model REALLY accepts. Used for the selector (a
 * personal default at `xhigh` on a model which does not want it must be displayed on its
 * nearest neighbor, not in a vacuum) and at launch.
 *
 * “Closest” is read on the full scale, in both directions: first
 * downwards (cheaper than requested, never more), then upwards if the
 * model is nothing cheaper — a model that only accepts `high` must
 * receive `high`, even when asked for `low`.
 */
export function nearestReasoningLevel(
  level: ReasoningLevel,
  allowed: ReasoningLevel[],
): ReasoningLevel {
  if (allowed.includes(level)) return level;
  if (allowed.length === 0) return level;
  const rank = (l: ReasoningLevel) => REASONING_LEVELS.indexOf(l);
  const sorted = [...allowed].sort((a, b) => rank(a) - rank(b));
  const below = [...sorted].reverse().find((l) => rank(l) < rank(level));
  return below ?? sorted[0];
}

/**
 * Default: `medium` (“Standard” in the UI). The agent thinks a little before
 * to act, because that's what we want from a code agent in the general case —
 * `off` was the MIN-122 landing fault, chosen to introduce no
 * change in behavior on delivery day, not because it served better
 * the user. The additional cost remains limited by the usage budget (`checkAgentQuota`),
 * and an endpoint which refuses the field is caught by the restart without field of
 * `streamCompletion` (cf. docs/reasoning-levels.md).
 */
export const DEFAULT_REASONING_LEVEL: ReasoningLevel = "medium";

/** Validates an API entry / a value read in base. */
export function isReasoningLevel(value: unknown): value is ReasoningLevel {
  return typeof value === "string" && (REASONING_LEVELS as string[]).includes(value);
}

/** Normalizes anything to valid level (default `DEFAULT_REASONING_LEVEL`). */
export function toReasoningLevel(value: unknown): ReasoningLevel {
  return isReasoningLevel(value) ? value : DEFAULT_REASONING_LEVEL;
}

/**
 * The reasoning keys that can be placed in a request body. Also serves
 * at guardrail 400 of the loop: an error message which cites one of them
 * designates an endpoint that REJECTS the field instead of ignoring it.
 */
export const REASONING_REQUEST_KEYS = ["reasoning_effort", "reasoning", "thinking"] as const;

/** What a flat `reasoning_effort` accepts: the OpenAI API vocabulary. */
const COMPAT_EFFORTS: ReasoningLevel[] = ["minimal", "low", "medium", "high"];

/**
 * Fields to merge into body `/chat/completions` to request this level.
 * `{}` (nothing to send) when: level `off`, unknown value, or provider without
 * capacity declared in the register (`generic`, and any future provider as long as we
 * has not found that it accepts the field).
 */
export function reasoningRequestFields(
  level: ReasoningLevel | null | undefined,
  provider: AgentProviderId,
): Record<string, unknown> {
  if (!isReasoningLevel(level) || level === "off") return {};
  const field = getAgentProvider(provider)?.requestProfile.reasoningField;
  if (!field) return {};
  // `exclude: false`: we WANT to receive the trace to persist it folded into
  // the feed — what we don't want is the streamer (see the feed indicator).
  if (field === "reasoning") return { reasoning: { effort: level, exclude: false } };
  // Anthropic depends on the model family (manual up to 4.6, adaptive to
  // from 4.7). The model-aware translator in lib/ai-chat.ts takes care of this.
  if (field === "thinking") return {};
  /**
   * The compat layers (openai, anthropic, google) only know the
   * OpenAI API vocabulary. `xhigh` and `max` are OpenRouter tiers,
   * who himself reduces them to what the model accepts; sent directly, they
   * come back to 400 and kill the round. We therefore fold down BEFORE — lose a notch of
   * reflection is better than losing the turn.
   */
  return { reasoning_effort: nearestReasoningLevel(level, COMPAT_EFFORTS) };
}

/**
 * Reflection tokens to be provided IN ADDITION to the answer, by level. They serve
 * to the overall ceiling and, for Claudes who still accept manual mode, to
 * indicative budget in the model-aware adapter.
 */
const REASONING_HEADROOM: Record<ReasoningLevel, number> = {
  off: 0,
  minimal: 512,
  low: 1024,
  medium: 2048,
  high: 4096,
  xhigh: 6144,
  max: 8192,
};

/** Indicative budget behind a level, used by the Anthropic adapter. */
export function reasoningTokenBudget(level: ReasoningLevel): number {
  return REASONING_HEADROOM[level];
}

/**
 * Internal output ceiling to request when reasoning is active. THE
 * reflection tokens are counted IN this ceiling by the compat layers: at `high`, the
 * reflection would eat most of the 8192 in the profile and truncate the answer
 * **and the tool-calls** of the round. We therefore raise the ceiling on the expected additional cost.
 * `undefined` at the entrance (surface without ceiling) remains `undefined`.
 */
export function reasoningMaxTokens(
  base: number | undefined,
  level: ReasoningLevel | null | undefined,
): number | undefined {
  if (base === undefined) return undefined;
  if (!isReasoningLevel(level)) return base;
  return base + reasoningTokenBudget(level);
}

/**
 * The four levels are open to ALL, minddy quota included: the subscription is
 * paid, it must be usable in its entirety. A `high` consumes the usage budget
 * monthly faster, but cannot exceed it — `checkAgentQuota` refuses the
 * launch and the loop stops by itself when the budget is exhausted. Ceiling
 * the extra level would not have protected anything, at the cost of a rule to explain.
 */
