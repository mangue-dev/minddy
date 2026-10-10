import "server-only";

import {
  recordAiUsage,
  newRunId,
  parseOpenRouterUsage,
  type AiFeature,
  type AiUsageBillTo,
  type OpenRouterUsage,
} from "@/lib/server/ai-usage";
import { getAgentProvider } from "@/lib/agent-providers";
import type { ReasoningLevel } from "@/lib/agent-reasoning";
import type { AiSurface, ByokModelKey } from "@/lib/ai-surfaces";
import {
  fetchAiChat,
  resolveAiRuntime,
  type ResolvedAiRuntime,
} from "@/lib/server/ai-runtime";
import { isManagedAiEnabled } from "@/lib/managed-services";
import { getServiceClient } from "@/lib/supabase-service";
import { getOpenRouterModelInfo } from "@/lib/server/agent/openrouter-index";

/**
 * OpenRouter call to forced structured output (tools + tool_choice) — the
 * contract shared by the feedback AI passes (merge: analyze.ts, classification:
 * classify.ts) and modeled on smart-assign. Parse the unique tool call; returns
 * `null` at the slightest failure (absent key, non-ok HTTP, timeout, invalid JSON) so that
 * the calling pass can retry without ever blocking the board.
 *
 * Cost tracking: passing `record` records the usage (a call = a run
 * of a single call) in `ai_usage`. Best-effort, never affect return.
 */

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * A refusal from OpenRouter, distinguished from other failures (timeout, crooked JSON)
 * because it is the ONLY one that we replay: a model carrying a shortcut of
 * routing (`:nitro`, `:floor`, `:exacto`, MIN-263) for which no provider
 * satisfies the requested order is refused at the time of the request, before the
 * first token. Replaying a timeout would only double the wait for
 * someone who is already waiting in front of their screen.
 */
/** Cost tracking context for a forced call (feature + imputation). */
export interface ForcedToolCallRecord {
  feature: AiFeature;
  /** Stable ledger run id when this call belongs to a larger reserved action. */
  runId?: string;
  /** Stable call position when the run contains other generations. */
  seq?: number;
  /** Who pays — said by the caller, never deducted from the project (MIN-131). */
  billTo: AiUsageBillTo;
  projectId?: string | null;
  /** Numo conversation to which to attach the expense, when there is one. */
  conversationId?: string | null;
  numoTurnId?: string | null;
  routineId?: string | null;
}

/** The cached catalog may refresh, but must not extend a creation's deadline. */
async function canDisableReasoning(model: string, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return false;
  return new Promise(resolve => {
    const finish = (optional: boolean) => {
      signal.removeEventListener("abort", aborted);
      resolve(optional);
    };
    const aborted = () => finish(false);
    signal.addEventListener("abort", aborted, { once: true });
    void getOpenRouterModelInfo(model).then(
      info => finish(info?.reasoning?.mandatory === false),
      () => finish(false),
    );
  });
}

export async function forcedToolCall(
  model: string,
  systemPrompt: string,
  userMessage: string,
  toolName: string,
  parameters: Record<string, unknown>,
  options?: {
    xTitle?: string;
    logPrefix?: string;
    record?: ForcedToolCallRecord;
    /** Actual type of the call: allows you to resolve its BYOK model. */
    modelKey?: ByokModelKey;
    /** Special case where the same model belongs to another surface (feedback voice). */
    surface?: AiSurface;
    /** Default: 1024 — enough to cover a verdict or title. Note for
 * outputs that grow with the input (a correspondence plan
 * carries one line per column of the file). */
    maxTokens?: number;
    /**
 * Default: 45 s — the measurement of a verdict or a matching plan.
 * Goes WITH `maxTokens`: an output that is authorized to make thousands of
 * tokens takes tens of seconds to write, and cut it to 45 s
 * throws the entire call after paying for it. Raise both together, and
 * hold the `maxDuration` from the road above.
 */
    timeoutMs?: number;
    /** Cancel auxiliary work with the execution that requested it. */
    signal?: AbortSignal;
    /**
 * Reasoning effort to request, when the provider knows how to express one.
 * Absent = nothing is sent, and the model applies its family default — which
 * on a mandatory-reasoning model can be its MOST expensive level, counted
 * inside `maxTokens` and able to eat the whole budget before the tool call
 * is emitted (MIN-594).
 */
    reasoning?: ReasoningLevel;
    /** Disable reasoning only when OpenRouter metadata explicitly marks it optional. */
    preferNonReasoning?: boolean;
  }
): Promise<Record<string, unknown> | null> {
  if (options?.signal?.aborted) return null;
  const logPrefix = options?.logPrefix ?? "[feedback-llm]";

  const billedUserId = await (async (): Promise<string | null> => {
    const billTo = options?.record?.billTo;
    if (!billTo) return null;
    if ("userId" in billTo) return billTo.userId || null;
    if ("projectOwner" in billTo) {
      const { data } = await getServiceClient()
        .from("projects")
        .select("owner_id")
        .eq("id", billTo.projectOwner)
        .maybeSingle();
      return (data as { owner_id?: string } | null)?.owner_id ?? null;
    }
    return null;
  })();

  let runtime: ResolvedAiRuntime | null = null;
  if (billedUserId && options?.modelKey) {
    runtime = await resolveAiRuntime({
      userId: billedUserId,
      modelKey: options.modelKey,
      surface: options.surface,
    }).catch(() => null);
  }
  const apiKey = runtime?.apiKey ?? (isManagedAiEnabled() ? process.env.OPENROUTER_API_KEY : undefined);
  if (!apiKey) return null;
  const provider = runtime?.provider ?? "openrouter";
  const resolvedModel = runtime?.model ?? model;
  const effectiveRuntime: ResolvedAiRuntime =
    runtime ?? {
      apiKey,
      mode: "platform",
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      model: resolvedModel,
      requestProfile: getAgentProvider("openrouter")!.requestProfile,
    };

  const signal = options?.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(options?.timeoutMs ?? 45_000)])
    : AbortSignal.timeout(options?.timeoutMs ?? 45_000);
  const logRequestFailure = () => {
    if (options?.signal?.aborted) return;
    console.error(`${logPrefix} LLM call failed: ${signal.aborted ? "request_timeout" : "request_failed"}`);
  };

  try {
    const disableReasoning = options?.preferNonReasoning && provider === "openrouter"
      ? await canDisableReasoning(resolvedModel, signal)
      : false;
    if (signal.aborted) {
      logRequestFailure();
      return null;
    }
    const call = await fetchAiChat(
      effectiveRuntime,
      resolvedModel,
      (attemptModel) => ({
        model: attemptModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: toolName,
              description: "Mandatory structured output — you must always call it.",
              parameters,
            },
          },
        ],
        toolChoice: { type: "function", function: { name: toolName } },
        maxOutputTokens: options?.maxTokens ?? 1024,
        ...(disableReasoning
          ? { reasoning: { enabled: false as const } }
          : options?.reasoning ? { reasoning: { effort: options.reasoning } } : {}),
      }),
      options?.xTitle ?? "Feedback (minddy)",
      logPrefix,
      { signal },
    );
    const response = call.response;
    if (!response.ok) {
      console.error(`${logPrefix} LLM call failed: provider_http_${response.status}`);
      return null;
    }
    let data: {
      choices?: {
        finish_reason?: string;
        message?: {
          tool_calls?: { function?: { name?: string; arguments?: string } }[];
        };
      }[];
      id?: string;
      model?: string;
      usage?: OpenRouterUsage;
    };
    try {
      data = await response.json();
    } catch {
      if (options?.signal?.aborted) return null;
      if (signal.aborted) logRequestFailure();
      else console.error(`${logPrefix} LLM call failed: response_json_invalid`);
      return null;
    }
    if (options?.record) {
      const u = parseOpenRouterUsage(data.usage);
      await recordAiUsage({
        runId: options.record.runId ?? newRunId(),
        seq: options.record.seq,
        feature: options.record.feature,
        provider,
        keyMode: runtime?.mode ?? "platform",
        model: data.model ?? call.model,
        generationId: data.id ?? null,
        promptTokens: u.promptTokens,
        completionTokens: u.completionTokens,
        totalTokens: u.totalTokens,
        cost: u.cost,
        billTo: options.record.billTo,
        projectId: options.record.projectId ?? null,
        conversationId: options.record.conversationId ?? null,
        numoTurnId: options.record.numoTurnId ?? null,
        routineId: options.record.routineId ?? null,
      });
    }
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0]?.function;
    if (toolCall?.name !== toolName) {
      console.error(`${logPrefix} LLM call failed: ${data.choices?.[0]?.finish_reason === "length"
        ? "output_truncated" : "expected_tool_missing"}`);
      return null;
    }
    try {
      return JSON.parse(toolCall.arguments || "{}") as Record<string, unknown>;
    } catch {
      console.error(`${logPrefix} LLM call failed: tool_arguments_invalid`);
      return null;
    }
  } catch {
    logRequestFailure();
    return null;
  }
}
