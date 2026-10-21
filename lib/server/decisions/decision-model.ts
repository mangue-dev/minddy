import "server-only";

import { fetchAiProvider } from "@/lib/server/ai-provider-request";
import {
  parseOpenRouterUsage,
  recordAiUsage,
  type AiFeature,
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
 * The decision-model adapter of the decision layer (MIN-562, generalized by
 * MIN-694) — transport to the ONE decision model configured for the whole
 * instance (`jev_model`, the historical key name kept so existing choices and
 * encrypted `app_config` rows carry over) through OpenRouter's dedicated
 * decisions endpoint. Jev (`typesafe/jev-1.13`) stays the default; any model
 * OpenRouter publishes with the `decisions` output modality AND that passes
 * the compatibility check on save (`probeDecisionModel`) can replace it.
 *
 * The endpoint is NOT chat/completions: the body is the System One
 * `{ state, model, questions }` and the URL is the origin of the resolved
 * base URL + `/api/alpha/decisions`. The same Bearer key applies, the same
 * SSRF-validated fetch (`fetchAiProvider`) carries it, and the response
 * reports a computed `usage.cost` plus a `gen-dec-…` generation id usable as
 * ledger idempotency, and the versioned model that actually answered.
 *
 * Contract: ONE call, no retry ever (the runner's fallback REPLACES the
 * retry), short timeout. Every answer is parsed and validated against the
 * spec — a response that is malformed, incomplete or carries an unknown
 * value makes the adapter fail, which the runner reads as "decision model
 * unavailable" and falls back to the LLM. A decision model is never trusted
 * blindly, not even when the JSON happens to type-check.
 */

/** Someone may be waiting in front of their screen: Jev's announced latency
 * is 70–500 ms, the ceiling absorbs a cold start without ever resembling a
 * retry window. The same budget applies to every decision model, and the
 * compatibility check refuses a model that cannot answer within it. */
export const DECISION_MODEL_TIMEOUT_MS = 5_000;

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
  /** Position of this call in the run (decision model first, LLM second on fallback). */
  seq?: number;
  billTo: AiUsageBillTo;
  projectId?: string | null;
  /**
   * Ledger feature of THIS call, when it must not read as the use case's
   * pass — the shadow replay (MIN-567) bills under `jev_shadow` (historical
   * ledger id of the decision check), so the sampling delta stays separable
   * from the real LLM passes in finance.
   */
  feature?: AiFeature;
}

/**
 * Who pays decides whose key carries the call, as everywhere else
 * (`forcedToolCall`). Decision models only exist on OpenRouter, so an
 * OpenRouter BYOK key serves the decision when the payer has one; every other
 * case (no BYOK, a native-provider BYOK that cannot reach the decisions
 * endpoint, a platform-paid call) falls to the platform key. The MODEL is
 * never a per-surface, per-project or per-user choice: every call reads the
 * one global `jev_model` setting.
 */
async function resolveDecisionApiKey(billTo: AiUsageBillTo): Promise<{
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

type WireQuestion =
  | { type: "choice"; criteria: Record<string, string>; instructions: string }
  | { type: "noul"; instructions: string }
  | { type: "score"; criteria: { value: number; label: string }[]; instructions: string };

/**
 * The engine no longer answers a bare question: since the decisions schema
 * drifted (observed 2026-09-21 — the endpoint started refusing bodies whose
 * questions carry no `instructions`), every question states in plain words
 * what it asks. `label` already is that statement ("Short human-readable
 * statement of what the question asks"), so it rides as-is.
 *
 * Multi-choice does not exist natively: a decision model evaluates every
 * question independently against the same state, so a multi_choice becomes ONE
 * `noul` per option, keyed `<key>:<value>`, that asks the parent question
 * about that single option. The option values are
 * guaranteed separator-free (`validateDecisionSpec`), so the prefix split
 * on the way back is unambiguous.
 */
export function expandDecisionQuestions(spec: DecisionSpec): Record<string, WireQuestion> {
  const questions: Record<string, WireQuestion> = {};
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
          instructions: question.label,
        };
        break;
      case "multi_choice":
        for (const option of question.options) {
          questions[`${question.key}:${option.value}`] = {
            type: "noul",
            // Each option is answered on its own, so its question restates
            // what is asked: a bare option label ("Documentation") is not a
            // yes/no question, and a decision model may refuse it (MIN-752).
            instructions: `${question.label} Does this option apply: ${describe(option.label, option.description)}?`,
          };
        }
        break;
      case "boolean":
        questions[question.key] = { type: "noul", instructions: question.label };
        break;
      case "score":
        questions[question.key] = {
          type: "score",
          // The score's scale moved from `levels` to a `criteria` ARRAY on
          // the same drift as `instructions`; the legend of the response
          // maps the distribution's indices back onto these values.
          criteria: question.levels.map((l) => ({ value: l.value, label: l.label })),
          instructions: question.label,
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
export function parseDecisionAnswers(
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
  // A bare value stays the tolerant read (older envelopes, tests).
  if (typeof raw === "number") {
    return allowed.includes(raw)
      ? { value: raw, probability: null, confidence: 0 }
      : null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const confidence = clamp01(record.confidence);

  // Legacy shape (MIN-561): `score` IS the chosen level's value, with
  // probabilities keyed by the values themselves.
  if (!("legend" in record)) {
    let value: unknown = record.score;
    let probability: number | null = null;
    if (record.probabilities && typeof record.probabilities === "object") {
      const probabilities = record.probabilities as Record<string, unknown>;
      const p = clamp01(probabilities[String(value)]);
      if (p !== null) probability = p;
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

  // Current shape: `score` is a 0–1 grade of the state against the ordered
  // scale, NOT the chosen value — the answer carries the distribution over
  // the criteria's indices (`probabilities`) and a `legend` mapping each
  // index back onto its {value, label}. The chosen level is the argmax
  // index, resolved through the legend and checked against the spec.
  // Providers echo the legend differently (MIN-694): an object (TypeSafe,
  // Perplexity), the criterion re-serialized as a JSON string (Liquid,
  // OpenAI) or as free text (Nace). An entry that yields no value falls back
  // to the level at that index — the criteria were sent in the spec's order.
  const probabilities =
    record.probabilities && typeof record.probabilities === "object"
      ? (record.probabilities as Record<string, unknown>)
      : null;
  const legend =
    record.legend && typeof record.legend === "object"
      ? (record.legend as Record<string, unknown>)
      : null;
  if (!probabilities || !legend) return null;
  let bestIndex: string | null = null;
  let bestProbability = -1;
  for (const [index, rawProbability] of Object.entries(probabilities)) {
    const p = clamp01(rawProbability);
    if (p !== null && p > bestProbability) {
      bestProbability = p;
      bestIndex = index;
    }
  }
  if (bestIndex === null) return null;
  let value = legendValue(legend[bestIndex]);
  if (value === null) {
    const index = Number.parseInt(bestIndex, 10);
    value = Number.isInteger(index) && index >= 0 ? (allowed[index] ?? null) : null;
  }
  if (value === null || !allowed.includes(value)) return null;
  return { value, probability: bestProbability, confidence: confidence ?? 0 };
}

/** The numeric value a legend entry carries, `null` when it yields none. */
function legendValue(entry: unknown): number | null {
  let resolved: unknown = entry;
  if (typeof resolved === "string") {
    try {
      resolved = JSON.parse(resolved);
    } catch {
      return null;
    }
  }
  if (resolved && typeof resolved === "object" && !Array.isArray(resolved)) {
    resolved = (resolved as Record<string, unknown>).value;
  }
  if (typeof resolved === "number") return Number.isFinite(resolved) ? resolved : null;
  if (typeof resolved === "string" && resolved.trim() !== "") {
    const parsed = Number.parseFloat(resolved);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Why a decision-model call produced no usable answers. */
export type DecisionModelFailure =
  /** No OpenRouter key can carry the call (no BYOK, managed AI off). */
  | "no_key"
  /** The endpoint answered an error status (unknown model, refused body…). */
  | "http"
  /** No answer within `DECISION_MODEL_TIMEOUT_MS`. */
  | "timeout"
  /** The request never completed (DNS, TLS, reset). */
  | "network"
  /** An answer came back but failed the spec's strict validation. */
  | "invalid_response";

export type DecisionModelCall =
  | {
      ok: true;
      answers: DecisionAnswers;
      /** The versioned model that actually answered, as the endpoint reports it. */
      model: string;
    }
  | { ok: false; reason: DecisionModelFailure; status?: number };

/** What a decision produced: the answers and the model that gave them. */
export interface DecisionModelResult {
  answers: DecisionAnswers;
  model: string;
}

/**
 * One decision-model call: resolve the configured model (or the candidate a
 * compatibility check passes in), build the System One body, call, record,
 * validate. Never throws, never retries; the failure reason is a fixed code.
 * Logs carry the model id and the reason — never the state or the answers.
 */
export async function callDecisionModel(
  spec: DecisionSpec,
  ctx: DecisionCallContext,
  options: { model?: string } = {}
): Promise<DecisionModelCall> {
  const key = await resolveDecisionApiKey(ctx.billTo);
  if (!key) return { ok: false, reason: "no_key" };
  const model = options.model ?? (await resolveConfiguredModel("jev_model")).model;
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
        questions: expandDecisionQuestions(spec),
      }),
      signal: AbortSignal.timeout(DECISION_MODEL_TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = await response.text();
      // Constant format string: the model id comes from an admin request on
      // the save probe, and the provider body is third-party text.
      console.error(
        "[decisions-model] %s HTTP %d: %s",
        model,
        response.status,
        detail.slice(0, 200)
      );
      return { ok: false, reason: "http", status: response.status };
    }
    const data = (await response.json()) as {
      model?: string;
      id?: string;
      usage?: OpenRouterUsage;
    };
    const answeredBy = typeof data.model === "string" && data.model ? data.model : model;
    const u = parseOpenRouterUsage(data.usage);
    await recordAiUsage({
      runId: ctx.runId,
      seq: ctx.seq ?? 0,
      // Historical ledger id of every decision-model call, whatever the model:
      // finance and usage history keep reading the rows written before MIN-694.
      feature: "jev_decision",
      provider: "openrouter",
      keyMode: key.keyMode,
      model: answeredBy,
      generationId: data.id ?? null,
      promptTokens: u.promptTokens,
      completionTokens: u.completionTokens,
      totalTokens: u.totalTokens,
      cost: u.cost,
      billTo: ctx.billTo,
      projectId: ctx.projectId ?? null,
    });
    const parsed = parseDecisionAnswers(spec, data);
    if ("error" in parsed) {
      console.error("[decisions-model] %s invalid response: %s", answeredBy, parsed.error);
      return { ok: false, reason: "invalid_response" };
    }
    return { ok: true, answers: parsed.answers, model: answeredBy };
  } catch (err) {
    const error = err as Error;
    const reason: DecisionModelFailure =
      error.name === "TimeoutError" || error.name === "AbortError"
        ? "timeout"
        : // A 200 whose body is not JSON is the provider's answer, not the network.
          err instanceof SyntaxError
          ? "invalid_response"
          : "network";
    console.error("[decisions-model] %s call failed (%s): %s", model, reason, error.message);
    return { ok: false, reason };
  }
}

/**
 * One decision with the configured model. `null` on every failure — missing
 * key, HTTP error, timeout, crooked JSON, one answer missing or out of
 * vocabulary — which the runner reads as "decision model unavailable".
 */
export async function runModelDecision(
  spec: DecisionSpec,
  ctx: DecisionCallContext
): Promise<DecisionModelResult | null> {
  const call = await callDecisionModel(spec, ctx);
  return call.ok ? { answers: call.answers, model: call.model } : null;
}

/**
 * The compatibility probe the admin save runs on a candidate decision model
 * (MIN-694). Publishing the `decisions` modality only says a model speaks the
 * endpoint; it does not say it accepts Minddy's state (some providers require
 * a conversation transcript or a document), answers every question kind the
 * use cases send (choice, multi-choice spread over yes/no questions, yes/no),
 * or answers inside the latency budget. The probe asks exactly that, once,
 * through the real adapter, so a model that passes is a model the runtime can
 * parse. Platform-paid (the admin configures the instance, not a project) and
 * recorded in the ledger like any decision call.
 */
export const DECISION_MODEL_PROBE_SPEC: DecisionSpec = {
  useCase: "smart_fill",
  state: {
    project: "An issue tracker for a software team",
    issue: {
      title: "Sign-in page crashes on Safari when a password manager autofills",
      description:
        "Safari users report a blank screen right after the password manager fills the form. Nobody on Safari can sign in.",
    },
  },
  questions: [
    {
      key: "priority",
      kind: "single_choice",
      label: "How urgent does this issue read?",
      options: ["none", "low", "medium", "high", "urgent"].map((value) => ({
        value,
        label: value,
      })),
    },
    {
      key: "category_ids",
      kind: "multi_choice",
      label: "Which of this project's categories does the issue belong to?",
      options: [
        { value: "bug", label: "Bug" },
        { value: "feature", label: "Feature request" },
        { value: "docs", label: "Documentation" },
      ],
      maxSelections: 2,
    },
    {
      key: "objective_id",
      kind: "single_choice",
      label: "Which objective does the issue plainly belong to?",
      options: [
        { value: "auth", label: "Reliable authentication" },
        { value: "billing", label: "Billing revamp" },
        { value: "__none__", label: "No objective" },
      ],
    },
    {
      key: "is_junk",
      kind: "boolean",
      label: "Is this post spam, gibberish, an empty test, an ad, or abuse with no real product signal?",
    },
  ],
  llm: { toolName: "probe", parameters: {}, systemPrompt: "", userMessage: "" },
};

export async function probeDecisionModel(
  model: string,
  runId: string
): Promise<DecisionModelCall> {
  return callDecisionModel(
    DECISION_MODEL_PROBE_SPEC,
    { runId, seq: 0, billTo: { platform: "decision model compatibility check" } },
    { model }
  );
}
