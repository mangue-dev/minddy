import {
  getAgentProvider,
  type AgentProviderId,
} from "./agent-providers";
import {
  nearestReasoningLevel,
  reasoningRequestFields,
  reasoningTokenBudget,
  type ReasoningLevel,
} from "./agent-reasoning";
import {
  anthropicModelReasoning,
  geminiModelReasoning,
  isAdaptiveClaude,
  isAlwaysThinkingClaude,
  isClaude46,
  isManualThinkingClaude,
  openAiModelReasoning,
} from "./model-reasoning-rules";
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
