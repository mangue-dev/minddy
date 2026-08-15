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
import type { AiSurface, ByokModelKey } from "@/lib/ai-surfaces";
import {
  fetchAiChat,
  resolveAiRuntime,
  type ResolvedAiRuntime,
} from "@/lib/server/ai-runtime";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * Appel OpenRouter à sortie structurée forcée (tools + tool_choice) — le contrat
 * partagé par les passes IA du feedback (merge : analyze.ts, classification :
 * classify.ts) et calqué sur smart-assign. Parse l'unique tool call ; retourne
 * `null` au moindre échec (clé absente, HTTP non-ok, timeout, JSON invalide) pour
 * que la passe appelante puisse retry sans jamais bloquer le board.
 *
 * Suivi des coûts : passer `record` fait enregistrer l'usage (un appel = un run
 * d'un seul appel) dans `ai_usage`. Best-effort, n'affecte jamais le retour.
 */

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Un refus d'OpenRouter, distingué des autres échecs (timeout, JSON de travers)
 * parce que c'est le SEUL qu'on rejoue : un modèle portant un raccourci de
 * routage (`:nitro`, `:floor`, `:exacto`, MIN-263) dont aucun provider ne
 * satisfait l'ordre demandé se voit refuser au moment de la requête, avant le
 * premier token. Rejouer un timeout, lui, ne ferait que doubler l'attente de
 * quelqu'un qui patiente déjà devant son écran.
 */
/** Contexte de suivi de coût pour un appel forcé (feature + imputation). */
export interface ForcedToolCallRecord {
  feature: AiFeature;
  /** Qui paye — dit par l'appelant, jamais déduit du projet (MIN-131). */
  billTo: AiUsageBillTo;
  projectId?: string | null;
  /** Conversation Numo à laquelle rattacher la dépense, quand il y en a une. */
  conversationId?: string | null;
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
    /** Type réel de l'appel : permet de résoudre son modèle BYOK. */
    modelKey?: ByokModelKey;
    /** Cas particulier où le même modèle appartient à une autre surface (feedback voice). */
    surface?: AiSurface;
    /** Défaut : 1024 — de quoi couvrir un verdict ou un titre. À relever pour
     *  les sorties qui grandissent avec l'entrée (un plan de correspondance
     *  porte une ligne par colonne du fichier). */
    maxTokens?: number;
    /**
     * Défaut : 45 s — la mesure d'un verdict ou d'un plan de correspondance.
     * Va AVEC `maxTokens` : une sortie qu'on autorise à faire des milliers de
     * tokens met des dizaines de secondes à s'écrire, et la couper à 45 s
     * jette l'appel entier après l'avoir payé. Relever les deux ensemble, et
     * tenir le `maxDuration` de la route au-dessus.
     */
    timeoutMs?: number;
  }
): Promise<Record<string, unknown> | null> {
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
  const apiKey = runtime?.apiKey ?? process.env.OPENROUTER_API_KEY;
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

  try {
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
      }),
      options?.xTitle ?? "Feedback (minddy)",
      logPrefix,
      { signal: AbortSignal.timeout(options?.timeoutMs ?? 45_000) },
    );
    const response = call.response;
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM error (${response.status}): ${errorText.slice(0, 200)}`);
    }
    const data = (await response.json()) as {
      choices?: {
        message?: {
          tool_calls?: { function?: { name?: string; arguments?: string } }[];
        };
      }[];
      id?: string;
      model?: string;
      usage?: OpenRouterUsage;
    };
    if (options?.record) {
      const u = parseOpenRouterUsage(data.usage);
      await recordAiUsage({
        runId: newRunId(),
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
      });
    }
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0]?.function;
    if (toolCall?.name !== toolName) return null;
    return JSON.parse(toolCall.arguments || "{}") as Record<string, unknown>;
  } catch (err) {
    console.error(`${logPrefix} LLM call failed:`, (err as Error).message);
    return null;
  }
}
