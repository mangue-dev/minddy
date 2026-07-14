import "server-only";

import { randomUUID } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * Suivi des coûts LLM — le point d'enregistrement UNIQUE de tous les appels IA.
 *
 * Chaque appel LLM écrit une ligne dans `ai_usage`. Les appels d'une même action
 * agentique partagent un `runId` (voir `newRunId`) → on peut agréger par appel,
 * par run et par type (`feature`). Le coût vient de l'usage rapporté par
 * OpenRouter quand on ajoute `usage: { include: true }` au corps de la requête.
 *
 * RÈGLE : `recordAiUsage` ne throw JAMAIS — le suivi de coût ne doit jamais faire
 * échouer la feature IA qui l'appelle (best-effort, à l'image de `insertStatEvents`).
 */

/** Les types d'appels IA suivis (1:1 avec le check `feature` de la migration). */
export type AiFeature =
  | "numo_chat"
  | "numo_comment"
  | "dictation"
  | "transcription"
  | "smart_assign"
  | "feedback_classify"
  | "feedback_analyze"
  | "embedding";

/** Forme de l'objet `usage` renvoyé par OpenRouter (chat / embeddings / audio). */
export interface OpenRouterUsage {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  /** Coût USD — présent seulement si la requête a passé `usage: { include: true }`. */
  cost?: number | null;
  /** Endpoints audio (whisper) exposent parfois les tokens sous ces noms. */
  input_tokens?: number | null;
  output_tokens?: number | null;
}

/** Champs normalisés extraits d'un `usage` OpenRouter (tolérant aux absents). */
export interface NormalizedUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cost: number | null;
}

/** À passer à chaque appel IA pour obtenir le coût inline dans la réponse. */
export const OPENROUTER_USAGE_INCLUDE = { include: true } as const;

/**
 * Normalise l'objet `usage` d'OpenRouter vers nos champs. Couvre les deux formes
 * de nommage des tokens (chat: prompt/completion, audio: input/output) et calcule
 * `totalTokens` par somme si l'API ne le fournit pas.
 */
export function parseOpenRouterUsage(
  usage: OpenRouterUsage | null | undefined
): NormalizedUsage {
  if (!usage) {
    return { promptTokens: null, completionTokens: null, totalTokens: null, cost: null };
  }
  const prompt = usage.prompt_tokens ?? usage.input_tokens ?? null;
  const completion = usage.completion_tokens ?? usage.output_tokens ?? null;
  const total =
    usage.total_tokens ??
    (prompt != null || completion != null ? (prompt ?? 0) + (completion ?? 0) : null);
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: total,
    cost: usage.cost ?? null,
  };
}

/** Un run_id frais : à générer une fois par action user (partagé par ses appels). */
export function newRunId(): string {
  return randomUUID();
}

/** Une ligne d'usage à enregistrer. Seuls `runId` et `feature` sont requis. */
export interface AiUsageInput {
  runId: string;
  /** Index de l'appel dans le run (0 pour un appel unique). */
  seq?: number;
  feature: AiFeature;
  model?: string | null;
  generationId?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  cost?: number | null;
  userId?: string | null;
  projectId?: string | null;
  conversationId?: string | null;
}

function toRow(input: AiUsageInput) {
  return {
    run_id: input.runId,
    seq: input.seq ?? 0,
    feature: input.feature,
    model: input.model ?? null,
    generation_id: input.generationId ?? null,
    prompt_tokens: input.promptTokens ?? null,
    completion_tokens: input.completionTokens ?? null,
    total_tokens: input.totalTokens ?? null,
    cost: input.cost ?? null,
    user_id: input.userId ?? null,
    project_id: input.projectId ?? null,
    conversation_id: input.conversationId ?? null,
  };
}

/**
 * Enregistre un (ou plusieurs) appel(s) IA dans le ledger `ai_usage`. Best-effort :
 * log l'erreur et l'avale — n'interrompt jamais l'appelant.
 */
export async function recordAiUsage(
  input: AiUsageInput | AiUsageInput[]
): Promise<void> {
  const rows = (Array.isArray(input) ? input : [input]).map(toRow);
  if (rows.length === 0) return;
  try {
    const service = getServiceClient();
    const { error } = await service.from("ai_usage").insert(rows);
    if (error) console.error("[ai-usage] insert failed:", error.message);
  } catch (err) {
    console.error("[ai-usage] insert threw:", (err as Error).message);
  }
}
