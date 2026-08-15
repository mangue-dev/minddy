import {
  getAgentProvider,
  type AgentProviderId,
} from "./agent-providers";
import {
  reasoningRequestFields,
  reasoningTokenBudget,
  type ReasoningLevel,
} from "./agent-reasoning";

/**
 * Contrat chat interne de minddy.
 *
 * Les surfaces expriment une intention (`maxOutputTokens`, `reasoning`) et ne
 * connaissent jamais les noms wire d'un fournisseur. Toute nouvelle option
 * commune doit entrer ici puis être traduite ci-dessous ; `extensions` reste
 * réservé aux capacités volontairement non portables (plugin web OpenRouter,
 * par exemple).
 */
export interface AiChatRequest {
  model: string;
  messages: unknown[];
  stream?: boolean;
  maxOutputTokens?: number;
  reasoning?: {
    effort?: ReasoningLevel;
    /** Budget fixe quand le provider sait l'exprimer. */
    maxTokens?: number;
  };
  tools?: unknown[];
  toolChoice?: unknown;
  temperature?: number;
  stop?: string | string[];
  responseFormat?: unknown;
  parallelToolCalls?: boolean;
  /** Options sciemment propres à l'endpoint choisi. Jamais pour un champ commun. */
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

function anthropicReasoningFields(params: {
  model: string;
  effort?: ReasoningLevel;
  fixedTokens?: number;
  maxOutputTokens?: number;
}): Record<string, unknown> {
  if (params.effort === "off") {
    return isAdaptiveClaude(params.model) || isManualThinkingClaude(params.model)
      ? { thinking: { type: "disabled" } }
      : {};
  }

  // Un budget explicite garde le mode manuel sur les familles qui l'acceptent.
  // Sans budget fixe, la voie actuelle recommandée est le mode adaptatif.
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
): Record<string, unknown> {
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

/** Traduit le contrat minddy vers le JSON exact du provider. Fonction pure. */
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
    ...(request.extensions ?? {}),
  };

  const maxOutputTokens =
    positiveInt(request.maxOutputTokens) ?? profile.defaultMaxOutputTokens;
  if (maxOutputTokens !== undefined) {
    body[profile.outputTokenField] = maxOutputTokens;
  }

  Object.assign(
    body,
    providerReasoningFields(provider, request.model, request.reasoning, maxOutputTokens),
  );

  if (profile.usageAccounting) body.usage = { include: true };
  if (request.stream && profile.streamUsage) {
    body.stream_options = { include_usage: true };
  }
  return body;
}

/** En-têtes propres au provider ; l'authentification reste au transport. */
export function aiChatProviderHeaders(
  provider: AgentProviderId,
  title: string,
): Record<string, string> {
  const profile = getAgentProvider(provider)?.requestProfile;
  if (!profile) throw new Error(`Unknown AI provider: ${provider}`);
  return {
    ...(profile.attribution
      ? { "HTTP-Referer": "https://minddy.app", "X-Title": title }
      : {}),
  };
}

/**
 * Produit le même corps avec l'autre alias de plafond, uniquement quand le 400
 * désigne explicitement celui qui a été envoyé comme non supporté.
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
 * Frontière de compatibilité pour un client tiers (opencode) qui fabrique déjà
 * du JSON OpenAI. Les alias provider sont absorbés puis réémis par le même
 * traducteur que toutes les surfaces.
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
      ),
    );
  }

  if (profile.usageAccounting && body.usage === undefined) body.usage = { include: true };
  // Cette frontière ne sert qu'au client opencode, qui streame tous ses rounds.
  // Certaines versions omettent pourtant `stream: true` du corps intermédiaire.
  if (profile.streamUsage && body.stream_options === undefined) {
    body.stream_options = { include_usage: true };
  }
  if (!profile.usageAccounting) delete body.usage;
  if (!profile.streamUsage) delete body.stream_options;
  return body;
}
