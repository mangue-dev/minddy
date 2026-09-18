import "server-only";

import { fetchAiProvider } from "@/lib/server/ai-provider-request";
import {
  parseOpenRouterUsage,
  recordAiUsage,
  type AiUsageBillTo,
  type OpenRouterUsage,
} from "@/lib/server/ai-usage";
import { DEFAULT_AGENT_PROVIDER, resolveProviderBaseUrl } from "@/lib/agent-providers";
import { getUserByok } from "@/lib/server/agent/model";
import { isManagedAiEnabled } from "@/lib/managed-services";
import { resolveConfiguredModel } from "@/lib/server/model-config";
import { getServiceClient } from "@/lib/supabase-service";
import { clamp01, type DecisionAnswers, type DecisionSpec } from "@/lib/server/decisions/types";

/**
 * The Jev adapter of the decision layer (MIN-562) — transport to
 * `typesafe/jev-1.13` through OpenRouter's dedicated decisions endpoint, as
 * verified live in MIN-561 (see docs/plans/min-561-jev-prerequisites.md).
 *
 * The endpoint is NOT chat/completions: the body is the native TypeSafe
 * `{ state, model, questions }` and the URL is the origin of the resolved
 * base URL + `/api/alpha/decisions`. The same Bearer key applies, the same
 * SSRF-validated fetch (`fetchAiProvider`) carries it, and the response
 * already reports a computed `usage.cost` (input tokens only — output is
 * free) plus a `gen-dec-…` generation id usable as ledger idempotency.
 *
 * Contract: ONE call, no retry ever (the runner's fallback REPLACES the
 * retry), short timeout. Every answer is parsed and validated against the
 * spec — a response that is malformed, incomplete or carries an unknown
 * value makes the adapter return `null`, which the runner reads as "Jev
 * unavailable" and falls back to the LLM. Jev is never trusted blindly, not
 * even when the JSON happens to type-check.
 */

/** Someone may be waiting in front of their screen: announced latency is
 * 70–500 ms, the ceiling absorbs a cold start without ever resembling a
 * retry window. */
const JEV_TIMEOUT_MS = 5_000;

/** The decisions path, resolved from the configured base URL's origin —
 * `chatCompletionsUrl()` appends `/chat/completions` and must NOT be reused. */
export function decisionsUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.pathname = "/api/alpha/decisions";
  url.search = "";
  url.hash = "";
  return url.toString();
}

/** Billing context shared by both engines of one decision. */
export interface DecisionCallContext {
  /** One decision = one ledger run: the runner mints it, both engines use it. */
  runId: string;
  /** Position of this call in the run (Jev first, LLM second on fallback). */
  seq?: number;
  billTo: AiUsageBillTo;
  projectId?: string | null;
}

/**
 * Who pays decides whose key carries the call, as everywhere else
 * (`forcedToolCall`). Jev only exists on OpenRouter, so an OpenRouter BYOK
 * key serves the decision when the payer has one; every other case (no BYOK,
 * a native-provider BYOK that cannot reach the decisions endpoint) falls to
 * the platform key. The MODEL is never a per-surface choice: the runner
 * reads `jev_model`.
 */
async function resolveJevApiKey(billTo: AiUsageBillTo): Promise<{
  apiKey: string;
  baseUrl: string;
  keyMode: "platform" | "byok";
} | null> {
  let billedUserId: string | null = null;
  if ("userId" in billTo) billedUserId = billTo.userId || null;
  else if ("projectOwner" in billTo) {
    const { data } = await getServiceClient()
      .from("projects")
      .select("owner_id")
      .eq("id", billTo.projectOwner)
      .maybeSingle();
    billedUserId = (data as { owner_id?: string } | null)?.owner_id ?? null;
  }
  if (billedUserId) {
    const byok = await getUserByok(billedUserId).catch(() => null);
    if (byok && byok.provider === "openrouter" && byok.apiKey) {
      return { apiKey: byok.apiKey, baseUrl: byok.baseUrl, keyMode: "byok" };
    }
  }
  if (isManagedAiEnabled() && process.env.OPENROUTER_API_KEY) {
    const baseUrl = resolveProviderBaseUrl(DEFAULT_AGENT_PROVIDER);
    if (!baseUrl) return null;
    return { apiKey: process.env.OPENROUTER_API_KEY, baseUrl, keyMode: "platform" };
  }
  return null;
}

// ── Wire mapping: DecisionQuestion → native questions, and back ──────────────

type JevQuestion =
  | { type: "choice"; criteria: Record<string, string> }
  | { type: "noul" }
  | { type: "score"; levels: { value: number; label: string }[] };

/**
 * Multi-choice does not exist natively: Jev evaluates every question
 * independently against the same state, so a multi_choice becomes ONE
 * `noul` per option, keyed `<key>:<value>`. The option values are
 * guaranteed separator-free (`validateDecisionSpec`), so the prefix split
 * on the way back is unambiguous.
 */
export function expandJevQuestions(spec: DecisionSpec): Record<string, JevQuestion> {
  const questions: Record<string, JevQuestion> = {};
  const describe = (label: string, description?: string): string =>
    description ? `${label} — ${description}` : label;
  for (const question of spec.questions) {
    switch (question.kind) {
      case "single_choice":
        questions[question.key] = {
          type: "choice",
          criteria: Object.fromEntries(
            question.options.map((o) => [o.value, describe(o.label, o.description)])
          ),
        };
        break;
      case "multi_choice":
        for (const option of question.options) {
          questions[`${question.key}:${option.value}`] = { type: "noul" };
        }
        break;
      case "boolean":
        questions[question.key] = { type: "noul" };
        break;
      case "score":
        questions[question.key] = {
          type: "score",
          levels: question.levels.map((l) => ({ value: l.value, label: l.label })),
        };
        break;
    }
  }
  return questions;
}

/**
 * A noul verdict's own confidence: the engine returns P(yes) and nothing
 * else, so "confident" means far from the 0.5 edge in EITHER direction.
 */
function noulConfidence(p: number): number {
  return p >= 0.5 ? p : 1 - p;
}

/** The wire answers, keyed like the questions we sent (multi_choice spread
 * over its `<key>:<value>` noul questions). Parsed tolerantly on the
 * envelope, strictly on every value. */
export function parseJevAnswers(
  spec: DecisionSpec,
  data: unknown
): { answers: DecisionAnswers } | { error: string } {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { error: "response is not an object" };
  }
  const envelope = data as Record<string, unknown>;
  const candidate =
    envelope.answers && typeof envelope.answers === "object" && !Array.isArray(envelope.answers)
      ? envelope.answers
      : envelope.questions && typeof envelope.questions === "object" && !Array.isArray(envelope.questions)
        ? envelope.questions
        : null;
  if (!candidate) {
    // Only the shape is logged — the state carries user content.
    return { error: `no answers object in response (keys: ${Object.keys(envelope).join(", ")})` };
  }
  const raw = candidate as Record<string, unknown>;
  const answers: DecisionAnswers = {};
  for (const question of spec.questions) {
    switch (question.kind) {
      case "single_choice": {
        const parsed = parseChoiceAnswer(raw[question.key], question.options.map((o) => o.value));
        if (!parsed) return { error: `question ${question.key}: missing or invalid choice answer` };
        answers[question.key] = parsed;
        break;
      }
      case "boolean": {
        const p = parseNoulAnswer(raw[question.key]);
        if (p === null) return { error: `question ${question.key}: missing or invalid noul answer` };
        answers[question.key] = {
          value: p >= 0.5,
          probability: p,
          confidence: noulConfidence(p),
        };
        break;
      }
      case "score": {
        const parsed = parseScoreAnswer(raw[question.key], question.levels.map((l) => l.value));
        if (!parsed) return { error: `question ${question.key}: missing or invalid score answer` };
        answers[question.key] = parsed;
        break;
      }
      case "multi_choice": {
        const picked: { value: string; p: number }[] = [];
        for (const option of question.options) {
          const p = parseNoulAnswer(raw[`${question.key}:${option.value}`]);
          if (p === null) {
            return { error: `question ${question.key}: missing noul answer for option ${option.value}` };
          }
          if (p >= 0.5) picked.push({ value: option.value, p });
        }
        // Most probable first, capped at the builder's cardinality.
        picked.sort((a, b) => b.p - a.p);
        const selected = picked.slice(0, question.maxSelections).map((e) => e.value);
        // Confidence of the whole set: the weakest verdict, picked or
        // discarded — a borderline no is as much a decision as a yes.
        const allP = question.options.map(
          (o) => parseNoulAnswer(raw[`${question.key}:${o.value}`]) ?? 0
        );
        const confidence = allP.length
          ? Math.min(...allP.map((p) => noulConfidence(p)))
          : 0;
        answers[question.key] = {
          value: selected,
          probability: picked[0]?.p ?? null,
          confidence,
        };
        break;
      }
    }
  }
  return { answers };
}

function parseChoiceAnswer(
  raw: unknown,
  allowed: string[]
): { value: string; probability: number | null; confidence: number | null } | null {
  // Tolerant on the envelope: `{ choice, probabilities, confidence }` as
  // observed live (MIN-561), or the bare value.
  let value: unknown = raw;
  let probability: number | null = null;
  let confidence: number | null = null;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    value = record.choice;
    if (record.probabilities && typeof record.probabilities === "object") {
      const probabilities = record.probabilities as Record<string, unknown>;
      const p = clamp01(probabilities[String(value)]);
      if (p !== null) probability = p;
    }
    confidence = clamp01(record.confidence);
  }
  if (typeof value !== "string" || !allowed.includes(value)) return null;
  return { value, probability, confidence: confidence ?? 0 };
}

function parseNoulAnswer(raw: unknown): number | null {
  if (typeof raw === "number") return clamp01(raw);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return clamp01((raw as Record<string, unknown>).noul);
  }
  return null;
}

function parseScoreAnswer(
  raw: unknown,
  allowed: number[]
): { value: number; probability: number | null; confidence: number | null } | null {
  let value: unknown = raw;
  let probability: number | null = null;
  let confidence: number | null = null;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    value = record.score;
    if (record.probabilities && typeof record.probabilities === "object") {
      const probabilities = record.probabilities as Record<string, unknown>;
      const p = clamp01(probabilities[String(value)]);
      if (p !== null) probability = p;
    }
    confidence = clamp01(record.confidence);
  }
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number.parseFloat(value)
        : Number.NaN;
  if (!Number.isFinite(parsed) || !allowed.includes(parsed)) return null;
  return { value: parsed, probability, confidence: confidence ?? 0 };
}

/**
 * One Jev decision: resolve `jev_model`, build the native body, call,
 * validate, record. `null` on every failure — missing key, HTTP error,
 * timeout, crooked JSON, one answer missing or out of vocabulary — never an
 * exception, never a retry.
 */
export async function runJevDecision(
  spec: DecisionSpec,
  ctx: DecisionCallContext
): Promise<DecisionAnswers | null> {
  const key = await resolveJevApiKey(ctx.billTo);
  if (!key) return null;
  const { model } = await resolveConfiguredModel("jev_model");
  try {
    const response = await fetchAiProvider("openrouter", decisionsUrl(key.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        state: spec.state,
        questions: expandJevQuestions(spec),
      }),
      signal: AbortSignal.timeout(JEV_TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error(`[decisions-jev] HTTP ${response.status}: ${detail.slice(0, 200)}`);
      return null;
    }
    const data = (await response.json()) as {
      model?: string;
      id?: string;
      usage?: OpenRouterUsage;
    };
    const u = parseOpenRouterUsage(data.usage);
    await recordAiUsage({
      runId: ctx.runId,
      seq: ctx.seq ?? 0,
      feature: "jev_decision",
      provider: "openrouter",
      keyMode: key.keyMode,
      model: data.model ?? model,
      generationId: data.id ?? null,
      promptTokens: u.promptTokens,
      completionTokens: u.completionTokens,
      totalTokens: u.totalTokens,
      cost: u.cost,
      billTo: ctx.billTo,
      projectId: ctx.projectId ?? null,
    });
    const parsed = parseJevAnswers(spec, data);
    if ("error" in parsed) {
      console.error(`[decisions-jev] invalid response: ${parsed.error}`);
      return null;
    }
    return parsed.answers;
  } catch (err) {
    console.error(`[decisions-jev] call failed:`, (err as Error).message);
    return null;
  }
}
