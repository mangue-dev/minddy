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
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { safeFetchResponse } from "@/lib/server/safe-fetch";

/**
 * Cost tracking context for an embeddings call (one call = one run).
 * `billTo` says who pays: on the public board there is no nameable trigger
 * (an anonymous visitor, or the cron), so `{ projectOwner }`.
 */
export interface EmbeddingUsageRecord {
  billTo: AiUsageBillTo;
  projectId?: string | null;
}

/**
 * Embeddings client via OpenRouter (same gateway and same key as calls
 * LLM — OpenAI-compatible endpoint /api/v1/embeddings). Model configured as
 * base (app_config feedback_embedding_model, default text-embedding-3-small,
 * 1536 dims = extensions.vector(1536) schema side).
 *
 * Any failure (missing key, HTTP, timeout) returns null: the caller inserts
 * embedding=null and the time pass catches up — the board is never blocked
 * by the AI.
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

  // Plan budget (MIN-72): AI feedback is paid by the project owner.
  // Dry budget → null (like a network failure): the post lives without embedding,
  // the time pass will catch up when the budget returns.
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
    const http = runtime?.mode === "byok" ? safeFetchResponse : fetch;
    const response = await http(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(provider === "openrouter"
          ? { "HTTP-Referer": SITE_URL, "X-Title": `Feedback (${SITE_NAME})` }
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
    // Cost tracking: one call of embeddings = one run of a single call. Best-effort.
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
    // The admin routing shortcut (MIN-263) if there is one, and the bare model
    // fallback: missing embedding costs the board a catch-up pass.
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

/** Literal pgvector — the form in which an embedding passes to the
 vector columns and match_* RPC parameters. */
export function toVectorLiteral(embedding: number[]): string {
  return JSON.stringify(embedding);
}

// ── kNN via SQL RPCs (customer service, RLS deny-all) ───────────────────────

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
  /** true = only report public posts (suggestions on the visitor side, so as not to disclose private feedback). false (default) = team/AI dedup. */
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
