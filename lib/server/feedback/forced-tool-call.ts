import "server-only";

import {
  recordAiUsage,
  newRunId,
  parseOpenRouterUsage,
  type AiFeature,
  type AiUsageBillTo,
  type OpenRouterUsage,
} from "@/lib/server/ai-usage";
import { stripModelSuffix } from "@/lib/ai-model-config";

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
class OpenRouterHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "OpenRouterHttpError";
  }
}

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
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const logPrefix = options?.logPrefix ?? "[feedback-llm]";

  const attempt = async (attemptModel: string): Promise<Record<string, unknown> | null> => {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://minddy.app",
        "X-Title": options?.xTitle ?? "Feedback (minddy)",
      },
      body: JSON.stringify({
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
        tool_choice: { type: "function", function: { name: toolName } },
        usage: { include: true },
        max_tokens: options?.maxTokens ?? 1024,
      }),
      signal: AbortSignal.timeout(options?.timeoutMs ?? 45_000),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new OpenRouterHttpError(
        response.status,
        `LLM error (${response.status}): ${errorText.slice(0, 200)}`,
      );
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
        model: data.model ?? attemptModel,
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
    const call = data.choices?.[0]?.message?.tool_calls?.[0]?.function;
    if (call?.name !== toolName) return null;
    return JSON.parse(call.arguments || "{}") as Record<string, unknown>;
  };

  try {
    return await attempt(model);
  } catch (err) {
    // Repli du raccourci de routage (MIN-263) : le modèle NU plutôt qu'une
    // fonctionnalité éteinte. Un seul rejeu, et seulement sur un refus.
    const base = stripModelSuffix(model);
    if (err instanceof OpenRouterHttpError && base !== model) {
      console.warn(`${logPrefix} ${model} refused (${err.status}), retrying on ${base}`);
      try {
        return await attempt(base);
      } catch (retryErr) {
        console.error(`${logPrefix} LLM call failed:`, (retryErr as Error).message);
        return null;
      }
    }
    console.error(`${logPrefix} LLM call failed:`, (err as Error).message);
    return null;
  }
}
