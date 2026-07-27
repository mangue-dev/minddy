import { NextResponse, after, type NextRequest } from "next/server";
import { getLocale } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import {
  recordAiUsage,
  newRunId,
  parseOpenRouterUsage,
  type AiUsageInput,
  type OpenRouterUsage,
} from "@/lib/server/ai-usage";
import { getAppConfigValues } from "@/lib/server/app-config";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { ensureUsageBudget } from "@/lib/server/usage";
import {
  isPlanLimitError,
  planLimitResponse,
} from "@/lib/server/plan-limit-error";
import { sanitizeAssistantMessageContent } from "@/lib/server/assistant/sanitize";
import { gatherProjectPromptContext } from "@/lib/server/assistant/prompt-context";
import type { PromptProjectContext } from "@/lib/server/assistant/prompt";
import {
  ISSUE_STATUSES,
  ISSUE_PRIORITIES,
  ISSUE_EFFORTS,
  isStatus,
  isPriority,
  isEffort,
  isDateOrNull,
} from "@/lib/issue-validation";
import type { IssueDraftPatch } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// Numo edits ISSUE FIELDS from a voice transcript: the client sends the
// transcript + the current draft, a short agentic loop turns it into a
// validated field patch, the client applies it. The route itself never writes
// to the DB. Two modes:
// - "create": the draft is the new-issue form — the patch stays a client-side
//   draft, creating the issue remains a manual click.
// - "edit": the draft is an existing issue's current values — the client saves
//   the patch to the issue immediately.
// The dictation session is throwaway: history lives on the client and dies
// with the dialog / when the panel switches issue.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// Modèle dédié à l'étape agentique post-dictée (transcript → patch d'issue).
// Rapide et pas cher, distinct du modèle global de Numo (assistant_model).
// Surchargeable en base via la clé app_config `dictate_model`.
const DICTATE_DEFAULT_MODEL = "google/gemini-3.1-flash-lite";
const RATE_LIMIT = { limit: 30, windowMs: 60 * 60 * 1000 } as const;
const MAX_TOOL_ROUNDS = 3;
const MAX_HISTORY_TURNS = 12;
// La dictée n'a plus de limite de durée : une prise peut valoir des milliers de
// mots (~20 000 caractères ≈ une demi-heure de parole). Les tours d'historique
// gardent le plafond serré d'origine — douze tours de 20 000 feraient un prompt
// absurde, alors qu'un seul transcript long est le cas normal.
const MAX_TRANSCRIPT_CHARS = 20_000;
const MAX_HISTORY_CHARS = 4000;

type HistoryTurn = { role: "user" | "assistant"; content: string };

type Draft = {
  title: string;
  description: string;
  status: string;
  priority: string;
  effort: string | null;
  assignee_id: string | null;
  objective_id: string | null;
  due_date: string | null;
  category_ids: string[];
};

const UPDATE_DRAFT_TOOL = {
  type: "function" as const,
  function: {
    name: "update_draft",
    description:
      "Apply changes to the issue draft form. Only pass the fields to change — omitted fields keep their current value. category_ids REPLACES the full set.",
    parameters: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "Concise issue title (Linear-style, ≤ 80 chars).",
        },
        description: {
          type: "string",
          description: "Issue description, markdown.",
        },
        status: { type: "string", enum: [...ISSUE_STATUSES] },
        priority: { type: "string", enum: [...ISSUE_PRIORITIES] },
        effort: {
          type: ["string", "null"],
          enum: [...ISSUE_EFFORTS, null],
          description: "Effort estimate (t-shirt size), or null to clear.",
        },
        assignee_id: {
          type: ["string", "null"],
          description: "user_id of the assignee (from Members), or null to unassign.",
        },
        objective_id: {
          type: ["string", "null"],
          description: "Objective id (from Objectives), or null to detach.",
        },
        due_date: {
          type: ["string", "null"],
          description:
            "Due date as a naive local datetime, no offset ('2026-07-10T00:00:00'), or null to clear.",
        },
        category_ids: {
          type: "array",
          items: { type: "string" },
          description: "The complete new set of category ids (from Categories).",
        },
      },
    },
  },
};

/** Whitelist a raw tool-call patch against the project's real ids and the field
 *  enums. Returns the safe patch + the reasons anything was dropped (fed back
 *  to the model so it can correct itself on the next round). */
function sanitizePatch(
  raw: Record<string, unknown>,
  ctx: PromptProjectContext
): { patch: IssueDraftPatch; rejected: string[] } {
  const patch: IssueDraftPatch = {};
  const rejected: string[] = [];

  if (raw.title !== undefined) {
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    if (title) patch.title = title.slice(0, 500);
    else rejected.push("title: must be a non-empty string");
  }
  if (raw.description !== undefined) {
    if (typeof raw.description === "string")
      patch.description = raw.description.slice(0, 10_000);
    else rejected.push("description: must be a string");
  }
  if (raw.status !== undefined) {
    if (isStatus(raw.status) && raw.status !== "duplicate") patch.status = raw.status;
    else rejected.push(`status: invalid value (duplicate cannot be set by dictation)`);
  }
  if (raw.priority !== undefined) {
    if (isPriority(raw.priority)) patch.priority = raw.priority;
    else rejected.push("priority: invalid value");
  }
  if (raw.effort !== undefined) {
    if (raw.effort === null || isEffort(raw.effort)) patch.effort = raw.effort;
    else rejected.push("effort: invalid value");
  }
  if (raw.assignee_id !== undefined) {
    if (
      raw.assignee_id === null ||
      ctx.members.some((m) => m.user_id === raw.assignee_id)
    )
      patch.assignee_id = raw.assignee_id as string | null;
    else rejected.push("assignee_id: not a member of this project");
  }
  if (raw.objective_id !== undefined) {
    if (
      raw.objective_id === null ||
      ctx.objectives.some((o) => o.id === raw.objective_id)
    )
      patch.objective_id = raw.objective_id as string | null;
    else rejected.push("objective_id: unknown objective");
  }
  if (raw.due_date !== undefined) {
    if (isDateOrNull(raw.due_date)) patch.due_date = raw.due_date as string | null;
    else rejected.push("due_date: must be an ISO 8601 timestamp or null");
  }
  if (raw.category_ids !== undefined) {
    if (Array.isArray(raw.category_ids)) {
      const known = new Set(ctx.categories.map((c) => c.id));
      const ids = raw.category_ids.filter(
        (id): id is string => typeof id === "string" && known.has(id)
      );
      const dropped = raw.category_ids.length - ids.length;
      patch.category_ids = ids;
      if (dropped > 0) rejected.push(`category_ids: ${dropped} unknown id(s) dropped`);
    } else rejected.push("category_ids: must be an array of ids");
  }

  return { patch, rejected };
}

/** "Tuesday 2026-07-07 14:32" in the user's timezone — lets the model resolve
 *  "vendredi prochain" as a local wall-clock date without offset math. */
function formatNow(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      weekday: "long",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
  } catch {
    return new Date().toISOString();
  }
}

function buildDictatePrompt({
  ctx,
  draft,
  mode,
  locale,
  userId,
  timeZone,
}: {
  ctx: PromptProjectContext;
  draft: Draft;
  mode: "create" | "edit";
  locale: string;
  userId: string;
  timeZone: string;
}): string {
  const me = ctx.members.find((m) => m.user_id === userId);
  const memberLines =
    ctx.members.map((m) => `- ${m.name} (user_id: ${m.user_id})`).join("\n") ||
    "None.";
  const objectiveLines =
    ctx.objectives.map((o) => `- "${o.name}" (id: ${o.id}) [${o.status}]`).join("\n") ||
    "None yet.";
  const categoryLines =
    ctx.categories.map((c) => `- "${c.name}" (id: ${c.id})`).join("\n") || "None yet.";

  const intro =
    mode === "create"
      ? `You are Numo, the minddy assistant, operating the "New issue" form of project "${ctx.name}".
The user speaks; you fill or edit the DRAFT of the issue being created by calling update_draft.
This edits a form on screen — nothing is saved until the user clicks the Create button. You cannot create the issue yourself.`
      : `You are Numo, the minddy assistant, editing an EXISTING issue of project "${ctx.name}" from its side panel.
The user speaks; you edit the issue's fields by calling update_draft.
Every change you emit is saved to the issue IMMEDIATELY — be conservative: change exactly what was asked, nothing more.`;

  const modeRules =
    mode === "create"
      ? `- FIRST dictation describing a problem or idea (draft mostly empty): fill as much as the words reasonably support — a concise title (≤ 80 chars, imperative, Linear-style), a clean markdown description faithful to what was said (structure it; NEVER invent facts, steps or details that were not said), and every field the words imply: "je m'en occupe" / "assigne-moi" → assignee = current user, a person's name → that member, deadlines → due_date, category/objective names → their ids. On a first dictation ALWAYS set priority AND effort, even when not stated: estimate priority from the urgency/impact wording and effort (t-shirt size) from the apparent scope and complexity of the work — a reasoned estimate beats leaving the defaults. Leave the other unstated fields untouched.
- FOLLOW-UP commands ("passe-la en urgent", "attribue-moi le ticket", "enlève l'échéance"): apply EXACTLY the requested change(s), nothing else. Do not rewrite title or description unless asked.
- Additional context dictated later ("ajoute que…") extends the description without losing what's there.
- Title and description are written in the language the user dictates in.`
      : `- Apply EXACTLY the requested change(s) ("passe-le en urgent", "attribue-moi le ticket", "enlève l'échéance") — NEVER touch a field the user did not mention. Do not estimate or fill unstated fields.
- Additional context dictated ("ajoute que…") extends the description without losing what's there. Do not rewrite or restructure the existing title or description unless explicitly asked.
- New text follows the language of the issue's existing content (falling back to the language the user dictates in).`;

  return `${intro}

## Now
${formatNow(timeZone)} (user's local time) — resolve relative dates ("demain", "vendredi", "next week") against this. Express due_date as a NAIVE local datetime, NO timezone offset, e.g. "2026-07-10T00:00:00" — midnight when no time was stated.

## Current user
${me ? `${me.name} (user_id: ${me.user_id})` : `user_id: ${userId}`} — "me"/"moi"/"je" refers to them.

## Members
${memberLines}

## Objectives
${objectiveLines}

## Categories
${categoryLines}

## Field values (fixed — never invent)
- status: ${ISSUE_STATUSES.filter((s) => s !== "duplicate").join(", ")}
- priority: ${ISSUE_PRIORITIES.join(", ")}
- effort (t-shirt): ${ISSUE_EFFORTS.join(", ")}, or null

## ${mode === "create" ? "Current draft (ground truth — includes the user's manual edits)" : "Current issue (ground truth — its saved state)"}
${JSON.stringify(draft, null, 1)}

## Rules
${modeRules}
- Only pass ids listed above. If something matches nothing (unknown member, category…), do not guess — say so in your reply instead.
- After your tool call(s), reply with ONE short plain sentence in ${locale === "fr" ? "French (with proper accents; an issue is « ticket »)" : "English"} summarizing what you changed, or explaining why you changed nothing. No markdown, no emoji, no ids.`;
}

type OpenRouterMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  // Budget d'usage du plan (MIN-72) — pré-vol avant le mini-agent de dictée.
  try {
    await ensureUsageBudget(auth.user.id);
  } catch (err) {
    if (isPlanLimitError(err)) return planLimitResponse(err);
    throw err;
  }

  const rateLimit = checkSessionRateLimit(auth.user.id, "dictate-issue", RATE_LIMIT);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests", retry_after: rateLimit.retryAfter },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } }
    );
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Dictation not configured" }, { status: 503 });
  }

  let body: {
    transcript?: unknown;
    mode?: unknown;
    draft?: unknown;
    history?: unknown;
    timeZone?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mode = body.mode === "edit" ? ("edit" as const) : ("create" as const);

  const transcript =
    typeof body.transcript === "string"
      ? sanitizeAssistantMessageContent(body.transcript).slice(0, MAX_TRANSCRIPT_CHARS)
      : "";
  if (!transcript.trim()) {
    return NextResponse.json({ error: "transcript is required" }, { status: 400 });
  }
  const timeZone =
    typeof body.timeZone === "string" && body.timeZone.length <= 60
      ? body.timeZone
      : "UTC";

  // The draft is display-only prompt context (prompt-only trust): every id the
  // model can emit back is re-validated in sanitizePatch, and this route never
  // writes to the DB (in edit mode the client persists through the usual
  // authorized issue-update APIs).
  const rawDraft = (body.draft ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) =>
    typeof v === "string" ? v.slice(0, max) : "";
  const nullableStr = (v: unknown) => (typeof v === "string" ? v.slice(0, 200) : null);
  const draft: Draft = {
    title: str(rawDraft.title, 500),
    description: str(rawDraft.description, 10_000),
    status: str(rawDraft.status, 20),
    priority: str(rawDraft.priority, 20),
    effort: nullableStr(rawDraft.effort),
    assignee_id: nullableStr(rawDraft.assignee_id),
    objective_id: nullableStr(rawDraft.objective_id),
    due_date: nullableStr(rawDraft.due_date),
    category_ids: Array.isArray(rawDraft.category_ids)
      ? rawDraft.category_ids.filter((v): v is string => typeof v === "string").slice(0, 50)
      : [],
  };

  const history: HistoryTurn[] = Array.isArray(body.history)
    ? body.history
        .filter(
          (t): t is HistoryTurn =>
            !!t &&
            typeof t === "object" &&
            ((t as HistoryTurn).role === "user" || (t as HistoryTurn).role === "assistant") &&
            typeof (t as HistoryTurn).content === "string"
        )
        .slice(-MAX_HISTORY_TURNS)
        .map((t) => ({
          role: t.role,
          content: sanitizeAssistantMessageContent(t.content).slice(0, MAX_HISTORY_CHARS),
        }))
    : [];

  // RLS scopes the project read; an inaccessible project reads as not found.
  const { data: project } = await auth.supabase
    .from("projects")
    .select("id, name, key, owner_id")
    .eq("id", projectId)
    .is("deleted_at", null)
    .single();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const service = getServiceClient();
  const [ctx, modelCfg, locale] = await Promise.all([
    gatherProjectPromptContext({ supabase: auth.supabase, service, project }),
    getAppConfigValues(["dictate_model"]),
    getLocale(),
  ]);
  const model = modelCfg["dictate_model"]?.trim() || DICTATE_DEFAULT_MODEL;

  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: buildDictatePrompt({
        ctx,
        draft,
        mode,
        locale,
        userId: auth.user.id,
        timeZone,
      }),
    },
    ...history,
    { role: "user", content: transcript },
  ];

  // Mini agentic loop: completion → validate tool calls → feed results back,
  // until the model answers with plain text (or the round cap hits).
  const merged: IssueDraftPatch = {};
  let reply = "";
  // Suivi des coûts : un run = cette dictée ; chaque round est un appel.
  const runId = newRunId();
  const usageRows: AiUsageInput[] = [];
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://minddy.app",
          "X-Title": "Numo (minddy)",
        },
        body: JSON.stringify({
          model,
          messages,
          tools: [UPDATE_DRAFT_TOOL],
          usage: { include: true },
          max_tokens: 4096,
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM error (${response.status}): ${errorText.slice(0, 200)}`);
      }
      const data = (await response.json()) as {
        choices?: { message?: OpenRouterMessage }[];
        id?: string;
        model?: string;
        usage?: OpenRouterUsage;
      };
      const u = parseOpenRouterUsage(data.usage);
      usageRows.push({
        runId,
        seq: round,
        feature: "dictation",
        model: data.model ?? model,
        generationId: data.id ?? null,
        promptTokens: u.promptTokens,
        completionTokens: u.completionTokens,
        totalTokens: u.totalTokens,
        cost: u.cost,
        userId: auth.user.id,
        projectId,
      });
      const message = data.choices?.[0]?.message;
      if (!message) throw new Error("Empty LLM response");
      messages.push(message);

      const toolCalls = message.tool_calls ?? [];
      if (toolCalls.length === 0) {
        reply = (message.content ?? "").trim();
        break;
      }
      for (const call of toolCalls) {
        let result: string;
        if (call.function.name !== "update_draft") {
          result = JSON.stringify({ error: `Unknown tool ${call.function.name}` });
        } else {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(call.function.arguments || "{}");
          } catch {
            result = JSON.stringify({ error: "Invalid JSON arguments" });
            messages.push({ role: "tool", tool_call_id: call.id, content: result });
            continue;
          }
          const { patch, rejected } = sanitizePatch(args, ctx);
          Object.assign(merged, patch);
          result = JSON.stringify({
            applied: Object.keys(patch),
            ...(rejected.length > 0 ? { rejected } : {}),
          });
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
    }
  } catch (err) {
    console.error("[api/dictate-issue] loop failed:", err);
    if (usageRows.length > 0) after(() => recordAiUsage(usageRows));
    return NextResponse.json({ error: "Dictation processing failed" }, { status: 502 });
  }

  if (usageRows.length > 0) after(() => recordAiUsage(usageRows));
  return NextResponse.json({ patch: merged, reply });
}
