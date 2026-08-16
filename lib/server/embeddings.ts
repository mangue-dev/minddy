import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { resolveConfiguredModel, withModelSuffixFallback } from "@/lib/server/model-config";
import type { FeedbackPostStatus } from "@/lib/feedback/types";
import {
  recordAiUsage,
  newRunId,
  parseOpenRouterUsage,
  type AiUsageBillTo,
  type OpenRouterUsage,
} from "@/lib/server/ai-usage";
import { ownerHasUsageBudget } from "@/lib/server/usage";
import { resolveAiRuntime } from "@/lib/server/ai-runtime";
import { isManagedAiEnabled } from "@/lib/managed-services";

/**
 * Contexte de suivi de coût pour un appel d'embeddings (un appel = un run).
 * `billTo` dit qui paye : sur le board public il n'y a pas de déclencheur
 * nommable (un visiteur anonyme, ou le cron), donc `{ projectOwner }`.
 */
export interface EmbeddingUsageRecord {
  billTo: AiUsageBillTo;
  projectId?: string | null;
}

/**
 * Client d'embeddings via OpenRouter (même gateway et même clé que les appels
 * LLM — endpoint OpenAI-compatible /api/v1/embeddings). Modèle configuré en
 * base (app_config feedback_embedding_model, défaut text-embedding-3-small,
 * 1536 dims = extensions.vector(1536) côté schéma).
 *
 * Tout échec (clé absente, HTTP, timeout) retourne null : l'appelant insère
 * embedding=null et la passe horaire rattrape — le board n'est jamais bloqué
 * par l'IA.
 */

const OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";
export const EMBEDDING_DIMENSIONS = 1536;
const MAX_INPUT_CHARS = 6000;
const DEFAULT_TIMEOUT_MS = 8000;

export async function embedTexts(
  texts: string[],
  opts?: { timeoutMs?: number; record?: EmbeddingUsageRecord }
): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];

  // Budget du plan (MIN-72) : l'IA feedback est payée par le owner du projet.
  // Budget à sec → null (comme un échec réseau) : le post vit sans embedding,
  // la passe horaire rattrapera quand le budget sera revenu.
  if (opts?.record?.projectId) {
    if (!(await ownerHasUsageBudget(opts.record.projectId, "feedback"))) {
      return texts.map(() => null);
    }
  }

  let billedUserId: string | null = null;
  const billTo = opts?.record?.billTo;
  if (billTo && "userId" in billTo) billedUserId = billTo.userId || null;
  else if (billTo && "projectOwner" in billTo) {
    const { data } = await getServiceClient()
      .from("projects")
      .select("owner_id")
      .eq("id", billTo.projectOwner)
      .maybeSingle();
    billedUserId = (data as { owner_id?: string } | null)?.owner_id ?? null;
  }

  const runtime = billedUserId
    ? await resolveAiRuntime({
        userId: billedUserId,
        modelKey: "feedback_embedding_model",
        surface: "feedback",
      }).catch(() => null)
    : null;
  const apiKey = runtime?.apiKey ?? (isManagedAiEnabled() ? process.env.OPENROUTER_API_KEY : undefined);
  if (!apiKey) return texts.map(() => null);
  const endpoint = runtime
    ? `${runtime.baseUrl.replace(/\/+$/, "")}/embeddings`
    : OPENROUTER_EMBEDDINGS_URL;
  const provider = runtime?.provider ?? "openrouter";

  const input = texts.map((t) => t.slice(0, MAX_INPUT_CHARS));
  const attempt = async (model: string): Promise<(number[] | null)[]> => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(provider === "openrouter"
          ? { "HTTP-Referer": "https://minddy.app", "X-Title": "Feedback (minddy)" }
          : {}),
      },
      body: JSON.stringify({
        model,
        input,
        dimensions: EMBEDDING_DIMENSIONS,
        ...(provider === "openrouter" ? { usage: { include: true } } : {}),
      }),
      signal: AbortSignal.timeout(opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`embeddings error (${response.status}): ${detail.slice(0, 200)}`);
    }
    const data = (await response.json()) as {
      data?: { index?: number; embedding?: number[] }[];
      id?: string;
      model?: string;
      usage?: OpenRouterUsage;
    };
    // Suivi des coûts : un appel d'embeddings = un run d'un seul appel. Best-effort.
    if (opts?.record) {
      const u = parseOpenRouterUsage(data.usage);
      await recordAiUsage({
        runId: newRunId(),
        feature: "embedding",
        provider,
        keyMode: runtime?.mode ?? "platform",
        model: data.model ?? model,
        generationId: data.id ?? null,
        promptTokens: u.promptTokens,
        completionTokens: u.completionTokens,
        totalTokens: u.totalTokens,
        cost: u.cost,
        billTo: opts.record.billTo,
        projectId: opts.record.projectId ?? null,
      });
    }
    const byIndex = new Map<number, number[]>();
    for (const [i, item] of (data.data ?? []).entries()) {
      const embedding = item.embedding;
      if (
        Array.isArray(embedding) &&
        embedding.length === EMBEDDING_DIMENSIONS &&
        embedding.every((v) => typeof v === "number")
      ) {
        byIndex.set(item.index ?? i, embedding);
      }
    }
    return texts.map((_, i) => byIndex.get(i) ?? null);
  };

  try {
    // Le raccourci de routage admin (MIN-263) s'il y en a un, et le modèle nu
    // en repli : un embedding manquant coûte au board une passe de rattrapage.
    const model = runtime?.model ?? (await resolveConfiguredModel("feedback_embedding_model")).model;
    return provider === "openrouter"
      ? await withModelSuffixFallback(model, attempt, { logPrefix: "[embeddings]" })
      : await attempt(model);
  } catch (err) {
    console.error("[embeddings] failed:", (err as Error).message);
    return texts.map(() => null);
  }
}

export async function embedText(
  text: string,
  opts?: { timeoutMs?: number; record?: EmbeddingUsageRecord }
): Promise<number[] | null> {
  const [embedding] = await embedTexts([text], opts);
  return embedding ?? null;
}

/** Littéral pgvector — la forme sous laquelle un embedding transite vers les
    colonnes vector et les paramètres des RPC match_*. */
export function toVectorLiteral(embedding: number[]): string {
  return JSON.stringify(embedding);
}

// ── kNN via les RPC SQL (service client, RLS deny-all) ───────────────────────

export interface MatchedPost {
  id: string;
  title: string;
  body: string;
  status: FeedbackPostStatus;
  vote_count: number;
  issue_id: string | null;
  similarity: number;
}

export async function matchFeedbackPosts(params: {
  projectId: string;
  embedding: number[];
  exclude?: string | null;
  limit?: number;
  /** true = ne remonter que les posts publics (suggestions côté visiteur, pour
      ne pas divulguer un retour privé). false (défaut) = dédup équipe/IA. */
  publicOnly?: boolean;
}): Promise<MatchedPost[]> {
  const service = getServiceClient();
  const { data, error } = await service.rpc("match_feedback_posts", {
    p_project_id: params.projectId,
    p_embedding: toVectorLiteral(params.embedding),
    p_exclude: params.exclude ?? null,
    p_limit: params.limit ?? 8,
    p_public_only: params.publicOnly ?? false,
  });
  if (error) {
    console.error("[embeddings] match_feedback_posts failed:", error.message);
    return [];
  }
  return (data ?? []) as MatchedPost[];
}
