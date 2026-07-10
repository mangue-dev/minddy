import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getAppConfigValues } from "@/lib/server/app-config";
import {
  embedText,
  matchFeedbackFacets,
  matchFeedbackPosts,
  toVectorLiteral,
  type MatchedPost,
} from "@/lib/server/embeddings";
import { mergeFacets, mergePosts } from "@/lib/server/feedback/merge";

/**
 * Passe d'analyse IA horaire (MIN-37). Pour chaque post non analysé : backfill
 * d'embedding si besoin → préfiltre kNN pgvector → un appel LLM structuré
 * (deepseek-v4-flash, forced tool call comme smart-assign) qui applique le test
 * racine/facette → merge auto au-dessus du seuil (undoable), suggestion entre
 * les deux seuils, extraction/matching des facettes avec provenance. Les
 * facettes utilisateur passent par la même passe (dédup, racine déguisée).
 *
 * Concurrence : claim `for update skip locked` + lease de 15 min
 * (auto-guérissant si un run crashe) ; 3 échecs → abandon silencieux, le post
 * reste visible non enrichi. Le board n'est JAMAIS bloqué par cette passe.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";
const DEFAULT_AUTO_THRESHOLD = 0.92;
const DEFAULT_SUGGEST_FLOOR = 0.6;
const DEFAULT_BATCH_SIZE = 50;
const FACET_BATCH_SIZE = 100;
const KNN_CANDIDATES = 8;
const MIN_CANDIDATE_SIMILARITY = 0.5;
const MAX_FACETS_PER_CANDIDATE = 10;
const BODY_TRUNCATE = 1500;

interface ClaimedPost {
  id: string;
  project_id: string;
  author_id: string | null;
  submitted_title: string;
  submitted_body: string;
  embedding: unknown;
  analysis_failures: number;
}

interface ClaimedFacet {
  id: string;
  post_id: string;
  text: string;
  embedding: unknown;
  analysis_failures: number;
}

export interface AnalysisReport {
  posts_analyzed: number;
  posts_merged: number;
  posts_suggested: number;
  facets_created: number;
  facets_matched: number;
  user_facets_reviewed: number;
  user_facets_merged: number;
  user_facets_flagged: number;
  failures: number;
}

export async function runFeedbackAnalysis(): Promise<AnalysisReport> {
  const report: AnalysisReport = {
    posts_analyzed: 0,
    posts_merged: 0,
    posts_suggested: 0,
    facets_created: 0,
    facets_matched: 0,
    user_facets_reviewed: 0,
    user_facets_merged: 0,
    user_facets_flagged: 0,
    failures: 0,
  };

  const cfg = await getAppConfigValues([
    "feedback_analysis_model",
    "feedback_merge_auto_threshold",
    "feedback_merge_suggest_floor",
    "feedback_analysis_batch_size",
  ]);
  const model = cfg["feedback_analysis_model"]?.trim() || DEFAULT_MODEL;
  const autoThreshold = parseFloatOr(cfg["feedback_merge_auto_threshold"], DEFAULT_AUTO_THRESHOLD);
  const suggestFloor = parseFloatOr(cfg["feedback_merge_suggest_floor"], DEFAULT_SUGGEST_FLOOR);
  const batchSize = Math.max(1, Math.round(parseFloatOr(cfg["feedback_analysis_batch_size"], DEFAULT_BATCH_SIZE)));

  const service = getServiceClient();

  // ── Phase 1 : posts non analysés ────────────────────────────────────────
  const { data: claimedPosts, error: claimError } = await service.rpc(
    "claim_feedback_posts_for_analysis",
    { p_limit: batchSize }
  );
  if (claimError) {
    console.error("[feedback-analyze] claim failed:", claimError.message);
    return report;
  }

  for (const post of (claimedPosts ?? []) as ClaimedPost[]) {
    try {
      const ok = await analyzePost(post, { model, autoThreshold, suggestFloor, report });
      if (!ok) {
        report.failures += 1;
        await bumpFailure("feedback_posts", post.id, post.analysis_failures);
      }
    } catch (err) {
      console.error("[feedback-analyze] post failed:", (err as Error).message);
      report.failures += 1;
      await bumpFailure("feedback_posts", post.id, post.analysis_failures);
    }
  }

  // ── Phase 2 : validation des facettes utilisateur ───────────────────────
  const { data: claimedFacets } = await service.rpc("claim_feedback_facets_for_analysis", {
    p_limit: FACET_BATCH_SIZE,
  });
  for (const facet of (claimedFacets ?? []) as ClaimedFacet[]) {
    try {
      const ok = await reviewUserFacet(facet, { model, autoThreshold, report });
      if (!ok) {
        report.failures += 1;
        await bumpFailure("feedback_facets", facet.id, facet.analysis_failures);
      }
    } catch (err) {
      console.error("[feedback-analyze] facet failed:", (err as Error).message);
      report.failures += 1;
      await bumpFailure("feedback_facets", facet.id, facet.analysis_failures);
    }
  }

  return report;
}

function parseFloatOr(value: string | null | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function bumpFailure(
  table: "feedback_posts" | "feedback_facets",
  id: string,
  currentFailures: number
): Promise<void> {
  // Le lease (analysis_claimed_at) reste posé : le retry attend le prochain
  // run horaire. À 3 échecs, la requête de claim ne sélectionne plus la ligne.
  const service = getServiceClient();
  await service
    .from(table)
    .update({ analysis_failures: currentFailures + 1 })
    .eq("id", id);
}

/** Paires interdites (undo / suggestions rejetées), dans les deux sens. */
async function fetchRejectedPairIds(itemId: string): Promise<Set<string>> {
  const service = getServiceClient();
  const [asDup, asCanonical] = await Promise.all([
    service.from("feedback_merge_rejections").select("canonical_id").eq("dup_id", itemId),
    service.from("feedback_merge_rejections").select("dup_id").eq("canonical_id", itemId),
  ]);
  return new Set([
    ...((asDup.data ?? []).map((r) => r.canonical_id as string)),
    ...((asCanonical.data ?? []).map((r) => r.dup_id as string)),
  ]);
}

// ── Phase 1 : un post ─────────────────────────────────────────────────────────

interface CandidateFacet {
  id: string;
  post_id: string;
  text: string;
  vote_count: number;
}

async function analyzePost(
  post: ClaimedPost,
  ctx: {
    model: string;
    autoThreshold: number;
    suggestFloor: number;
    report: AnalysisReport;
  }
): Promise<boolean> {
  const service = getServiceClient();

  // Backfill de l'embedding si la soumission n'avait pas pu le calculer.
  let embedding: number[] | null = null;
  if (post.embedding) {
    embedding = parseEmbedding(post.embedding);
  }
  if (!embedding) {
    embedding = await embedText(
      post.submitted_body
        ? `${post.submitted_title}\n\n${post.submitted_body}`
        : post.submitted_title
    );
    if (!embedding) return false;
    await service
      .from("feedback_posts")
      .update({ embedding: toVectorLiteral(embedding) })
      .eq("id", post.id);
  }

  const rejected = await fetchRejectedPairIds(post.id);
  const candidates = (
    await matchFeedbackPosts({
      projectId: post.project_id,
      embedding,
      exclude: post.id,
      limit: KNN_CANDIDATES,
    })
  ).filter((c) => c.similarity >= MIN_CANDIDATE_SIMILARITY && !rejected.has(c.id));

  const candidateFacets: CandidateFacet[] = [];
  if (candidates.length > 0) {
    const { data } = await service
      .from("feedback_facets")
      .select("id, post_id, text, vote_count")
      .in("post_id", candidates.map((c) => c.id))
      .is("merged_into_id", null)
      .order("vote_count", { ascending: false });
    const perPost = new Map<string, number>();
    for (const row of (data ?? []) as CandidateFacet[]) {
      const count = perPost.get(row.post_id) ?? 0;
      if (count >= MAX_FACETS_PER_CANDIDATE) continue;
      perPost.set(row.post_id, count + 1);
      candidateFacets.push(row);
    }
  }

  const out = await analyzeWithLlm(ctx.model, post, candidates, candidateFacets);
  if (!out) return false;

  // Garde de course : l'équipe a pu merger/traiter le post pendant l'appel.
  const { data: fresh } = await service
    .from("feedback_posts")
    .select("id, merged_into_id, analyzed_at, issue_id, author_id")
    .eq("id", post.id)
    .maybeSingle();
  if (!fresh || fresh.merged_into_id !== null || fresh.analyzed_at !== null) {
    return true;
  }

  let rootId = post.id;
  if (out.action === "merge_into" && out.mergeTargetId) {
    if (out.confidence >= ctx.autoThreshold && fresh.issue_id === null) {
      const merged = await mergePosts({
        dupId: post.id,
        canonicalId: out.mergeTargetId,
        performedBy: "ai",
        confidence: out.confidence,
      });
      if (merged.ok) {
        rootId = out.mergeTargetId;
        ctx.report.posts_merged += 1;
      } else {
        // La RPC a refusé (état déplacé sous nos pieds) → suggestion.
        await suggest(post.id, out.mergeTargetId, out.confidence);
        ctx.report.posts_suggested += 1;
      }
    } else if (out.confidence >= ctx.suggestFloor) {
      await suggest(post.id, out.mergeTargetId, out.confidence);
      ctx.report.posts_suggested += 1;
    }
  }

  // Facettes : matchées (provenance + voix implicite de l'auteur) ou créées.
  const shownFacetIds = new Set(candidateFacets.map((f) => f.id));
  for (const facet of out.facets) {
    if (facet.matchFacetId && shownFacetIds.has(facet.matchFacetId)) {
      await attachExistingFacet(facet.matchFacetId, post.id, post.author_id);
      ctx.report.facets_matched += 1;
    } else if (facet.text) {
      await createAiFacet(rootId, facet.text, post.id, post.author_id);
      ctx.report.facets_created += 1;
    }
  }

  await service
    .from("feedback_posts")
    .update({ analyzed_at: new Date().toISOString(), analysis_claimed_at: null })
    .eq("id", post.id);
  ctx.report.posts_analyzed += 1;
  return true;
}

async function suggest(postId: string, targetId: string, confidence: number): Promise<void> {
  const service = getServiceClient();
  await service
    .from("feedback_posts")
    .update({ suggested_merge_into_id: targetId, suggested_confidence: confidence })
    .eq("id", postId)
    .is("merged_into_id", null);
}

async function attachExistingFacet(
  facetId: string,
  sourcePostId: string,
  authorId: string | null
): Promise<void> {
  const service = getServiceClient();
  await service
    .from("feedback_facet_sources")
    .upsert(
      { facet_id: facetId, post_id: sourcePostId },
      { onConflict: "facet_id,post_id", ignoreDuplicates: true }
    );
  if (!authorId) return;
  // L'auteur du post soutient implicitement la contrainte qu'il a exprimée.
  const { data: facet } = await service
    .from("feedback_facets")
    .select("post_id")
    .eq("id", facetId)
    .maybeSingle();
  if (!facet) return;
  await service
    .from("feedback_votes")
    .upsert(
      { post_id: facet.post_id as string, user_id: authorId },
      { onConflict: "post_id,user_id", ignoreDuplicates: true }
    );
  await service
    .from("feedback_facet_votes")
    .upsert(
      { facet_id: facetId, user_id: authorId },
      { onConflict: "facet_id,user_id", ignoreDuplicates: true }
    );
}

async function createAiFacet(
  rootPostId: string,
  text: string,
  sourcePostId: string,
  authorId: string | null
): Promise<void> {
  const service = getServiceClient();
  const embedding = await embedText(text);
  const { data: facet, error } = await service
    .from("feedback_facets")
    .insert({
      post_id: rootPostId,
      text: text.slice(0, 200),
      source: "ai",
      analyzed_at: new Date().toISOString(),
      embedding: embedding ? toVectorLiteral(embedding) : null,
    })
    .select("id")
    .maybeSingle();
  if (error || !facet) return;
  await service
    .from("feedback_facet_sources")
    .upsert(
      { facet_id: facet.id as string, post_id: sourcePostId },
      { onConflict: "facet_id,post_id", ignoreDuplicates: true }
    );
  if (!authorId) return;
  await service
    .from("feedback_votes")
    .upsert(
      { post_id: rootPostId, user_id: authorId },
      { onConflict: "post_id,user_id", ignoreDuplicates: true }
    );
  await service
    .from("feedback_facet_votes")
    .upsert(
      { facet_id: facet.id as string, user_id: authorId },
      { onConflict: "facet_id,user_id", ignoreDuplicates: true }
    );
}

// ── Phase 2 : une facette utilisateur ────────────────────────────────────────

async function reviewUserFacet(
  facet: ClaimedFacet,
  ctx: { model: string; autoThreshold: number; report: AnalysisReport }
): Promise<boolean> {
  const service = getServiceClient();

  const { data: post } = await service
    .from("feedback_posts")
    .select("id, title, body")
    .eq("id", facet.post_id)
    .maybeSingle();
  if (!post) return true; // post disparu — rien à faire

  let embedding: number[] | null = facet.embedding ? parseEmbedding(facet.embedding) : null;
  if (!embedding) {
    embedding = await embedText(facet.text);
    if (!embedding) return false;
    await service
      .from("feedback_facets")
      .update({ embedding: toVectorLiteral(embedding) })
      .eq("id", facet.id);
  }

  const rejected = await fetchRejectedPairIds(facet.id);
  const candidates = (
    await matchFeedbackFacets({
      postId: facet.post_id,
      embedding,
      exclude: facet.id,
      limit: 5,
    })
  ).filter((c) => c.similarity >= MIN_CANDIDATE_SIMILARITY && !rejected.has(c.id));

  const out = await reviewFacetWithLlm(ctx.model, post, facet, candidates);
  if (!out) return false;

  if (out.verdict === "duplicate_of" && out.duplicateFacetId && out.confidence >= ctx.autoThreshold) {
    const merged = await mergeFacets({
      dupId: facet.id,
      canonicalId: out.duplicateFacetId,
      performedBy: "ai",
      confidence: out.confidence,
    });
    if (merged.ok) ctx.report.user_facets_merged += 1;
  } else if (out.verdict === "root_disguised") {
    await service
      .from("feedback_facets")
      .update({ review_flag: "root_disguised" })
      .eq("id", facet.id);
    ctx.report.user_facets_flagged += 1;
  }

  await service
    .from("feedback_facets")
    .update({ analyzed_at: new Date().toISOString(), analysis_claimed_at: null })
    .eq("id", facet.id);
  ctx.report.user_facets_reviewed += 1;
  return true;
}

// ── LLM (forced tool call, pattern smart-assign) ─────────────────────────────

function parseEmbedding(value: unknown): number[] | null {
  if (Array.isArray(value) && value.every((v) => typeof v === "number")) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === "number")) {
        return parsed as number[];
      }
    } catch {
      return null;
    }
  }
  return null;
}

const ROOT_FACET_RAZOR = `Feedback posts are decomposed into a canonical layer: one ROOT need plus votable FACETS.
- A ROOT is a complete, self-contained user need that could be voted for on its own.
- A FACET is an execution constraint or modality that presupposes a root ("but offline", "as a keyboard shortcut", "per project, not global").
The test: a facet has no meaning without its root; a root remains complete without its facets. A "detail" that makes sense on its own is a separate root, not a facet.`;

interface AnalyzeOutput {
  action: "merge_into" | "new_root";
  mergeTargetId: string | null;
  confidence: number;
  facets: { matchFacetId: string | null; text: string }[];
}

async function analyzeWithLlm(
  model: string,
  post: ClaimedPost,
  candidates: MatchedPost[],
  candidateFacets: CandidateFacet[]
): Promise<AnalyzeOutput | null> {
  const candidateIds = candidates.map((c) => c.id);
  const facetIds = candidateFacets.map((f) => f.id);

  const systemPrompt = `You are the feedback analyst of a product feedback board.
${ROOT_FACET_RAZOR}

You get ONE new post and up to ${KNN_CANDIDATES} existing candidate posts with their facets. Call analyze_feedback exactly once. Never reply in plain text.
- action "merge_into": the new post expresses the SAME root need as a candidate (wording, tone or language may differ). Set merge_target_id and confidence (0-1, your certainty that both express the same root need). Facet-level differences are NOT grounds to keep posts separate — extract them as facets instead.
- action "new_root": no candidate shares the root need. confidence still reflects your certainty.
- facets: extract every execution constraint present in the new post's own text. Reuse an existing facet id (match_facet_id) when it is the same constraint in different words; otherwise provide concise text (max 80 chars, same language as the post). Never invent constraints absent from the text; a post without constraints has zero facets. Examples, greetings and politeness are not facets.`;

  const candidateBlocks = candidates
    .map((c) => {
      const facets = candidateFacets
        .filter((f) => f.post_id === c.id)
        .map((f) => `  - facet_id ${f.id}: ${f.text} (${f.vote_count} votes)`)
        .join("\n");
      return `- post_id ${c.id} (similarity ${c.similarity.toFixed(2)})\n  Title: ${c.title}\n  Body: ${c.body.slice(0, BODY_TRUNCATE) || "(empty)"}${facets ? `\n${facets}` : ""}`;
    })
    .join("\n");

  const userMessage = `## New post
Title: ${post.submitted_title}
Body: ${post.submitted_body.slice(0, BODY_TRUNCATE) || "(empty)"}

## Candidates
${candidateBlocks || "(none)"}`;

  const facetItemSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      match_facet_id: facetIds.length > 0 ? { type: ["string", "null"], enum: [...facetIds, null] } : { type: "null" },
      text: { type: "string" },
    },
    required: ["match_facet_id", "text"],
  };
  const parameters: Record<string, unknown> = {
    type: "object",
    properties: {
      action:
        candidateIds.length > 0
          ? { type: "string", enum: ["merge_into", "new_root"] }
          : { type: "string", enum: ["new_root"] },
      ...(candidateIds.length > 0
        ? { merge_target_id: { type: ["string", "null"], enum: [...candidateIds, null] } }
        : {}),
      confidence: { type: "number", minimum: 0, maximum: 1 },
      facets: { type: "array", items: facetItemSchema },
    },
    required: ["action", "confidence", "facets"],
  };

  const args = await forcedToolCall(model, systemPrompt, userMessage, "analyze_feedback", parameters);
  if (!args) return null;

  const action = args.action === "merge_into" ? "merge_into" : "new_root";
  const target =
    typeof args.merge_target_id === "string" && candidateIds.includes(args.merge_target_id)
      ? args.merge_target_id
      : null;
  const confidence = clamp01(args.confidence);
  const facetsRaw = Array.isArray(args.facets) ? args.facets : [];
  const facets = facetsRaw
    .map((f) => {
      const item = f as Record<string, unknown>;
      const matchId =
        typeof item.match_facet_id === "string" && facetIds.includes(item.match_facet_id)
          ? item.match_facet_id
          : null;
      const text = typeof item.text === "string" ? item.text.trim() : "";
      return { matchFacetId: matchId, text };
    })
    .filter((f) => f.matchFacetId || f.text)
    .slice(0, 10);

  return {
    action: action === "merge_into" && target ? "merge_into" : "new_root",
    mergeTargetId: target,
    confidence,
    facets,
  };
}

interface ReviewOutput {
  verdict: "ok" | "duplicate_of" | "root_disguised";
  duplicateFacetId: string | null;
  confidence: number;
}

async function reviewFacetWithLlm(
  model: string,
  post: { title: string; body: string },
  facet: ClaimedFacet,
  candidates: { id: string; facet_text: string }[]
): Promise<ReviewOutput | null> {
  const candidateIds = candidates.map((c) => c.id);

  const systemPrompt = `You review ONE user-submitted facet of a feedback post.
${ROOT_FACET_RAZOR}

Call review_facet exactly once. Never reply in plain text.
- "duplicate_of": the facet expresses the same constraint as an existing facet (set duplicate_facet_id).
- "root_disguised": the facet is actually a self-contained need that deserves its own post.
- "ok": a genuine, new facet of this root.
confidence is 0-1.`;

  const userMessage = `## Root post
Title: ${post.title}
Body: ${post.body.slice(0, BODY_TRUNCATE) || "(empty)"}

## Facet under review
${facet.text}

## Existing facets on this post
${candidates.map((c) => `- facet_id ${c.id}: ${c.facet_text}`).join("\n") || "(none)"}`;

  const parameters: Record<string, unknown> = {
    type: "object",
    properties: {
      verdict:
        candidateIds.length > 0
          ? { type: "string", enum: ["ok", "duplicate_of", "root_disguised"] }
          : { type: "string", enum: ["ok", "root_disguised"] },
      ...(candidateIds.length > 0
        ? { duplicate_facet_id: { type: ["string", "null"], enum: [...candidateIds, null] } }
        : {}),
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
    required: ["verdict", "confidence"],
  };

  const args = await forcedToolCall(model, systemPrompt, userMessage, "review_facet", parameters);
  if (!args) return null;

  const verdict =
    args.verdict === "duplicate_of" || args.verdict === "root_disguised" ? args.verdict : "ok";
  const dupId =
    typeof args.duplicate_facet_id === "string" && candidateIds.includes(args.duplicate_facet_id)
      ? args.duplicate_facet_id
      : null;
  return {
    verdict: verdict === "duplicate_of" && !dupId ? "ok" : verdict,
    duplicateFacetId: dupId,
    confidence: clamp01(args.confidence),
  };
}

function clamp01(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(1, Math.max(0, parsed));
}

/** Un appel OpenRouter à sortie forcée (tools + tool_choice), parse + retour
    null sur le moindre échec — même contrat que smart-assign. */
async function forcedToolCall(
  model: string,
  systemPrompt: string,
  userMessage: string,
  toolName: string,
  parameters: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://minddy.app",
        "X-Title": "Feedback Analysis (minddy)",
      },
      body: JSON.stringify({
        model,
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
        max_tokens: 1024,
      }),
      signal: AbortSignal.timeout(45_000),
    });
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
    };
    const call = data.choices?.[0]?.message?.tool_calls?.[0]?.function;
    if (call?.name !== toolName) return null;
    return JSON.parse(call.arguments || "{}") as Record<string, unknown>;
  } catch (err) {
    console.error("[feedback-analyze] LLM call failed:", (err as Error).message);
    return null;
  }
}
