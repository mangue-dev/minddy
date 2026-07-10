import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getAppConfigValue } from "@/lib/server/app-config";
import type { FeedbackPostStatus } from "@/lib/feedback/types";

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
const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;
const MAX_INPUT_CHARS = 6000;
const DEFAULT_TIMEOUT_MS = 8000;

export async function embedTexts(
  texts: string[],
  opts?: { timeoutMs?: number }
): Promise<(number[] | null)[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || texts.length === 0) return texts.map(() => null);

  const input = texts.map((t) => t.slice(0, MAX_INPUT_CHARS));
  try {
    const model = (await getAppConfigValue("feedback_embedding_model")) || DEFAULT_EMBEDDING_MODEL;
    const response = await fetch(OPENROUTER_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://minddy.app",
        "X-Title": "Feedback (minddy)",
      },
      body: JSON.stringify({ model, input }),
      signal: AbortSignal.timeout(opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`embeddings error (${response.status}): ${detail.slice(0, 200)}`);
    }
    const data = (await response.json()) as {
      data?: { index?: number; embedding?: number[] }[];
    };
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
  } catch (err) {
    console.error("[embeddings] failed:", (err as Error).message);
    return texts.map(() => null);
  }
}

export async function embedText(
  text: string,
  opts?: { timeoutMs?: number }
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

export interface MatchedFacet {
  id: string;
  facet_text: string;
  vote_count: number;
  similarity: number;
}

export async function matchFeedbackFacets(params: {
  postId: string;
  embedding: number[];
  exclude?: string | null;
  limit?: number;
}): Promise<MatchedFacet[]> {
  const service = getServiceClient();
  const { data, error } = await service.rpc("match_feedback_facets", {
    p_post_id: params.postId,
    p_embedding: toVectorLiteral(params.embedding),
    p_exclude: params.exclude ?? null,
    p_limit: params.limit ?? 5,
  });
  if (error) {
    console.error("[embeddings] match_feedback_facets failed:", error.message);
    return [];
  }
  return (data ?? []) as MatchedFacet[];
}
