import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { feedbackPostStore } from "@/lib/server/feedback-post-store";
import { resolveConfiguredModel, withModelSuffixFallback } from "@/lib/server/model-config";
import { stripModelSuffix } from "@/lib/ai-model-config";
import type { AiSurface, ByokModelKey } from "@/lib/ai-surfaces";
import type { AiFeature } from "@/lib/server/ai-usage-shape";
import type { FeedbackPostStatus } from "@/lib/feedback/types";
import {
  recordAiUsage,
  newRunId,
  parseOpenRouterUsage,
  type AiUsageBillTo,
  type OpenRouterUsage,
} from "@/lib/server/ai-usage";
import { ownerHasUsageBudget } from "@/lib/server/usage";
import {
  handleManagedKeyRejection,
  resolveAiRuntime,
  resolvePlatformApiKey,
} from "@/lib/server/ai-runtime";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { fetchAiProvider } from "@/lib/server/ai-provider-request";
import type { AgentProviderId } from "@/lib/agent-providers";

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
 * LLM — OpenAI-compatible endpoint /api/v1/embeddings), or the account's BYOK
 * provider when it covers the surface.
 *
 * Two callers share the transport (`requestEmbeddings`) and keep their own
 * policy: the feedback board (`embedTexts`, `feedback_embedding_model`, fixed
 * 1536 dims = the stored feedback vectors) and the issue index of Smart Fill
 * relations (MIN-717, `issue_embedding_model`, any consistent dimension —
 * the index version records it). Neither inherits the other's model, surface,
 * ledger feature or budget.
 *
 * Any failure (missing key, HTTP, timeout) returns null vectors: the caller
 * stores nothing and a later pass catches up — no creation is ever blocked by
 * the AI.
 */

const OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";
export const EMBEDDING_DIMENSIONS = 1536;
const MAX_INPUT_CHARS = 6000;
const DEFAULT_TIMEOUT_MS = 8000;

export type EmbeddingModelKey = Extract<ByokModelKey, "feedback_embedding_model" | "issue_embedding_model">;

/** One embeddings call, with the model that actually served it. */
export interface EmbeddingBatch {
  vectors: (number[] | null)[];
  provider: AgentProviderId;
  /** The model requested, without its OpenRouter routing suffix. */
  model: string;
  keyMode: "platform" | "byok";
}

/**
 * The shared transport. Resolves the runtime of `billedUserId` for `modelKey`
 * (BYOK first, managed AI otherwise), sends ONE request for every text, records
 * one ledger line under `feature`, and keeps only well-formed vectors whose
 * length matches `dimensions` (or the first returned length when `dimensions`
 * is `"any"`, so a batch never mixes sizes). `null` when no runtime can serve
 * the call or the provider fails.
 */
export async function requestEmbeddings(
  texts: string[],
  opts: {
    modelKey: EmbeddingModelKey;
    surface: AiSurface;
    feature: AiFeature;
    billedUserId: string | null;
    record?: EmbeddingUsageRecord;
    dimensions: number | "any";
    xTitle: string;
    timeoutMs?: number;
    /** Platform key without a resolvable account (feedback board legacy path). */
    allowPlatformWithoutUser?: boolean;
  }
): Promise<EmbeddingBatch | null> {
  if (texts.length === 0) return null;
  const runtime = opts.billedUserId
    ? await resolveAiRuntime({
        userId: opts.billedUserId,
        modelKey: opts.modelKey,
        surface: opts.surface,
      }).catch(() => null)
    : null;
  // The legacy feedback-board path may still pay with managed AI when no
  // account runtime resolves: the owner's own key on Cloud, else the public one.
  const platformKey = !runtime && opts.allowPlatformWithoutUser
    ? await resolvePlatformApiKey(opts.billedUserId).catch(() => null)
    : null;
  const managedKey = runtime ?? platformKey;
  const apiKey = managedKey?.apiKey;
  if (!managedKey || !apiKey) return null;
  const endpoint = runtime
    ? `${runtime.baseUrl.replace(/\/+$/, "")}/embeddings`
    : OPENROUTER_EMBEDDINGS_URL;
  const provider: AgentProviderId = runtime?.provider ?? "openrouter";
  const keyMode = runtime?.mode ?? "platform";
  const requestedDimensions = opts.dimensions === "any" ? null : opts.dimensions;

  const input = texts.map((t) => t.slice(0, MAX_INPUT_CHARS));
  const attempt = async (model: string): Promise<(number[] | null)[]> => {
    const response = await fetchAiProvider(provider, endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(provider === "openrouter"
          ? { "HTTP-Referer": SITE_URL, "X-Title": `${opts.xTitle} (${SITE_NAME})` }
          : {}),
      },
      body: JSON.stringify({
        model,
        input,
        // A fixed size is part of the feedback contract. The issue index
        // (`"any"`) leaves the model at its native size: some embedding
        // models refuse the parameter, and the index version records the
        // returned dimensions anyway.
        ...(requestedDimensions !== null ? { dimensions: requestedDimensions } : {}),
        ...(provider === "openrouter" ? { usage: { include: true } } : {}),
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = await response.text();
      await handleManagedKeyRejection(managedKey, response.status, detail);
      throw new Error(`embeddings error (${response.status}): ${detail.slice(0, 200)}`);
    }
    const data = (await response.json()) as {
      data?: { index?: number; embedding?: number[] }[];
      id?: string;
      model?: string;
      usage?: OpenRouterUsage;
    };
    // Cost tracking: one call of embeddings = one run of a single call. Best-effort.
    if (opts.record) {
      const u = parseOpenRouterUsage(data.usage);
      await recordAiUsage({
        runId: newRunId(),
        feature: opts.feature,
        provider,
        keyMode,
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
    return keepVectors(texts.length, data.data ?? [], opts.dimensions);
  };

  try {
    // The admin routing shortcut (MIN-263) if there is one, and the bare model
    // fallback: a missing embedding costs a catch-up pass, never a failure.
    const model = runtime?.model ?? (await resolveConfiguredModel(opts.modelKey)).model;
    const vectors =
      provider === "openrouter"
        ? await withModelSuffixFallback(model, attempt, { logPrefix: "[embeddings]" })
        : await attempt(model);
    return { vectors, provider, model: stripModelSuffix(model), keyMode };
  } catch (err) {
    console.error("[embeddings] failed:", (err as Error).message);
    return null;
  }
}

/**
 * Well-formed vectors by input position. With a fixed `dimensions`, a vector
 * of another length is dropped; with `"any"`, the first valid length wins and
 * any other is dropped, so one batch never mixes embedding sizes. Pure.
 */
export function keepVectors(
  count: number,
  items: { index?: number; embedding?: number[] }[],
  dimensions: number | "any"
): (number[] | null)[] {
  let expected = dimensions === "any" ? null : dimensions;
  const byIndex = new Map<number, number[]>();
  for (const [i, item] of items.entries()) {
    const embedding = item.embedding;
    if (
      !Array.isArray(embedding) ||
      embedding.length === 0 ||
      !embedding.every((v) => typeof v === "number" && Number.isFinite(v))
    ) {
      continue;
    }
    if (expected === null) expected = embedding.length;
    if (embedding.length !== expected) continue;
    byIndex.set(item.index ?? i, embedding);
  }
  return Array.from({ length: count }, (_, i) => byIndex.get(i) ?? null);
}

export async function embedTexts(
  texts: string[],
  opts?: { timeoutMs?: number; record?: EmbeddingUsageRecord }
): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];

  // Plan budget (MIN-72): AI feedback is paid by the project owner.
  // Dry budget → null (like a network failure): the post lives without embedding,
  // the time pass will catch up when the budget returns.
  if (opts?.record?.projectId) {
    if (!(await ownerHasUsageBudget(
      opts.record.projectId,
      "feedback",
      "feedback_embedding_model",
    ))) {
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

  const batch = await requestEmbeddings(texts, {
    modelKey: "feedback_embedding_model",
    surface: "feedback",
    feature: "embedding",
    billedUserId,
    record: opts?.record,
    dimensions: EMBEDDING_DIMENSIONS,
    xTitle: "Feedback",
    timeoutMs: opts?.timeoutMs,
    allowPlatformWithoutUser: true,
  });
  return batch?.vectors ?? texts.map(() => null);
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
  /** Review searches only within the explicitly selected objective. */
  objectiveId?: string | null;
}): Promise<MatchedPost[]> {
  const service = getServiceClient();
  const maxCount = Number.isFinite(params.limit ?? 8)
    ? Math.max(0, Math.min(Math.trunc(params.limit ?? 8), 100)) : 8;
  if (maxCount === 0) return [];
  const matches: MatchedPost[] = [];
  const pageSize = 200;
  for (let offset = 0; ; offset += pageSize) {
    let query = feedbackPostStore(service)
      .select("id, project_id, title, body, status, vote_count, issue_id, embedding")
      .eq("project_id", params.projectId).is("deleted_at", null)
      .is("merged_into_id", null).order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (params.objectiveId !== undefined) query = params.objectiveId === null
      ? query.is("objective_id", null) : query.eq("objective_id", params.objectiveId);
    if (params.publicOnly) query = query.eq("is_public", true)
      .eq("review_state", "published").neq("status", "spam");
    const { data, error } = await query;
    if (error) throw new Error("Unable to search feedback posts");
    for (const row of data ?? []) {
      if (row.id === params.exclude) continue;
      const vector = parseStoredEmbedding(row.embedding);
      if (!vector || vector.length !== params.embedding.length) continue;
      const similarity = cosineSimilarity(params.embedding, vector);
      if (similarity === null) continue;
      matches.push({ id: row.id, title: row.title, body: row.body, status: row.status,
        vote_count: row.vote_count, issue_id: row.issue_id, similarity });
      if (matches.length > maxCount) {
        matches.sort((a, b) => b.similarity - a.similarity || a.id.localeCompare(b.id));
        matches.length = maxCount;
      }
    }
    if ((data ?? []).length < pageSize) break;
  }
  matches.sort((a, b) => b.similarity - a.similarity || a.id.localeCompare(b.id));
  return matches;
}

export function parseStoredEmbedding(value: unknown): number[] | null {
  if (Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item))) {
    return value;
  }
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "number" && Number.isFinite(item))
      ? parsed : null;
  } catch { return null; }
}

/** Cosine similarity of two equal-length vectors; `null` for a zero vector. Pure. */
export function cosineSimilarity(a: number[], b: number[]): number | null {
  if (a.length !== b.length) return null;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i];
  }
  return aa > 0 && bb > 0 ? dot / Math.sqrt(aa * bb) : null;
}
