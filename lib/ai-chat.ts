import {
  getAgentProvider,
  type AgentProviderId,
} from "./agent-providers";
import {
  reasoningRequestFields,
  reasoningTokenBudget,
  type ReasoningLevel,
} from "./agent-reasoning";
import { SITE_URL } from "./site";

/**
 * Contrat chat interne de minddy.
 *
 * Surfaces express an intention (`maxOutputTokens`, `reasoning`) and do not
 * never know the wire names of a supplier. Brand new option
 * commune must be entered here and then translated below; `extensions` remains
 * reserved for intentionally non-portable capabilities (OpenRouter web plugin,
 * par exemple).
 */
export interface AiChatRequest {
  model: string;
  messages: unknown[];
  stream?: boolean;
  maxOutputTokens?: number;
  reasoning?: {
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
    /^claude-(?:opus|sonnet|fable|mythos)-5(?:-|$)/i.test(model) ||
    /^claude-(?:opus|sonnet)-4-(?:[6-9]|\d{2,})(?:-|$)/i.test(model) ||
    /^claude-mythos-preview(?:-|$)/i.test(model)
  );
}

function isManualThinkingClaude(model: string): boolean {
  return /^claude-(?:opus|sonnet|haiku)-4-(?:5|6)(?:-|$)/i.test(model);
}

/**
 * Families where reasoning CANNOT be cut: `thinking: {type:
 * "disabled"}` returns to 400 (Fable 5, Mythos 5, Mythos Preview). The mode
 * “off” is not expressible there; we then do not send any field, which
 * lets the family default (thinking, anyway) apply.
 */
function isAlwaysThinkingClaude(model: string): boolean {
  return (
    /^claude-(?:fable|mythos)-5(?:-|$)/i.test(model) ||
    /^claude-mythos-preview(?:-|$)/i.test(model)
  );
}

function isGpt56(model: string): boolean {
  return /^gpt-5\.6(?:-|$)/i.test(model);
}

function anthropicReasoningFields(params: {
  model: string;
  effort?: ReasoningLevel;
  fixedTokens?: number;
  maxOutputTokens?: number;
}): Record<string, unknown> {
  if (params.effort === "off") {
    // Fable 5 / Mythos 5 / Mythos Preview refusent `thinking: {type: "disabled"}`
    // (400): reasoning is inexhaustible on these families, we therefore do not pose
    // no field — the model falls back on its default (thinking).
    if (isAlwaysThinkingClaude(params.model)) return {};
    return isAdaptiveClaude(params.model) || isManualThinkingClaude(params.model)
      ? { thinking: { type: "disabled" } }
      : {};
  }

  // An explicit budget keeps manual mode on families who accept it.
  // Without a fixed budget, the current recommended path is adaptive mode.
  if (params.fixedTokens === undefined && isAdaptiveClaude(params.model)) {
    return { thinking: { type: "adaptive" } };
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
 * Repairs the only two compatibility 400s that we know how to replay without risk:
 * a denied cap alias, or GPT-5.6 Chat Completions that denies the couple
 * function tools + reasoning. Any other error keeps the initial body.
 */
export function repairRejectedAiChatBody(
  bodyText: string,
  errorText: string,
): string | null {
  const outputAliasRepair = alternateOutputTokenBody(bodyText, errorText);
  if (outputAliasRepair !== null) return outputAliasRepair;

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
