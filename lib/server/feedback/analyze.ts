import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getAppConfigValues } from "@/lib/server/app-config";
import {
  embedText,
  matchFeedbackPosts,
  toVectorLiteral,
  type MatchedPost,
} from "@/lib/server/embeddings";
import { mergePosts } from "@/lib/server/feedback/merge";

/**
 * Passe d'analyse IA horaire (MIN-37). Pour chaque post non analysé : backfill
 * d'embedding si besoin → préfiltre kNN pgvector → un appel LLM structuré
 * (deepseek-v4-flash, forced tool call comme smart-assign) qui décide si le
 * post exprime le MÊME besoin qu'un candidat → merge auto au-dessus du seuil
 * (undoable), suggestion entre les deux seuils.
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
const KNN_CANDIDATES = 8;
const MIN_CANDIDATE_SIMILARITY = 0.5;
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

export interface AnalysisReport {
  posts_analyzed: number;
  posts_merged: number;
  posts_suggested: number;
  failures: number;
}

export async function runFeedbackAnalysis(): Promise<AnalysisReport> {
  const report: AnalysisReport = {
    posts_analyzed: 0,
    posts_merged: 0,
    posts_suggested: 0,
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
        await bumpFailure(post.id, post.analysis_failures);
      }
    } catch (err) {
      console.error("[feedback-analyze] post failed:", (err as Error).message);
      report.failures += 1;
      await bumpFailure(post.id, post.analysis_failures);
    }
  }

  return report;
}

function parseFloatOr(value: string | null | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function bumpFailure(id: string, currentFailures: number): Promise<void> {
  // Le lease (analysis_claimed_at) reste posé : le retry attend le prochain
  // run horaire. À 3 échecs, la requête de claim ne sélectionne plus la ligne.
  const service = getServiceClient();
  await service
    .from("feedback_posts")
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

  const out = await analyzeWithLlm(ctx.model, post, candidates);
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

  if (out.action === "merge_into" && out.mergeTargetId) {
    if (out.confidence >= ctx.autoThreshold && fresh.issue_id === null) {
      const merged = await mergePosts({
        dupId: post.id,
        canonicalId: out.mergeTargetId,
        performedBy: "ai",
        confidence: out.confidence,
      });
      if (merged.ok) {
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

interface AnalyzeOutput {
  action: "merge_into" | "new_root";
  mergeTargetId: string | null;
  confidence: number;
}

async function analyzeWithLlm(
  model: string,
  post: ClaimedPost,
  candidates: MatchedPost[]
): Promise<AnalyzeOutput | null> {
  const candidateIds = candidates.map((c) => c.id);

  const systemPrompt = `You are the feedback analyst of a product feedback board.

You get ONE new post and up to ${KNN_CANDIDATES} existing candidate posts. Call analyze_feedback exactly once. Never reply in plain text.
- action "merge_into": the new post expresses the SAME underlying need as a candidate (wording, tone or language may differ). Set merge_target_id and confidence (0-1, your certainty that both express the same need). Minor differences in phrasing or execution detail are NOT grounds to keep posts separate.
- action "new_root": no candidate shares the need. confidence still reflects your certainty.`;

  const candidateBlocks = candidates
    .map(
      (c) =>
        `- post_id ${c.id} (similarity ${c.similarity.toFixed(2)})\n  Title: ${c.title}\n  Body: ${c.body.slice(0, BODY_TRUNCATE) || "(empty)"}`
    )
    .join("\n");

  const userMessage = `## New post
Title: ${post.submitted_title}
Body: ${post.submitted_body.slice(0, BODY_TRUNCATE) || "(empty)"}

## Candidates
${candidateBlocks || "(none)"}`;

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
    },
    required: ["action", "confidence"],
  };

  const args = await forcedToolCall(model, systemPrompt, userMessage, "analyze_feedback", parameters);
  if (!args) return null;

  const action = args.action === "merge_into" ? "merge_into" : "new_root";
  const target =
    typeof args.merge_target_id === "string" && candidateIds.includes(args.merge_target_id)
      ? args.merge_target_id
      : null;
  const confidence = clamp01(args.confidence);

  return {
    action: action === "merge_into" && target ? "merge_into" : "new_root",
    mergeTargetId: target,
    confidence,
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
