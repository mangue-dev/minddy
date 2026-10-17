import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { aiModelFallback, stripModelSuffix } from "@/lib/ai-model-config";
import { getAppConfigValues } from "@/lib/server/app-config";
import { resolveAiRuntime } from "@/lib/server/ai-runtime";
import { hasUsageBudget } from "@/lib/server/usage";
import { cosineSimilarity, requestEmbeddings } from "@/lib/server/embeddings";
import { listProjectEmbeddings } from "@/lib/server/issue-embedding-store";
import { issueStore } from "@/lib/server/issue-store";
import { getServiceClient } from "@/lib/supabase-service";
import { resolveIssueIndexing } from "@/lib/smart-fill";
import { isSemanticQuery, normalizeSemanticQuery } from "@/lib/issue-semantic-query";

/**
 * SEMANTIC ISSUE SEARCH (MIN-718) — the MIN-717 issue index, queried by meaning.
 *
 * It returns ranked issue ids only. Every caller already holds the issues it
 * may show (its own candidate list, built under its permission, status and
 * exclusion rules) or reads them itself, and intersects these ids with it:
 * nothing here exposes a title or a snippet.
 *
 * - **Same index, same contract.** No second vector per issue. The query is
 *   embedded by the SEARCHING user's runtime for `issue_embedding_model`, and
 *   only vectors of that exact index version (`provider:model:dims`) are
 *   compared — an admin model change routes queries to the new version at
 *   once, and issues not reindexed yet stay reachable lexically.
 * - **Opt-out.** A user who turned off "Index issues" has refused embeddings:
 *   no query vector is created for them, and lexical search is all they get.
 *   The platform switch `smart_fill_relations_enabled` cuts it too.
 * - **Cost.** One embedding call per distinct query, billed to the searching
 *   user under `issue_search`, after their budget check. The query vector is
 *   cached per user and per embedding target, so a repeated query, the same
 *   query from another picker or a model change never mix up or re-bill.
 * - **Bounds.** At most 25 projects, 3,000 vectors each, a deadline, and a
 *   similarity floor. Any failure answers "unavailable": the picker keeps its
 *   lexical results.
 */

export type SemanticSearchStatus =
  | "ok"
  | "skipped_query"
  | "disabled"
  | "opted_out"
  | "budget_exhausted"
  | "unavailable"
  | "timeout";

export interface SemanticHit {
  id: string;
  project_id: string;
  score: number;
}

export const SEMANTIC_MIN_SIMILARITY = 0.3;
export const SEMANTIC_MAX_PROJECTS = 25;
const MAX_VECTORS_PER_PROJECT = 3_000;
const DEFAULT_DEADLINE_MS = 4_000;
const QUERY_CACHE_TTL_MS = 15 * 60_000;
const QUERY_CACHE_MAX = 500;

/** Query vectors by user, embedding target and normalized text. Per server instance. */
const queryCache = new Map<string, { vector: number[]; version: string; at: number }>();

/** Test hook: forget every cached query vector. */
export function clearSemanticQueryCache(): void {
  queryCache.clear();
}

function cacheGet(key: string) {
  const hit = queryCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > QUERY_CACHE_TTL_MS) {
    queryCache.delete(key);
    return null;
  }
  // Refresh recency: the Map's insertion order is the eviction order.
  queryCache.delete(key);
  queryCache.set(key, hit);
  return hit;
}

function cacheSet(key: string, value: { vector: number[]; version: string }) {
  queryCache.set(key, { ...value, at: Date.now() });
  while (queryCache.size > QUERY_CACHE_MAX) {
    const oldest = queryCache.keys().next().value;
    if (oldest === undefined) break;
    queryCache.delete(oldest);
  }
}

async function enabledForUser(userId: string): Promise<SemanticSearchStatus | null> {
  const cfg = await getAppConfigValues(["smart_fill_relations_enabled"]).catch(
    () => ({}) as Record<string, string | null>
  );
  if ((cfg["smart_fill_relations_enabled"] ?? aiModelFallback("smart_fill_relations_enabled")) === "false") {
    return "disabled";
  }
  const { data, error } = await getServiceClient().auth.admin.getUserById(userId);
  if (error || !data.user) return "unavailable";
  if (!resolveIssueIndexing((data.user.user_metadata ?? {}) as Record<string, unknown>)) return "opted_out";
  return null;
}

/** The searching user's query vector and its index version, cached. */
async function queryVector(
  userId: string,
  query: string,
): Promise<{ vector: number[]; version: string } | SemanticSearchStatus> {
  const runtime = await resolveAiRuntime({ userId, modelKey: "issue_embedding_model", surface: "automations" })
    .catch(() => null);
  if (!runtime) return "unavailable";
  const target = `${runtime.provider}:${stripModelSuffix(runtime.model)}`;
  const key = `${userId}\u0000${target}\u0000${query}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  if (!(await hasUsageBudget(userId, "automations", "issue_embedding_model"))) return "budget_exhausted";
  const batch = await requestEmbeddings([query], {
    modelKey: "issue_embedding_model",
    surface: "automations",
    feature: "issue_search",
    billedUserId: userId,
    record: { billTo: { userId } },
    dimensions: "any",
    xTitle: "Issue search",
    timeoutMs: 3_000,
  });
  const vector = batch?.vectors[0];
  if (!batch || !vector) return "unavailable";
  const value = { vector, version: `${batch.provider}:${batch.model}:${vector.length}` };
  cacheSet(key, value);
  return value;
}

/** Rank every project's vectors of `version` against the query. Pure over its inputs. */
export function rankHits(
  query: number[],
  rows: { issue_id: string; project_id: string; embedding: number[] }[],
): SemanticHit[] {
  const hits: SemanticHit[] = [];
  for (const row of rows) {
    const score = cosineSimilarity(query, row.embedding);
    if (score !== null && score >= SEMANTIC_MIN_SIMILARITY) {
      hits.push({ id: row.issue_id, project_id: row.project_id, score });
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/**
 * Semantic hits for `query` among `projectIds`, which the CALLER has already
 * established the user can read. Deleted issues are dropped before returning.
 * Never throws.
 */
export async function searchIssuesSemantically(input: {
  userId: string;
  query: string;
  projectIds: string[];
  limit?: number;
  deadlineMs?: number;
  service?: SupabaseClient;
}): Promise<{ status: SemanticSearchStatus; hits: SemanticHit[] }> {
  const query = normalizeSemanticQuery(input.query);
  if (!isSemanticQuery(query)) return { status: "skipped_query", hits: [] };
  const projectIds = [...new Set(input.projectIds)].slice(0, SEMANTIC_MAX_PROJECTS);
  if (projectIds.length === 0) return { status: "ok", hits: [] };
  const limit = Math.max(1, Math.min(input.limit ?? 10, 25));

  const work = async (): Promise<{ status: SemanticSearchStatus; hits: SemanticHit[] }> => {
    const refused = await enabledForUser(input.userId);
    if (refused) return { status: refused, hits: [] };
    const vector = await queryVector(input.userId, query);
    if (typeof vector === "string") return { status: vector, hits: [] };
    const service = input.service ?? getServiceClient();
    const rows = (await Promise.all(projectIds.map((projectId) =>
      listProjectEmbeddings(service, projectId, vector.version, MAX_VECTORS_PER_PROJECT).catch(() => [])
    ))).flat();
    const ranked = rankHits(vector.vector, rows).slice(0, limit * 3);
    if (ranked.length === 0) return { status: "ok", hits: [] };
    // Trashed issues keep their vector (restoration needs nothing): drop them here.
    const { data, error } = await issueStore(service)
      .select("id")
      .in("project_id", projectIds)
      .in("id", ranked.map((hit) => hit.id))
      .is("deleted_at", null);
    if (error) return { status: "unavailable", hits: [] };
    const alive = new Set(((data ?? []) as { id: string }[]).map((row) => row.id));
    return { status: "ok", hits: ranked.filter((hit) => alive.has(hit.id)).slice(0, limit) };
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<{ status: SemanticSearchStatus; hits: SemanticHit[] }>((resolve) => {
    timer = setTimeout(() => resolve({ status: "timeout", hits: [] }), input.deadlineMs ?? DEFAULT_DEADLINE_MS);
  });
  try {
    return await Promise.race([work(), deadline]);
  } catch {
    return { status: "unavailable", hits: [] };
  } finally {
    clearTimeout(timer);
  }
}
