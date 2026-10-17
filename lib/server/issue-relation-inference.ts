import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { aiModelFallback, stripModelSuffix } from "@/lib/ai-model-config";
import { afterOrNow } from "@/lib/server/after-safe";
import { getAppConfigValues, setAppConfigValue } from "@/lib/server/app-config";
import { resolveAiRuntime } from "@/lib/server/ai-runtime";
import { hasUsageBudget } from "@/lib/server/usage";
import { getProjectAccess } from "@/lib/server/project-access";
import { cosineSimilarity, requestEmbeddings } from "@/lib/server/embeddings";
import { issueStore } from "@/lib/server/issue-store";
import {
  deleteIssueEmbeddingVersions,
  listIssueEmbeddings,
  listProjectEmbeddings,
  rewriteStoredEmbedding,
  writeIssueEmbedding,
  type IssueEmbeddingRow,
} from "@/lib/server/issue-embedding-store";
import { addIssueRelation, listIssueRelations } from "@/lib/server/issue-relations";
import { runDecision } from "@/lib/server/decisions/runner";
import { resolveCreationAccount } from "@/lib/server/smart-fill";
import {
  buildRelationSpec,
  invertVerdict,
  MAX_RELATION_CANDIDATES,
  relationVerdicts,
  type RelationCandidate,
  type RelationVerdict,
} from "@/lib/server/issue-relation-decision";
import {
  resolveIssueIndexing,
  resolveSmartFill,
  resolveSmartFillRelations,
  resolveSmartFillScope,
  type SmartFillScope,
} from "@/lib/smart-fill";

/**
 * SMART FILL RELATIONS (MIN-717) — after an issue is saved, index it and link
 * it to the few existing issues it plainly relates to.
 *
 * The pass never runs before the response: creation and edits return first,
 * and `afterOrNow` carries the work. Every step can be skipped without
 * consequence for the issue — opt-out, platform flag, budget, provider
 * failure, missing index — and each skip is logged as a fixed code only.
 *
 *   1. Index: the title and description become ONE vector in the index
 *      version of the payer's embedding runtime (`provider:model:dims`). An
 *      unchanged content fingerprint reuses the stored vector, so nothing is
 *      billed twice for the same text.
 *   2. Retrieve: that same vector is the query — compared in the server,
 *      after decryption, only with vectors of the same version. Issues that
 *      version has not indexed yet are reached by a bounded lexical search,
 *      the fallback when no compatible index is ready.
 *   3. Decide: one decision call answers at most five candidates; similarity
 *      alone never creates a relation (`issue-relation-decision.ts`).
 *   4. Apply: only on content that did not change meanwhile, never on a pair
 *      that already has a relation or whose applied relation someone removed,
 *      never closing a `blocks` cycle, and through `addIssueRelation` as the
 *      payer — the same access checks and history as a person's link.
 *
 * Indexing alone also serves the bounded backfill of existing issues
 * (`runIssueIndexBackfill`), which never infers relations: linking a whole
 * history at once is not something anyone asked for.
 */

/** Below this cosine similarity, a vector neighbour is not even a candidate. */
export const MIN_CANDIDATE_SIMILARITY = 0.35;
/** Relations a single pass may apply. */
export const MAX_APPLIED_RELATIONS = 3;
/** Neighbours considered before dismissed, linked and closed ones are filtered out. */
const NEIGHBOUR_POOL = 30;
/** Recent issues the lexical fallback reads, at most. */
const LEXICAL_POOL = 300;
/** Below this overlap score, a lexical neighbour is not a candidate. */
export const MIN_LEXICAL_SCORE = 0.2;
const MAX_EMBEDDED_CHARS = 6_000;
const CLOSED_STATUSES = new Set(["canceled", "duplicate"]);

export type IssueAiTrigger = "created" | "edited";

interface IssueContent {
  id: string;
  project_id: string;
  number: number | null;
  title: string;
  description: string | null;
  status: string;
  created_by?: string | null;
}

/** Fingerprint of the indexed content. Stored encrypted only, never compared in SQL. */
export function contentFingerprint(title: string, description: string | null): string {
  return createHash("sha256")
    .update(`${title.trim()}\n${(description ?? "").trim()}`)
    .digest("hex");
}

/** The text an issue is indexed as: title first, then the description. */
export function embeddingText(title: string, description: string | null): string {
  const body = description?.trim();
  return (body ? `${title.trim()}\n\n${body}` : title.trim()).slice(0, MAX_EMBEDDED_CHARS);
}

/** `provider:model:dimensions` — two versions are never compared, even at equal dimensions. */
export function indexVersion(provider: string, model: string, dimensions: number): string {
  return `${provider}:${stripModelSuffix(model)}:${dimensions}`;
}

// ── Lexical fallback ────────────────────────────────────────────────────────

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/\p{M}+/gu, "")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length >= 4)
  );
}

/**
 * Overlap of the significant words of two texts, normalized by their sizes.
 * At least two shared words are required: one common word is a coincidence.
 * Pure; used only where no compatible vector exists.
 */
export function lexicalScore(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  if (shared < 2) return 0;
  return shared / Math.sqrt(left.size * right.size);
}

/**
 * Rank vector neighbours: same version only (guaranteed by the caller's
 * read), the subject excluded, at or above the similarity floor. Pure.
 */
export function rankVectorNeighbours(
  query: number[],
  rows: Pick<IssueEmbeddingRow, "issue_id" | "embedding">[],
  excludeId: string,
): { id: string; score: number }[] {
  const ranked: { id: string; score: number }[] = [];
  for (const row of rows) {
    if (row.issue_id === excludeId) continue;
    const score = cosineSimilarity(query, row.embedding);
    if (score !== null && score >= MIN_CANDIDATE_SIMILARITY) ranked.push({ id: row.issue_id, score });
  }
  return ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/**
 * Would a new stored `blocks` edge `source → target` close a cycle? True when
 * `target` already reaches `source` through existing `blocks` edges. Pure.
 */
export function wouldCloseBlockingCycle(
  edges: { source_id: string; target_id: string }[],
  source: string,
  target: string,
): boolean {
  if (source === target) return true;
  const next = new Map<string, string[]>();
  for (const edge of edges) {
    const list = next.get(edge.source_id) ?? [];
    list.push(edge.target_id);
    next.set(edge.source_id, list);
  }
  const seen = new Set<string>([target]);
  const stack = [target];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === source) return true;
    for (const child of next.get(node) ?? []) {
      if (!seen.has(child)) {
        seen.add(child);
        stack.push(child);
      }
    }
  }
  return false;
}

/** The stored edge a verdict creates, from the subject's perspective. */
export function storedBlockingEdge(
  subjectId: string,
  candidateId: string,
  verdict: RelationVerdict,
): { source_id: string; target_id: string } | null {
  if (verdict === "blocks") return { source_id: subjectId, target_id: candidateId };
  if (verdict === "blocked_by") return { source_id: candidateId, target_id: subjectId };
  return null;
}

// ── Settings ────────────────────────────────────────────────────────────────

async function platformEnabled(): Promise<{ indexing: boolean; relations: boolean }> {
  const cfg = await getAppConfigValues(["smart_fill_relations_enabled", "smart_fill_enabled"]).catch(
    () => ({}) as Record<string, string | null>
  );
  const indexing =
    (cfg["smart_fill_relations_enabled"] ?? aiModelFallback("smart_fill_relations_enabled")) !== "false";
  const smartFill = (cfg["smart_fill_enabled"] ?? aiModelFallback("smart_fill_enabled")) !== "false";
  return { indexing, relations: indexing && smartFill };
}

async function readMeta(userId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await getServiceClient().auth.admin.getUserById(userId);
  if (error || !data.user) return null;
  return (data.user.user_metadata ?? {}) as Record<string, unknown>;
}

async function readIssue(service: SupabaseClient, issueId: string, projectId: string): Promise<IssueContent | null> {
  const { data, error } = await issueStore(service)
    .select("id, project_id, number, title, description, status, created_by")
    .eq("id", issueId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return data as IssueContent;
}

// ── Indexing ────────────────────────────────────────────────────────────────

/** Provider and model the payer's embedding calls resolve to, before any call. */
async function embeddingTarget(userId: string): Promise<{ provider: string; model: string } | null> {
  const runtime = await resolveAiRuntime({ userId, modelKey: "issue_embedding_model", surface: "automations" })
    .catch(() => null);
  if (runtime) return { provider: runtime.provider, model: stripModelSuffix(runtime.model) };
  return null;
}

/**
 * Remove the issue's vectors that no longer describe its content, in every
 * index version. Runs whether or not a new vector can be paid for: a stale
 * vector must not keep answering searches for text the issue no longer has.
 */
export async function purgeStaleVectors(
  service: SupabaseClient,
  issue: Pick<IssueContent, "id" | "title" | "description">,
): Promise<void> {
  const hash = contentFingerprint(issue.title, issue.description);
  const stale = (await listIssueEmbeddings(service, [issue.id]))
    .filter((row) => row.content_hash !== hash)
    .map((row) => row.index_version);
  await deleteIssueEmbeddingVersions(service, issue.id, stale);
}

/** Current fingerprints of these issues, to refuse writing a vector of former text. */
async function currentFingerprints(
  service: SupabaseClient,
  projectId: string,
  ids: string[],
): Promise<Map<string, string>> {
  const { data, error } = await issueStore(service)
    .select("id, title, description")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .in("id", ids);
  const result = new Map<string, string>();
  if (error) return result;
  for (const row of (data ?? []) as Pick<IssueContent, "id" | "title" | "description">[]) {
    result.set(row.id, contentFingerprint(row.title, row.description));
  }
  return result;
}

/**
 * Index a batch of issues of ONE project for ONE payer. Unchanged content
 * reuses its row (no call, no charge); the rest goes into a single embeddings
 * request.
 * Versions computed from former content are removed; versions of the SAME
 * content in other embedding spaces are kept. A vector whose issue changed
 * while the call ran is not written — the edit's own pass writes the right
 * one. Returns the current row per issue id, for the caller's retrieval.
 */
export async function indexIssues(
  service: SupabaseClient,
  projectId: string,
  payerId: string,
  issues: IssueContent[],
): Promise<Map<string, IssueEmbeddingRow>> {
  const target = await embeddingTarget(payerId);
  if (!target) {
    console.warn("[issue-index] skipped: no_runtime");
    return new Map();
  }
  const prefix = `${target.provider}:${target.model}:`;
  const stored = await listIssueEmbeddings(service, issues.map((i) => i.id));
  const current = new Map<string, IssueEmbeddingRow>();
  const stale: { issue: IssueContent; hash: string; outdated: string[] }[] = [];
  for (const issue of issues) {
    const hash = contentFingerprint(issue.title, issue.description);
    const rows = stored.filter((row) => row.issue_id === issue.id);
    const outdated = rows.filter((row) => row.content_hash !== hash).map((row) => row.index_version);
    const own = rows.find((row) => row.index_version.startsWith(prefix) && row.content_hash === hash);
    if (own) {
      current.set(issue.id, own);
      await deleteIssueEmbeddingVersions(service, issue.id, outdated);
    } else {
      stale.push({ issue, hash, outdated });
    }
  }
  if (stale.length === 0) return current;
  // Former-content vectors go now, even if no new one can be paid for below.
  const dropOutdated = () =>
    Promise.all(stale.map(({ issue, outdated }) => deleteIssueEmbeddingVersions(service, issue.id, outdated)));
  if (!(await hasUsageBudget(payerId, "automations", "issue_embedding_model"))) {
    console.warn("[issue-index] skipped: budget_exhausted");
    await dropOutdated();
    return current;
  }
  const batch = await requestEmbeddings(
    stale.map(({ issue }) => embeddingText(issue.title, issue.description)),
    {
      modelKey: "issue_embedding_model",
      surface: "automations",
      feature: "issue_embedding",
      billedUserId: payerId,
      record: { billTo: { userId: payerId }, projectId },
      dimensions: "any",
      xTitle: "Smart-fill index",
    }
  );
  if (!batch) {
    console.warn("[issue-index] skipped: provider_failed");
    await dropOutdated();
    return current;
  }
  const fresh = await currentFingerprints(service, projectId, stale.map(({ issue }) => issue.id));
  for (const [i, { issue, hash, outdated }] of stale.entries()) {
    const vector = batch.vectors[i];
    if (!vector || fresh.get(issue.id) !== hash) {
      await deleteIssueEmbeddingVersions(service, issue.id, outdated);
      continue;
    }
    const row: IssueEmbeddingRow = {
      issue_id: issue.id,
      project_id: projectId,
      index_version: indexVersion(batch.provider, batch.model, vector.length),
      // New text in this space gets a new version id, so decisions cached on
      // the former text can never be reused for it.
      content_version: randomUUID(),
      dimensions: vector.length,
      embedding: vector,
      content_hash: hash,
    };
    try {
      await writeIssueEmbedding(service, row, outdated);
      current.set(issue.id, row);
    } catch {
      console.error("[issue-index] write failed");
    }
  }
  return current;
}

// ── Relation inference ──────────────────────────────────────────────────────

interface Neighbour {
  id: string;
  score: number;
  version: string | null;
}

async function lexicalNeighbours(
  service: SupabaseClient,
  subject: IssueContent,
  exclude: Set<string>,
): Promise<Neighbour[]> {
  const { data, error } = await issueStore(service)
    .select("id, project_id, number, title, description, status")
    .eq("project_id", subject.project_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(LEXICAL_POOL);
  if (error) return [];
  const text = `${subject.title}\n${subject.description ?? ""}`;
  const neighbours: Neighbour[] = [];
  for (const row of (data ?? []) as IssueContent[]) {
    if (row.id === subject.id || exclude.has(row.id) || CLOSED_STATUSES.has(row.status)) continue;
    const score = lexicalScore(text, `${row.title}\n${row.description ?? ""}`);
    if (score >= MIN_LEXICAL_SCORE) neighbours.push({ id: row.id, score, version: null });
  }
  neighbours.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return neighbours;
}

async function aliveCandidates(
  service: SupabaseClient,
  projectId: string,
  ids: string[],
): Promise<Map<string, IssueContent>> {
  const result = new Map<string, IssueContent>();
  if (ids.length === 0) return result;
  const { data, error } = await issueStore(service)
    .select("id, project_id, number, title, description, status")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .in("id", ids);
  if (error) return result;
  for (const row of (data ?? []) as IssueContent[]) {
    if (!CLOSED_STATUSES.has(row.status)) result.set(row.id, row);
  }
  return result;
}

interface InferenceRow {
  issue_id: string;
  candidate_id: string;
  issue_version: string;
  candidate_version: string;
  verdict: RelationVerdict;
  relation_id: string | null;
  applied_at: string | null;
}

/**
 * Previous decisions touching the subject and these candidates, both
 * directions: the dismissed pairs (applied, then removed by someone) and the
 * verdicts cached for the exact content versions.
 */
async function previousDecisions(
  service: SupabaseClient,
  subjectId: string,
  candidateIds: string[],
): Promise<InferenceRow[]> {
  if (candidateIds.length === 0) return [];
  const [forward, backward] = await Promise.all([
    service
      .from("issue_relation_inferences")
      .select("issue_id, candidate_id, issue_version, candidate_version, verdict, relation_id, applied_at")
      .eq("issue_id", subjectId)
      .in("candidate_id", candidateIds),
    service
      .from("issue_relation_inferences")
      .select("issue_id, candidate_id, issue_version, candidate_version, verdict, relation_id, applied_at")
      .eq("candidate_id", subjectId)
      .in("issue_id", candidateIds),
  ]);
  if (forward.error || backward.error) throw new Error("Unable to read relation decisions");
  return [...(forward.data ?? []), ...(backward.data ?? [])] as InferenceRow[];
}

/** A pair whose applied relation was later removed is dismissed for good. Pure. */
export function dismissedCandidates(subjectId: string, rows: InferenceRow[]): Set<string> {
  const dismissed = new Set<string>();
  for (const row of rows) {
    if (row.applied_at && !row.relation_id) {
      dismissed.add(row.issue_id === subjectId ? row.candidate_id : row.issue_id);
    }
  }
  return dismissed;
}

/** The verdict cached for these exact content versions, read from the subject's side. Pure. */
export function cachedVerdict(
  rows: InferenceRow[],
  subjectId: string,
  subjectVersion: string,
  candidateId: string,
  candidateVersion: string,
): RelationVerdict | null {
  for (const row of rows) {
    if (row.issue_id === subjectId && row.candidate_id === candidateId &&
        row.issue_version === subjectVersion && row.candidate_version === candidateVersion) {
      return row.verdict;
    }
    if (row.issue_id === candidateId && row.candidate_id === subjectId &&
        row.issue_version === candidateVersion && row.candidate_version === subjectVersion) {
      return invertVerdict(row.verdict);
    }
  }
  return null;
}

export interface IssueAiPassResult {
  indexed: boolean;
  candidates: number;
  decided: number;
  applied: number;
  skipped?: string;
}

/**
 * The whole pass for one saved issue. Never throws: the issue is already
 * saved, and anything that fails here only means fewer suggestions.
 */
export async function runIssueAiPass(input: {
  issueId: string;
  projectId: string;
  projectName: string;
  payerId: string;
  inferRelations: boolean;
}): Promise<IssueAiPassResult> {
  const result: IssueAiPassResult = { indexed: false, candidates: 0, decided: 0, applied: 0 };
  try {
    const platform = await platformEnabled();
    if (!platform.indexing) return { ...result, skipped: "platform_disabled" };
    const access = await getProjectAccess(input.payerId, input.projectId);
    if (!access?.canWrite) return { ...result, skipped: "no_access" };
    // Preferences are read NOW, not when the work was queued: turning a
    // switch off cancels whatever has not run yet.
    const meta = await readMeta(input.payerId);
    if (!meta) return { ...result, skipped: "no_account" };
    let indexing = resolveIssueIndexing(meta);
    const relations = input.inferRelations && platform.relations && resolveSmartFillRelations(meta);

    const service = getServiceClient();
    const subject = await readIssue(service, input.issueId, input.projectId);
    if (!subject) return { ...result, skipped: "issue_gone" };
    const fingerprint = contentFingerprint(subject.title, subject.description);
    // The author's refusal of indexing holds even when someone else edits.
    if (indexing && subject.created_by && subject.created_by !== input.payerId) {
      const authorMeta = await readMeta(subject.created_by);
      if (authorMeta && !resolveIssueIndexing(authorMeta)) indexing = false;
    }
    if (!indexing && !relations) {
      await purgeStaleVectors(service, subject);
      return { ...result, skipped: "opted_out" };
    }

    // Indexing off still removes vectors of former text: no new vector is
    // created, but none may keep describing content the issue no longer has.
    if (!indexing) await purgeStaleVectors(service, subject);
    const indexed = indexing
      ? await indexIssues(service, input.projectId, input.payerId, [subject])
      : new Map<string, IssueEmbeddingRow>();
    const own = indexed.get(subject.id) ?? null;
    result.indexed = !!own;
    if (!relations) return result;

    // Pairs that already carry ANY relation, in either direction, are the
    // team's: Smart Fill neither duplicates nor reinterprets them.
    const existing = await listIssueRelations(service, input.projectId);
    if ("error" in existing) return { ...result, skipped: "relations_unavailable" };
    const linked = new Set<string>();
    for (const rel of existing.relations) {
      if (rel.source_id === subject.id) linked.add(rel.target_id);
      if (rel.target_id === subject.id) linked.add(rel.source_id);
    }

    // Vector neighbours in the SAME index version, then lexical ones for the
    // issues that version has not indexed (or for everything, without a vector).
    const neighbours: Neighbour[] = [];
    const vectorRows = new Map<string, IssueEmbeddingRow>();
    if (own) {
      const rows = await listProjectEmbeddings(service, input.projectId, own.index_version);
      for (const row of rows) vectorRows.set(row.issue_id, row);
      for (const n of rankVectorNeighbours(own.embedding, rows, subject.id)) {
        if (!linked.has(n.id)) neighbours.push({ ...n, version: vectorRows.get(n.id)?.content_version ?? null });
        if (neighbours.length >= NEIGHBOUR_POOL) break;
      }
    }
    const indexedIds = new Set(vectorRows.keys());
    if (neighbours.length < NEIGHBOUR_POOL) {
      neighbours.push(...await lexicalNeighbours(service, subject, new Set([...linked, ...indexedIds])));
    }
    if (neighbours.length === 0) return { ...result, skipped: "no_candidates" };

    const alive = await aliveCandidates(service, input.projectId, [...new Set(neighbours.map((n) => n.id))]);
    const history = await previousDecisions(service, subject.id, [...alive.keys()]);
    const dismissed = dismissedCandidates(subject.id, history);
    const chosen: { candidate: IssueContent; version: string; score: number }[] = [];
    const seen = new Set<string>();
    for (const n of neighbours) {
      const candidate = alive.get(n.id);
      if (!candidate || seen.has(n.id) || dismissed.has(n.id) || linked.has(n.id)) continue;
      seen.add(n.id);
      // A candidate whose vector predates its current text (edited without
      // reindexing: indexing off, repository sync, budget) gets a throwaway
      // version: no verdict cached on its former text is reused, and the new
      // verdict is never filed under the outdated version.
      const vector = vectorRows.get(n.id);
      const fresh = vector && vector.content_hash === contentFingerprint(candidate.title, candidate.description);
      chosen.push({ candidate, version: fresh ? vector.content_version : randomUUID(), score: n.score });
      if (chosen.length >= MAX_RELATION_CANDIDATES) break;
    }
    result.candidates = chosen.length;
    // No candidate, no decision, no charge.
    if (chosen.length === 0) return { ...result, skipped: "no_candidates" };

    const subjectVersion = own?.content_version ?? randomUUID();
    const verdicts = new Map<string, RelationVerdict>();
    const cachedIds = new Set<string>();
    const undecided: typeof chosen = [];
    for (const entry of chosen) {
      const cached = cachedVerdict(history, subject.id, subjectVersion, entry.candidate.id, entry.version);
      if (cached) {
        verdicts.set(entry.candidate.id, cached);
        cachedIds.add(entry.candidate.id);
      } else undecided.push(entry);
    }

    let engine: "model" | "llm" | null = null;
    if (undecided.length > 0) {
      if (!(await hasUsageBudget(input.payerId, "automations", "issue_relation_model"))) {
        return { ...result, skipped: "budget_exhausted" };
      }
      const candidates: RelationCandidate[] = undecided.map(({ candidate }) => ({
        id: candidate.id,
        reference: candidate.number != null ? `#${candidate.number}` : "an existing issue",
        title: candidate.title,
        description: candidate.description,
        status: candidate.status,
      }));
      const outcome = await runDecision(
        buildRelationSpec({
          projectName: input.projectName,
          subject: { title: subject.title, description: subject.description },
          candidates,
        }),
        { billTo: { userId: input.payerId }, projectId: input.projectId, subjectId: subject.id }
      );
      if (!outcome) return { ...result, skipped: "no_decision" };
      engine = outcome.engine;
      for (const [id, verdict] of relationVerdicts(outcome.answers, candidates)) {
        verdicts.set(id, verdict);
      }
      result.decided = undecided.length;
    }

    // The content may have changed while the engines answered: a decision
    // on former text is dropped, the edit's own pass decides again.
    const fresh = await readIssue(service, subject.id, input.projectId);
    if (!fresh || contentFingerprint(fresh.title, fresh.description) !== fingerprint) {
      return { ...result, skipped: "stale_content" };
    }

    // Relations are read again right before writing: one added meanwhile —
    // the creation dialog posts its chosen relations after the response, a
    // teammate links the pair — wins over the pass, and the cycle check sees
    // the current graph.
    const latest = await listIssueRelations(service, input.projectId);
    if ("error" in latest) return { ...result, skipped: "relations_unavailable" };
    for (const rel of latest.relations) {
      if (rel.source_id === subject.id) linked.add(rel.target_id);
      if (rel.target_id === subject.id) linked.add(rel.source_id);
    }
    const blockingEdges = latest.relations
      .filter((rel) => rel.type === "blocks")
      .map((rel) => ({ source_id: rel.source_id, target_id: rel.target_id }));
    const now = new Date().toISOString();
    const rows: Record<string, unknown>[] = [];
    for (const entry of chosen) {
      const verdict = verdicts.get(entry.candidate.id);
      if (!verdict) continue;
      let relationId: string | null = null;
      let appliedAt: string | null = null;
      const edge = storedBlockingEdge(subject.id, entry.candidate.id, verdict);
      if (
        verdict !== "none" &&
        !linked.has(entry.candidate.id) &&
        result.applied < MAX_APPLIED_RELATIONS &&
        !(edge && wouldCloseBlockingCycle(blockingEdges, edge.source_id, edge.target_id))
      ) {
        const added = await addIssueRelation({
          projectId: input.projectId,
          actorId: input.payerId,
          sourceId: subject.id,
          targetId: entry.candidate.id,
          type: verdict,
          viaSmartFill: true,
        });
        if (added.ok) {
          relationId = added.relation.id;
          appliedAt = now;
          result.applied++;
          if (edge) blockingEdges.push(edge);
        }
      }
      // New verdicts are cached for their content versions; a cached verdict
      // is rewritten only when it was applied now.
      // Rows under a throwaway version can never be a cache hit: they are
      // kept only when they carry an applied link (the dismissal memory).
      const reusable = entry.version === vectorRows.get(entry.candidate.id)?.content_version && !!own;
      if ((!cachedIds.has(entry.candidate.id) && reusable) || relationId) {
        rows.push({
          project_id: input.projectId,
          issue_id: subject.id,
          candidate_id: entry.candidate.id,
          issue_version: subjectVersion,
          candidate_version: entry.version,
          verdict,
          engine,
          relation_id: relationId,
          applied_at: appliedAt,
        });
      }
    }
    if (rows.length > 0) {
      const { error } = await service
        .from("issue_relation_inferences")
        .upsert(rows, {
          onConflict: "issue_id,candidate_id,issue_version,candidate_version",
          ignoreDuplicates: false,
        });
      if (error) console.error("[issue-relations] decision record failed");
    }
    return result;
  } catch {
    console.error("[issue-relations] pass failed: unexpected_error");
    return { ...result, skipped: "unexpected_error" };
  }
}

/**
 * Queue the pass after a creation or an edit. Resolves the payer from the
 * creation provenance (or the editor), applies the creation-scope rule of
 * Smart Fill to the relation half, and returns at once.
 */
export function scheduleIssueAiPass(input: {
  issueId: string;
  projectId: string;
  projectName: string | null;
  trigger: IssueAiTrigger;
  actorId: string | null;
  integrationId?: string | null;
  mcpKeyId?: string | null;
  status?: unknown;
  ownerBilledTriage?: boolean;
  /** The creation's explicit Smart Fill choice: `false` keeps relations manual. */
  explicit?: unknown;
}): void {
  afterOrNow(async () => {
    const account = await resolveCreationAccount({
      projectId: input.projectId,
      actorId: input.actorId,
      integrationId: input.integrationId ?? null,
      mcpKeyId: input.mcpKeyId ?? null,
      status: input.status,
      ownerBilledTriage: input.ownerBilledTriage,
    }).catch(() => null);
    if (!account) return;
    await runIssueAiPass({
      issueId: input.issueId,
      projectId: input.projectId,
      projectName: input.projectName ?? "this project",
      payerId: account.userId,
      inferRelations: relationScopeAllows(input.trigger, account.scope, account.meta, input.explicit, {
        ownerBilledTriage: input.ownerBilledTriage === true,
        actorId: input.actorId,
        payerId: account.userId,
      }),
    });
  });
}

/**
 * Whether the relation half may run for this trigger. A creation follows the
 * Smart Fill creation scopes: an explicit per-issue "off" always wins, and an
 * explicit "on" re-enables a disabled scope only for the payer's own choice —
 * a member promoting feedback into the owner's triage cannot override the
 * owner's refusal (the same rule as `resolveSmartFillPayer`). An edit follows
 * the relation switch alone. Pure.
 */
export function relationScopeAllows(
  trigger: IssueAiTrigger,
  scope: SmartFillScope,
  meta: Record<string, unknown>,
  explicit: unknown,
  provenance: { ownerBilledTriage?: boolean; actorId?: string | null; payerId?: string } = {},
): boolean {
  if (explicit === false || !resolveSmartFill(meta)) return false;
  if (trigger === "edited") return true;
  const canOverrideScope =
    explicit === true && (!provenance.ownerBilledTriage || provenance.actorId === provenance.payerId);
  return canOverrideScope || resolveSmartFillScope(meta, scope);
}

// ── Backfill ────────────────────────────────────────────────────────────────

const BACKFILL_CURSOR_KEY = "issue_index_backfill_cursor";

/**
 * Bounded, resumable indexing of existing issues — imports, issues created
 * before this feature, and issues of an index version an admin just replaced
 * — and the encryption catch-up of vectors stored in clear.
 * Walks the issues by id from a cursor kept in `app_config`, `limit` per run,
 * grouped per project and billed to the project OWNER (the backfill has no
 * other nameable trigger), under the owner's indexing preference and budget.
 * Up-to-date rows cost nothing; the walk wraps around once it reaches the end,
 * so after a model change the whole instance is reindexed one sweep later
 * (about issues / 100 hours), while new and edited issues get the new version
 * at once and the lexical fallback covers the rest. Never infers relations.
 */
export async function runIssueIndexBackfill(limit = 100): Promise<{
  scanned: number;
  indexed: number;
  reencoded: number;
  wrapped: boolean;
}> {
  // With the feature turned off, the walk still converts clear vectors to
  // encrypted ones; it only stops creating new vectors.
  const platform = await platformEnabled();
  const service = getServiceClient();
  const cfg = await getAppConfigValues([BACKFILL_CURSOR_KEY]).catch(() => ({}) as Record<string, string | null>);
  const cursor = cfg[BACKFILL_CURSOR_KEY] ?? "";
  let query = issueStore(service)
    .select("id, project_id, number, title, description, status, created_by")
    .is("deleted_at", null)
    .order("id", { ascending: true })
    .limit(limit);
  if (cursor) query = query.gt("id", cursor);
  const { data, error } = await query;
  if (error) throw new Error("Unable to read issues for indexing");
  const issues = (data ?? []) as IssueContent[];
  const wrapped = issues.length < limit;

  // Storage catch-up first, in every index version: vectors still in the
  // legacy float format are rewritten compactly, and vectors written in clear
  // before their project started encrypting are encrypted. No AI call, so
  // neither preferences nor budgets apply.
  let reencoded = 0;
  if (issues.length > 0) {
    for (const row of await listIssueEmbeddings(service, issues.map((issue) => issue.id))) {
      if ((row.stored_clear || row.stored_legacy_format) && (await rewriteStoredEmbedding(service, row))) {
        reencoded++;
      }
    }
  }

  const byProject = new Map<string, IssueContent[]>();
  for (const issue of issues) {
    const list = byProject.get(issue.project_id) ?? [];
    list.push(issue);
    byProject.set(issue.project_id, list);
  }
  // An author who refused indexing keeps that refusal in the backfill too,
  // even though the project owner pays for it.
  const creatorMeta = new Map<string, Record<string, unknown> | null>();
  const authorAllows = async (issue: IssueContent & { created_by?: string | null }) => {
    if (!issue.created_by) return true;
    if (!creatorMeta.has(issue.created_by)) creatorMeta.set(issue.created_by, await readMeta(issue.created_by));
    const meta = creatorMeta.get(issue.created_by);
    return !meta || resolveIssueIndexing(meta);
  };
  let indexed = 0;
  for (const [projectId, projectIssues] of platform.indexing ? byProject : new Map<string, IssueContent[]>()) {
    const { data: project } = await service
      .from("projects")
      .select("owner_id")
      .eq("id", projectId)
      .is("deleted_at", null)
      .maybeSingle();
    const ownerId = (project as { owner_id?: string } | null)?.owner_id;
    if (!ownerId) continue;
    const meta = await readMeta(ownerId);
    if (!meta || !resolveIssueIndexing(meta)) continue;
    const allowed: IssueContent[] = [];
    for (const issue of projectIssues) {
      if (await authorAllows(issue)) allowed.push(issue);
      else await purgeStaleVectors(service, issue);
    }
    if (allowed.length === 0) continue;
    const rows = await indexIssues(service, projectId, ownerId, allowed);
    indexed += rows.size;
  }
  const next = wrapped ? "" : issues[issues.length - 1]?.id ?? "";
  await setAppConfigValue(BACKFILL_CURSOR_KEY, next).catch(() =>
    console.error("[issue-index] cursor save failed")
  );
  return { scanned: issues.length, indexed, reencoded, wrapped };
}
