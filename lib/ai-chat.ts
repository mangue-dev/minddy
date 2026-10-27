import {
  getAgentProvider,
  type AgentProviderId,
} from "./agent-providers";
import {
  nearestReasoningLevel,
  reasoningRequestFields,
  reasoningTokenBudget,
  type ModelReasoning,
  type ReasoningLevel,
} from "./agent-reasoning";
import { SITE_URL } from "./site";

/**
 * Shared chat contract for Numo, dictation, feedback, and integrations.
 * Callers use provider-independent fields, translated below. Add common options
 * here; reserve `extensions` for intentionally provider-specific capabilities,
 * such as the OpenRouter web plugin.
 */
export interface AiChatRequest {
  model: string;
  messages: unknown[];
  stream?: boolean;
  maxOutputTokens?: number;
  reasoning?: {
    /** Explicitly disable optional reasoning on OpenRouter; omission keeps model defaults. */
    enabled?: false;
    effort?: ReasoningLevel;
    /** Fixed budget when the provider knows how to express it. */
    maxTokens?: number;
  };
  tools?: unknown[];
  toolChoice?: unknown;
  temperature?: number;
  stop?: string | string[];
  responseFormat?: unknown;
  parallelToolCalls?: boolean;
  /** Options deliberately specific to the chosen endpoint. Never for a common field. */
  extensions?: Record<string, unknown>;
}

function positiveInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.trunc(value);
}

function isAdaptiveClaude(model: string): boolean {
  return (
    /^claude-(?:opus|sonnet|fable|mythos|haiku)-5(?:-|$)/i.test(model) ||
    /^claude-(?:opus|sonnet)-4-(?:[6-9]|\d{2,})(?:-|$)/i.test(model) ||
    /^claude-mythos-preview(?:-|$)/i.test(model)
  );
}

/** Claude 4.6: adaptive, but predates `xhigh` and still accepts sampling fields. */
function isClaude46(model: string): boolean {
  return /^claude-(?:opus|sonnet)-4-6(?:-|$)/i.test(model);
}

/**
 * Claude 4.7 and later return a 400 for any `temperature` below 1
 * ("`temperature` is deprecated for this model"), so the sampling field is
 * dropped on those families.
 */
function rejectsSamplingTemperature(model: string): boolean {
  return isAdaptiveClaude(model) && !isClaude46(model);
}

/**
 * Thinking takes its share of the output ceiling. A ceiling sized for the
 * visible answer would let a high effort consume it and end the round on
 * `max_tokens`; only generated tokens are billed, so the floor is free on
 * short answers.
 */
const ADAPTIVE_CLAUDE_MIN_OUTPUT_TOKENS = 16_000;

/** Families that take a manual `budget_tokens` (4.6 accepts it as a deprecated escape hatch). */
function isManualThinkingClaude(model: string): boolean {
  return /^claude-(?:opus|sonnet|haiku)-4-(?:5|6)(?:-|$)/i.test(model);
}

/**
 * Families that reject `thinking: {type: "disabled"}` with a 400. At "off"
 * they run at the cheapest effort instead. Sonnet 5.5 also supports
 * `between_tools` at effort `high` or below; this adapter does not use it.
 */
function isAlwaysThinkingClaude(model: string): boolean {
  return (
    /^claude-(?:fable|mythos)-5(?:-|$)/i.test(model) ||
    /^claude-(?:opus|sonnet)-5-5(?:-|$)/i.test(model) ||
    /^claude-mythos-preview(?:-|$)/i.test(model)
  );
}

/**
 * What the BYOK reasoning picker offers for an Anthropic model: Anthropic's
 * `/v1/models` publishes no effort list, so the levels follow the documented
 * per-family table. Adaptive families take `low` to `max` (no `xhigh` before
 * 4.7) and are `mandatory` when thinking cannot be disabled. Manual-budget
 * families (4.5) keep the generic levels, which map to a budget.
 * `undefined` = generic levels.
 */
export function anthropicModelReasoning(model: string): ModelReasoning | undefined {
  if (!isAdaptiveClaude(model)) return undefined;
  const efforts: ReasoningLevel[] = isClaude46(model)
    ? ["low", "medium", "high", "max"]
    : ["low", "medium", "high", "xhigh", "max"];
  return { efforts, mandatory: isAlwaysThinkingClaude(model) };
}

/** A level folded to what the family accepts (`minimal` → `low`, `xhigh` → `high` on 4.6). */
function anthropicEffort(model: string, level: ReasoningLevel): ReasoningLevel {
  const allowed = anthropicModelReasoning(model)?.efforts ?? [];
  return nearestReasoningLevel(level === "off" ? "low" : level, allowed);
}

function isGpt56(model: string): boolean {
  return /^gpt-5\.6(?:-|$)/i.test(model);
}

/**
 * Families that reject forced tool choice with a 400 on every request:
 * Claude Opus 5.5, Sonnet 5.5, Fable 5.1, and Mythos 5.1. Downgrade to `auto`
 * at the compatibility boundary to keep these requests usable.
 */
function rejectsForcedToolChoice(model: string): boolean {
  return (
    /^claude-(?:opus|sonnet)-5-5(?:-|$)/i.test(model) ||
    /^claude-(?:fable|mythos)-5-1(?:-|$)/i.test(model)
  );
}

function isForcedOpenAiToolChoice(value: unknown): boolean {
  if (value === "required") return true;
  if (typeof value !== "object" || value === null) return false;
  const choice = value as { type?: unknown; allowed_tools?: { mode?: unknown } };
  return choice.type === "function" ||
    (choice.type === "allowed_tools" && choice.allowed_tools?.mode === "required");
}

function normalizeProviderToolChoice(
  body: Record<string, unknown>,
  provider: AgentProviderId,
): void {
  if (
    provider === "anthropic" &&
    typeof body.model === "string" &&
    rejectsForcedToolChoice(body.model) &&
    isForcedOpenAiToolChoice(body.tool_choice)
  ) {
    body.tool_choice = "auto";
  }
}

/**
 * Final Anthropic adjustments once the body is assembled: drops the sampling
 * temperature recent families reject, drops a manual budget when the tool
 * choice is forced ("Thinking may not be enabled when tool_choice forces tool
 * use", 400), and lifts the ceiling when adaptive thinking runs.
 */
function normalizeAnthropicBody(
  body: Record<string, unknown>,
  provider: AgentProviderId,
): void {
  if (provider !== "anthropic" || typeof body.model !== "string") return;
  if (rejectsSamplingTemperature(body.model)) delete body.temperature;
  const thinking = (body.thinking as { type?: unknown } | undefined)?.type;
  if (thinking === "enabled" && isForcedOpenAiToolChoice(body.tool_choice)) {
    delete body.thinking;
  }
  if (thinking === "adaptive") {
    const ceiling = body.max_tokens;
    if (typeof ceiling !== "number" || ceiling < ADAPTIVE_CLAUDE_MIN_OUTPUT_TOKENS) {
      body.max_tokens = ADAPTIVE_CLAUDE_MIN_OUTPUT_TOKENS;
    }
  }
}

/**
 * Native Messages API reasoning (`lib/server/anthropic-messages.ts` carries
 * these fields as they are). Adaptive families get `thinking: adaptive` with a
 * readable summary for the reasoning feed, and the level as
 * `output_config.effort`; 4.5 families get a manual budget.
 */
function anthropicReasoningFields(params: {
  model: string;
  effort?: ReasoningLevel;
  fixedTokens?: number;
  maxOutputTokens?: number;
}): Record<string, unknown> {
  const { model } = params;
  if (params.effort === "off") {
    // Fable 5 / Mythos 5 / Mythos Preview and the Claude 5.5 families refuse
    // `thinking: {type: "disabled"}` (400): the cheapest effort is the
    // closest request they accept.
    if (isAlwaysThinkingClaude(model)) {
      return { output_config: { effort: anthropicEffort(model, "off") } };
    }
    return isAdaptiveClaude(model) || isManualThinkingClaude(model)
      ? { thinking: { type: "disabled" } }
      : {};
  }

  // A fixed budget keeps manual mode where the family still accepts one.
  const manual = isManualThinkingClaude(model) &&
    (params.fixedTokens !== undefined || !isAdaptiveClaude(model));
  if (!manual) {
    if (!isAdaptiveClaude(model) || !params.effort) return {};
    return {
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: anthropicEffort(model, params.effort) },
    };
  }

  const requested =
    params.fixedTokens ??
    (params.effort ? reasoningTokenBudget(params.effort) : undefined);
  if (requested === undefined) return {};
  const maxOutput = params.maxOutputTokens;
  if (maxOutput !== undefined && maxOutput <= 1024) return {};
  const budget = Math.max(
    1024,
    maxOutput !== undefined ? Math.min(requested, maxOutput - 1) : requested,
  );
  return { thinking: { type: "enabled", budget_tokens: budget } };
}

/**
 * OpenAI reasoning families. Only these accept `reasoning_effort`; sending it
 * to a chat model (gpt-4o, gpt-4.1) is a 400. GPT-5.1 and later accept
 * `"none"`, which really disables reasoning; GPT-5 and the o-series always
 * reason (GPT-5 also has `minimal`).
 */
function isOpenAiReasoningModel(model: string): boolean {
  return /^(?:o\d|gpt-5)(?:[-.]|$)/i.test(model);
}

function openAiModelReasoning(model: string): ModelReasoning | null {
  if (!isOpenAiReasoningModel(model)) return null;
  if (/^gpt-5\.\d/i.test(model)) return { efforts: ["low", "medium", "high"], mandatory: false };
  if (/^gpt-5(?:-|$)/i.test(model)) {
    return { efforts: ["minimal", "low", "medium", "high"], mandatory: true };
  }
  return { efforts: ["low", "medium", "high"], mandatory: true };
}

/**
 * Gemini thinking families on the OpenAI-compatible endpoint
 * (ai.google.dev/gemini-api/docs/openai): 2.5 Flash and Flash-Lite can stop
 * thinking with `"none"`; 2.5 Pro and Gemini 3 cannot; Gemini 3 Pro only takes
 * `low` and `high`. Earlier families and Gemma do not think.
 */
function geminiModelReasoning(model: string): ModelReasoning | null {
  if (/^gemini-2\.5-flash/i.test(model)) return { efforts: ["low", "medium", "high"], mandatory: false };
  if (/^gemini-2\.5-pro/i.test(model)) return { efforts: ["low", "medium", "high"], mandatory: true };
  if (/^gemini-3(?:\.\d+)?-pro/i.test(model)) return { efforts: ["low", "high"], mandatory: true };
  if (/^gemini-3(?:[-.]|$)/i.test(model)) return { efforts: ["low", "medium", "high"], mandatory: true };
  return null;
}

/**
 * The reasoning levels a direct (non-OpenRouter) provider really honors for a
 * model, for its picker and its translation alike. `null` = no reasoning
 * control reaches the model: it does not reason, or the endpoint has no
 * reasoning field (OpenCode gateways, generic and local servers).
 * `undefined` = no rule, the generic levels apply (OpenRouter publishes its
 * own per model; manual-budget Claude models map every level to a budget).
 */
export function nativeModelReasoning(
  provider: AgentProviderId,
  model: string,
): ModelReasoning | null | undefined {
  if (provider === "openrouter") return undefined;
  if (provider === "anthropic") return anthropicModelReasoning(model);
  if (provider === "openai") return openAiModelReasoning(model);
  if (provider === "google") return geminiModelReasoning(model);
  return getAgentProvider(provider)?.requestProfile.reasoningField ? undefined : null;
}

/**
 * A model's reasoning for the picker and the server alike: its catalog entry
 * when it has one, otherwise the provider rule — local and generic endpoints
 * have no listable catalog, and their models must not show inert levels.
 */
export function catalogModelReasoning(
  provider: AgentProviderId,
  modelId: string | null | undefined,
  entry?: { reasoning?: ModelReasoning | null },
): ModelReasoning | null | undefined {
  if (entry && entry.reasoning !== undefined) return entry.reasoning;
  return modelId ? nativeModelReasoning(provider, modelId) : undefined;
}

/** `reasoning_effort` for OpenAI and Gemini, folded to what the model takes. */
function compatEffortFields(
  provider: "openai" | "google",
  model: string,
  level: ReasoningLevel,
): Record<string, unknown> {
  const reasoning = provider === "openai" ? openAiModelReasoning(model) : geminiModelReasoning(model);
  if (!reasoning) return {};
  if (level === "off") {
    // A mandatory model has no "off": the server already lowers it, and the
    // model's own default is the safe fallback for any other caller.
    return reasoning.mandatory ? {} : { reasoning_effort: "none" };
  }
  return { reasoning_effort: nearestReasoningLevel(level, reasoning.efforts) };
}

function providerReasoningFields(
  provider: AgentProviderId,
  model: string,
  reasoning: AiChatRequest["reasoning"] | undefined,
  maxOutputTokens: number | undefined,
  hasFunctionTools: boolean,
): Record<string, unknown> {
  // GPT-5.6 knows how to call functions via Chat Completions, but not at the same time
  // time than an effort of reasoning. Responses is the full path; so much
  // that this transport remains Chat Completions, `none` is the documented contract.
  if (provider === "openai" && hasFunctionTools && isGpt56(model)) {
    return { reasoning_effort: "none" };
  }
  if (provider === "openrouter" && reasoning?.enabled === false) {
    return { reasoning: { enabled: false } };
  }
  if (
    reasoning === undefined ||
    (reasoning.effort === undefined && reasoning.maxTokens === undefined)
  ) {
    return {};
  }
  const fixedTokens = positiveInt(reasoning?.maxTokens);
  if ((provider === "openai" || provider === "google") && reasoning.effort) {
    return compatEffortFields(provider, model, reasoning.effort);
  }
  // "Off" really disables optional reasoning: omitting the field ran the
  // model at its default effort (MIN-826). A mandatory model answers 400,
  // which `repairRejectedAiChatBody` replays without the field.
  if (provider === "openrouter" && reasoning.effort === "off") {
    return { reasoning: { enabled: false } };
  }
  if (provider === "anthropic") {
    return anthropicReasoningFields({
      model,
      effort: reasoning.effort,
      fixedTokens,
      maxOutputTokens,
    });
  }
  if (fixedTokens !== undefined && provider === "openrouter") {
    return { reasoning: { max_tokens: fixedTokens, exclude: false } };
  }
  return reasoning.effort
    ? reasoningRequestFields(reasoning.effort, provider)
    : {};
}

/**
 * Gemini 3 returns a `thought_signature` in each tool call's `extra_content`,
 * and requires it back on the next round. The loop keeps it in history; any
 * other provider receives the tool calls without that Gemini-only field.
 */
function withoutGeminiToolExtras(messages: unknown[]): unknown[] {
  return messages.map((message) => {
    const calls = (message as { tool_calls?: unknown } | null)?.tool_calls;
    if (!Array.isArray(calls) || !calls.some((call) => call && typeof call === "object" && "extra_content" in call)) {
      return message;
    }
    return {
      ...(message as Record<string, unknown>),
      tool_calls: calls.map((call) => {
        if (!call || typeof call !== "object" || !("extra_content" in call)) return call;
        const { extra_content: _extra, ...rest } = call as Record<string, unknown>;
        return rest;
      }),
    };
  });
}

/** Translates the minddy contract to the exact JSON of the provider. Pure function. */
export function translateAiChatRequest(
  request: AiChatRequest,
  provider: AgentProviderId,
): Record<string, unknown> {
  const profile = getAgentProvider(provider)?.requestProfile;
  if (!profile) throw new Error(`Unknown AI provider: ${provider}`);

  const body: Record<string, unknown> = {
    model: request.model,
    messages: provider === "google" ? request.messages : withoutGeminiToolExtras(request.messages),
    ...(request.stream !== undefined ? { stream: request.stream } : {}),
    ...(request.tools ? { tools: request.tools } : {}),
    ...(request.toolChoice !== undefined ? { tool_choice: request.toolChoice } : {}),
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    ...(request.stop !== undefined ? { stop: request.stop } : {}),
    ...(request.responseFormat !== undefined ? { response_format: request.responseFormat } : {}),
    ...(request.parallelToolCalls !== undefined
      ? { parallel_tool_calls: request.parallelToolCalls }
      : {}),
    ...request.extensions,
  };

  const maxOutputTokens =
    positiveInt(request.maxOutputTokens) ?? profile.defaultMaxOutputTokens;
  if (maxOutputTokens !== undefined) {
    body[profile.outputTokenField] = maxOutputTokens;
  }

  Object.assign(
    body,
    providerReasoningFields(
      provider,
      request.model,
      request.reasoning,
      maxOutputTokens,
      Boolean(request.tools?.length),
    ),
  );

  normalizeProviderToolChoice(body, provider);
  normalizeAnthropicBody(body, provider);

  if (profile.usageAccounting) body.usage = { include: true };
  if (request.stream && profile.streamUsage) {
    body.stream_options = { include_usage: true };
  }
  return body;
}

/** Provider-specific headers; authentication remains in transport. */
export function aiChatProviderHeaders(
  provider: AgentProviderId,
  title: string,
): Record<string, string> {
  const profile = getAgentProvider(provider)?.requestProfile;
  if (!profile) throw new Error(`Unknown AI provider: ${provider}`);
  return profile.attribution
    ? { "HTTP-Referer": SITE_URL, "X-Title": title }
    : {};
}

/**
 * Produces the same body with the other ceiling alias, only when the 400
 * explicitly designates the one that was sent as unsupported.
 */
export function alternateOutputTokenBody(
  bodyText: string,
  errorText: string,
): string | null {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    return null;
  }
  const current = Object.hasOwn(body, "max_completion_tokens")
    ? "max_completion_tokens"
    : Object.hasOwn(body, "max_tokens")
      ? "max_tokens"
      : null;
  if (
    current === null ||
    !new RegExp(
      `(?:unsupported|not supported)[^\\n]{0,160}${current}|${current}[^\\n]{0,160}(?:unsupported|not supported)`,
      "i",
    ).test(errorText)
  ) {
    return null;
  }

  const alternate = current === "max_tokens" ? "max_completion_tokens" : "max_tokens";
  body[alternate] = body[current];
  delete body[current];
  return JSON.stringify(body);
}

/**
 * Repairs the only compatibility 400s that we know how to replay without risk:
 * a denied cap alias, a reasoning disable refused by a model that must reason,
 * or GPT-5.6 Chat Completions that denies the couple function tools +
 * reasoning. Any other error keeps the initial body.
 */
export function repairRejectedAiChatBody(
  bodyText: string,
  errorText: string,
): string | null {
  const outputAliasRepair = alternateOutputTokenBody(bodyText, errorText);
  if (outputAliasRepair !== null) return outputAliasRepair;

  // "Off" sent to a model whose catalog entry did not say it must reason:
  // replay at the model's own default rather than failing the turn.
  if (/reasoning is mandatory|(?:reasoning|thinking)[^\n]{0,80}cannot be (?:turned off|disabled)/i.test(errorText)) {
    try {
      const body = JSON.parse(bodyText) as Record<string, unknown>;
      const reasoning = body.reasoning as { enabled?: unknown } | undefined;
      if (reasoning?.enabled === false || body.reasoning_effort === "none") {
        delete body.reasoning;
        delete body.reasoning_effort;
        return JSON.stringify(body);
      }
    } catch {
      return null;
    }
  }

  if (
    !/function tools[^\n]{0,160}reasoning_effort[^\n]{0,160}(?:not supported|unsupported)/i.test(
      errorText,
    )
  ) {
    return null;
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!Array.isArray(body.tools) || body.tools.length === 0) return null;
  body.reasoning_effort = "none";
  return JSON.stringify(body);
}

/**
 * Compatibility boundary for a third-party client (opencode) that already manufactures
 * of OpenAI JSON. The provider aliases are absorbed then reissued by the same
 * translator that all surfaces.
 */
export function translateLegacyAiChatBody(
  input: Record<string, unknown>,
  provider: AgentProviderId,
  reasoningEffort?: ReasoningLevel,
): Record<string, unknown> {
  const profile = getAgentProvider(provider)?.requestProfile;
  if (!profile) throw new Error(`Unknown AI provider: ${provider}`);
  const body = { ...input };

  const maxOutputTokens =
    positiveInt(body.max_completion_tokens) ??
    positiveInt(body.max_tokens) ??
    profile.defaultMaxOutputTokens;
  delete body.max_tokens;
  delete body.max_completion_tokens;
  if (maxOutputTokens !== undefined) body[profile.outputTokenField] = maxOutputTokens;

  delete body.reasoning;
  delete body.reasoning_effort;
  delete body.thinking;
  if (reasoningEffort) {
    Object.assign(
      body,
      providerReasoningFields(
        provider,
        typeof body.model === "string" ? body.model : "",
        { effort: reasoningEffort },
        maxOutputTokens,
        Array.isArray(body.tools) && body.tools.length > 0,
      ),
    );
  }

  normalizeProviderToolChoice(body, provider);
  normalizeAnthropicBody(body, provider);

  if (profile.usageAccounting && body.usage === undefined) body.usage = { include: true };
  // This border is only used by the opencode client, which streams all its rounds.
  // However, some versions omit `stream: true` from the intermediate body.
  if (profile.streamUsage && body.stream_options === undefined) {
    body.stream_options = { include_usage: true };
  }
  if (!profile.usageAccounting) delete body.usage;
  if (!profile.streamUsage) delete body.stream_options;
  return body;
}
