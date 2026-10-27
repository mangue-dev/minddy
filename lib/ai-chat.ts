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

/** Claude 4.6 knows `max` but predates the `xhigh` effort level. */
function isClaude46(model: string): boolean {
  return /^claude-(?:opus|sonnet)-4-6(?:-|$)/i.test(model);
}

/**
 * Claude 4.7 and later return a 400 for any `temperature` below 1 through the
 * compatibility layer, so the sampling field is dropped on those families.
 */
function rejectsSamplingTemperature(model: string): boolean {
  return isAdaptiveClaude(model) && !isClaude46(model);
}

/**
 * Adaptive thinking is billed inside the output ceiling and the compatibility
 * layer never streams it. A ceiling sized for the visible answer alone lets
 * the hidden thinking consume it, and the round ends on `length` without a
 * word. Only the tokens actually generated are billed, so a generous floor
 * costs nothing on short answers.
 */
const ADAPTIVE_CLAUDE_MIN_OUTPUT_TOKENS = 16_000;

function isManualThinkingClaude(model: string): boolean {
  return /^claude-(?:opus|sonnet|haiku)-4-(?:5|6)(?:-|$)/i.test(model);
}

/**
 * Families that reject `thinking: {type: "disabled"}` with a 400. At "off",
 * omit the field and retain their default thinking behavior.
 * Sonnet 5.5 also supports `between_tools` at effort `high` or below;
 * this adapter conservatively preserves the family's default at "off".
 */
function isAlwaysThinkingClaude(model: string): boolean {
  return (
    /^claude-(?:fable|mythos)-5(?:-|$)/i.test(model) ||
    /^claude-(?:opus|sonnet)-5-5(?:-|$)/i.test(model) ||
    /^claude-mythos-preview(?:-|$)/i.test(model)
  );
}

/**
 * What an Anthropic model accepts as effort, for the BYOK picker: the
 * compatibility layer publishes no capability index, so the levels come from
 * the documented per-family table. `undefined` leaves the picker on its
 * generic levels (manual-budget and unknown families).
 */
export function anthropicModelReasoning(model: string): ModelReasoning | undefined {
  if (!isAdaptiveClaude(model)) return undefined;
  const efforts: ReasoningLevel[] = isClaude46(model)
    ? ["low", "medium", "high", "max"]
    : ["low", "medium", "high", "xhigh", "max"];
  return { efforts, mandatory: isAlwaysThinkingClaude(model) };
}

/**
 * The effort sent as `output_config.effort`. "off" on a family that cannot
 * disable thinking becomes the cheapest effort, which is what the selector
 * shows for those models.
 */
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
 * Adjusts a translated Anthropic body to the thinking that will actually run:
 * removes the sampling temperature the recent families reject, and lifts the
 * output ceiling whenever adaptive thinking is on (explicitly, or by default
 * on the Claude 5 families).
 */
function normalizeAnthropicThinkingBody(
  body: Record<string, unknown>,
  provider: AgentProviderId,
  outputTokenField: string,
): void {
  if (provider !== "anthropic" || typeof body.model !== "string") return;
  const model = body.model;
  if (rejectsSamplingTemperature(model)) delete body.temperature;
  const thinking = (body.thinking as { type?: unknown } | undefined)?.type;
  const thinks = isAdaptiveClaude(model) && thinking !== "disabled" &&
    (thinking === "adaptive" || /^claude-[a-z]+-5(?:-|$)/i.test(model));
  const ceiling = body[outputTokenField];
  if (thinks && typeof ceiling === "number" && ceiling < ADAPTIVE_CLAUDE_MIN_OUTPUT_TOKENS) {
    body[outputTokenField] = ADAPTIVE_CLAUDE_MIN_OUTPUT_TOKENS;
  }
}

function anthropicReasoningFields(params: {
  model: string;
  effort?: ReasoningLevel;
  fixedTokens?: number;
  maxOutputTokens?: number;
}): Record<string, unknown> {
  if (params.effort === "off") {
    // Fable 5 / Mythos 5 / Mythos Preview and the Claude 5.5 families refuse
    // `thinking: {type: "disabled"}` (400): reasoning cannot be turned off on
    // these families, so the cheapest effort is the closest honest request.
    if (isAlwaysThinkingClaude(params.model)) {
      return { output_config: { effort: anthropicEffort(params.model, "off") } };
    }
    return isAdaptiveClaude(params.model) || isManualThinkingClaude(params.model)
      ? { thinking: { type: "disabled" } }
      : {};
  }

  // An explicit budget keeps manual mode on families who accept it.
  // Without a fixed budget, the current recommended path is adaptive mode.
  // The compatibility layer ignores `reasoning_effort`: adaptive families
  // only receive the chosen depth through `output_config.effort`.
  if (params.fixedTokens === undefined && isAdaptiveClaude(params.model)) {
    return {
      thinking: { type: "adaptive" },
      ...(params.effort
        ? { output_config: { effort: anthropicEffort(params.model, params.effort) } }
        : {}),
    };
  }
  if (!isManualThinkingClaude(params.model)) return {};

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

/** Translates the minddy contract to the exact JSON of the provider. Pure function. */
export function translateAiChatRequest(
  request: AiChatRequest,
  provider: AgentProviderId,
): Record<string, unknown> {
  const profile = getAgentProvider(provider)?.requestProfile;
  if (!profile) throw new Error(`Unknown AI provider: ${provider}`);

  const body: Record<string, unknown> = {
    model: request.model,
    messages: request.messages,
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
  normalizeAnthropicThinkingBody(body, provider, profile.outputTokenField);

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
 * a denied cap alias, a rejected Anthropic `output_config`, or GPT-5.6 Chat
 * Completions that denies the couple function tools + reasoning. Any other
 * error keeps the initial body.
 */
export function repairRejectedAiChatBody(
  bodyText: string,
  errorText: string,
): string | null {
  const outputAliasRepair = alternateOutputTokenBody(bodyText, errorText);
  if (outputAliasRepair !== null) return outputAliasRepair;

  // The Anthropic compatibility layer does not document `output_config`. If
  // it ever names the field in a 400, the turn replays at the model's default
  // effort rather than failing.
  if (/output_config/i.test(errorText)) {
    try {
      const body = JSON.parse(bodyText) as Record<string, unknown>;
      if (Object.hasOwn(body, "output_config")) {
        delete body.output_config;
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
  delete body.output_config;
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
  normalizeAnthropicThinkingBody(body, provider, profile.outputTokenField);

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
