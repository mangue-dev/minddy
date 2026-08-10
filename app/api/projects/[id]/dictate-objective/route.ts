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
import {
  fetchOpenRouterWithSuffixFallback,
  modelConfigKeys,
  resolveFromValues,
} from "@/lib/server/model-config";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { ensureUsageBudget } from "@/lib/server/usage";
import {
  isPlanLimitError,
  planLimitResponse,
} from "@/lib/server/plan-limit-error";
import { sanitizeAssistantMessageContent } from "@/lib/server/assistant/sanitize";
import { listMembers } from "@/lib/server/issue-reads";
import { isDateOrNull } from "@/lib/issue-validation";
import { OBJECTIVE_STATUS_VALUES } from "@/lib/objective-constants";
import { CATEGORY_COLORS, CATEGORY_COLOR_NAMES } from "@/lib/category-colors";
import type { ObjectiveDraftPatch } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// Numo edits OBJECTIVE FIELDS from a voice transcript — the objective twin of
// /api/projects/[id]/dictate-issue, down to the model, the loop and the
// throwaway session. Two modes:
// - "create": the draft is the new-objective form — the patch stays a
//   client-side draft, creating the objective remains a manual click.
// - "edit": the draft is an existing objective's values — the client saves the
//   patch immediately, from the side panel.
// The route itself never writes to the DB.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// Même modèle que la dictée de ticket (clé app_config `dictate_model`) : c'est
// la même étape agentique, sur d'autres champs.
const RATE_LIMIT = { limit: 30, windowMs: 60 * 60 * 1000 } as const;
const MAX_TOOL_ROUNDS = 3;
const MAX_HISTORY_TURNS = 12;
const MAX_TRANSCRIPT_CHARS = 20_000;
const MAX_HISTORY_CHARS = 4000;

type HistoryTurn = { role: "user" | "assistant"; content: string };

type Draft = {
  name: string;
  description: string;
  status: string;
  lead_user_id: string | null;
  target_date: string | null;
  color: string | null;
};

type PromptMember = { user_id: string; name: string };

const UPDATE_DRAFT_TOOL = {
  type: "function" as const,
  function: {
    name: "update_draft",
    description:
      "Apply changes to the objective draft form. Only pass the fields to change — omitted fields keep their current value.",
    parameters: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Concise objective name (a goal, ≤ 80 chars).",
        },
        description: {
          type: "string",
          description: "Objective description, markdown.",
        },
        status: { type: "string", enum: [...OBJECTIVE_STATUS_VALUES] },
        lead_user_id: {
          type: ["string", "null"],
          description: "user_id of the lead (from Members), or null to clear.",
        },
        target_date: {
          type: ["string", "null"],
          description:
            "Target date as a naive local datetime, no offset ('2026-07-10T00:00:00'), or null to clear.",
        },
        color: {
          type: ["string", "null"],
          enum: [...CATEGORY_COLORS, null],
          description: "Objective color, one of the listed hex values, or null to clear.",
        },
      },
    },
  },
};

/** Whitelist a raw tool-call patch against the project's real members and the
 *  field enums. Returns the safe patch + the reasons anything was dropped (fed
 *  back to the model so it can correct itself on the next round). */
function sanitizePatch(
  raw: Record<string, unknown>,
  members: PromptMember[]
): { patch: ObjectiveDraftPatch; rejected: string[] } {
  const patch: ObjectiveDraftPatch = {};
  const rejected: string[] = [];

  if (raw.name !== undefined) {
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (name) patch.name = name.slice(0, 500);
    else rejected.push("name: must be a non-empty string");
  }
  if (raw.description !== undefined) {
    if (typeof raw.description === "string")
      patch.description = raw.description.slice(0, 10_000);
    else rejected.push("description: must be a string");
  }
  if (raw.status !== undefined) {
    if (
      typeof raw.status === "string" &&
      OBJECTIVE_STATUS_VALUES.includes(raw.status as never)
    )
      patch.status = raw.status as ObjectiveDraftPatch["status"];
    else rejected.push("status: invalid value");
  }
  if (raw.lead_user_id !== undefined) {
    if (
      raw.lead_user_id === null ||
      members.some((m) => m.user_id === raw.lead_user_id)
    )
      patch.lead_user_id = raw.lead_user_id as string | null;
    else rejected.push("lead_user_id: not a member of this project");
  }
  if (raw.target_date !== undefined) {
    if (isDateOrNull(raw.target_date))
      patch.target_date = raw.target_date as string | null;
    else rejected.push("target_date: must be an ISO 8601 timestamp or null");
  }
  if (raw.color !== undefined) {
    if (
      raw.color === null ||
      CATEGORY_COLORS.includes(raw.color as (typeof CATEGORY_COLORS)[number])
    )
      patch.color = raw.color as string | null;
    else rejected.push("color: not one of the allowed hex values");
  }

  return { patch, rejected };
}

/** "Tuesday 2026-07-07 14:32" in the user's timezone — lets the model resolve
 *  "fin du mois" as a local wall-clock date without offset math. */
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
  projectName,
  members,
  draft,
  mode,
  locale,
  userId,
  timeZone,
}: {
  projectName: string;
  members: PromptMember[];
  draft: Draft;
  mode: "create" | "edit";
  locale: string;
  userId: string;
  timeZone: string;
}): string {
  const me = members.find((m) => m.user_id === userId);
  const memberLines =
    members.map((m) => `- ${m.name} (user_id: ${m.user_id})`).join("\n") || "None.";
  const colorLines = CATEGORY_COLORS.map(
    (c) => `- ${c} (${CATEGORY_COLOR_NAMES[c]})`
  ).join("\n");

  const intro =
    mode === "create"
      ? `You are Numo, the minddy assistant, operating the "New objective" form of project "${projectName}".
An OBJECTIVE groups issues of the project around a goal — it is not a task.
The user speaks; you fill or edit the DRAFT of the objective being created by calling update_draft.
This edits a form on screen — nothing is saved until the user clicks the Create button. You cannot create the objective yourself.`
      : `You are Numo, the minddy assistant, editing an EXISTING objective of project "${projectName}" from its side panel.
An OBJECTIVE groups issues of the project around a goal — it is not a task.
The user speaks; you edit the objective's fields by calling update_draft.
Every change you emit is saved IMMEDIATELY — be conservative: change exactly what was asked, nothing more.`;

  const modeRules =
    mode === "create"
      ? `- FIRST dictation describing a goal (draft mostly empty): fill as much as the words reasonably support — a concise name (≤ 80 chars, the goal itself, not a task), a clean markdown description faithful to what was said (structure it; NEVER invent facts or details that were not said), and every field the words imply: "je le pilote" / "je m'en occupe" → lead = current user, a person's name → that member, a deadline → target_date, a stated color → its hex. Leave the other unstated fields untouched — in particular, do NOT invent a color or a status that was not asked for.
- FOLLOW-UP commands ("passe-le en cours", "mets Marie responsable", "enlève la date cible"): apply EXACTLY the requested change(s), nothing else. Do not rewrite name or description unless asked.
- Additional context dictated later ("ajoute que…") extends the description without losing what's there.
- Name and description are written in the language the user dictates in.`
      : `- Apply EXACTLY the requested change(s) ("passe-le en cours", "mets Marie responsable", "enlève la date cible") — NEVER touch a field the user did not mention. Do not fill unstated fields.
- Additional context dictated ("ajoute que…") extends the description without losing what's there. Do not rewrite or restructure the existing name or description unless explicitly asked.
- New text follows the language of the objective's existing content (falling back to the language the user dictates in).`;

  return `${intro}

## Now
${formatNow(timeZone)} (user's local time) — resolve relative dates ("fin du mois", "vendredi", "next quarter") against this. Express target_date as a NAIVE local datetime, NO timezone offset, e.g. "2026-07-10T00:00:00" — midnight when no time was stated.

## Current user
${me ? `${me.name} (user_id: ${me.user_id})` : `user_id: ${userId}`} — "me"/"moi"/"je" refers to them.

## Members
${memberLines}

## Field values (fixed — never invent)
- status: ${OBJECTIVE_STATUS_VALUES.join(", ")}
- color (hex, or null):
${colorLines}

## ${mode === "create" ? "Current draft (ground truth — includes the user's manual edits)" : "Current objective (ground truth — its saved state)"}
${JSON.stringify(draft, null, 1)}

## Rules
${modeRules}
- Only pass ids listed above. If something matches nothing (unknown member…), do not guess — say so in your reply instead.
- After your tool call(s), reply with ONE short plain sentence in ${locale === "fr" ? "French (with proper accents; an objective is « objectif »)" : "English"} summarizing what you changed, or explaining why you changed nothing. No markdown, no emoji, no ids.`;
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const rateLimit = checkSessionRateLimit(
    auth.user.id,
    "dictate-objective",
    RATE_LIMIT
  );
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
  // `null` est du JSON valide : lire body.mode dessus ferait un 500, pas un 400.
  if (!body || typeof body !== "object") {
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
  // authorized objective-update API).
  const rawDraft = (body.draft ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) =>
    typeof v === "string" ? v.slice(0, max) : "";
  const nullableStr = (v: unknown) => (typeof v === "string" ? v.slice(0, 200) : null);
  const draft: Draft = {
    name: str(rawDraft.name, 500),
    description: str(rawDraft.description, 10_000),
    status: str(rawDraft.status, 20),
    lead_user_id: nullableStr(rawDraft.lead_user_id),
    target_date: nullableStr(rawDraft.target_date),
    color: nullableStr(rawDraft.color),
  };

  const history: HistoryTurn[] = Array.isArray(body.history)
    ? body.history
        .filter(
          (t): t is HistoryTurn =>
            !!t &&
            typeof t === "object" &&
            ((t as HistoryTurn).role === "user" ||
              (t as HistoryTurn).role === "assistant") &&
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
  // Seuls les MEMBRES entrent dans ce prompt : un objectif ne référence ni
  // catégorie ni ticket, le reste du contexte projet ne lui sert à rien.
  const [membersResult, modelCfg, locale] = await Promise.all([
    listMembers(
      { db: auth.supabase, service, projectId, projectKey: project.key as string },
      project.owner_id as string
    ),
    getAppConfigValues(modelConfigKeys("dictate_model")),
    getLocale(),
  ]);
  const members: PromptMember[] =
    "members" in membersResult
      ? membersResult.members.map((m) => ({
          user_id: m.user_id as string,
          name: m.name as string,
        }))
      : [];
  // `let` : le repli du raccourci de routage (MIN-263) colle au modèle qui a
  // marché, pour ne pas re-tenter le suffixe à chaque round.
  let model = resolveFromValues("dictate_model", modelCfg).model;

  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: buildDictatePrompt({
        projectName: project.name as string,
        members,
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
  const merged: ObjectiveDraftPatch = {};
  let reply = "";
  // Suivi des coûts : un run = cette dictée ; chaque round est un appel.
  const runId = newRunId();
  const usageRows: AiUsageInput[] = [];
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const call = await fetchOpenRouterWithSuffixFallback(
        OPENROUTER_URL,
        model,
        (m) => ({
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://minddy.app",
            "X-Title": "Numo (minddy)",
          },
          body: JSON.stringify({
            model: m,
            messages,
            tools: [UPDATE_DRAFT_TOOL],
            usage: { include: true },
            max_tokens: 4096,
          }),
        }),
        "[dictate-objective]",
      );
      const response = call.response;
      model = call.model;
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
        billTo: { userId: auth.user.id },
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
          const { patch, rejected } = sanitizePatch(args, members);
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
    console.error("[api/dictate-objective] loop failed:", err);
    if (usageRows.length > 0) after(() => recordAiUsage(usageRows));
    return NextResponse.json({ error: "Dictation processing failed" }, { status: 502 });
  }

  if (usageRows.length > 0) after(() => recordAiUsage(usageRows));
  return NextResponse.json({ patch: merged, reply });
}
