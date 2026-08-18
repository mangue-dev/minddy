import "server-only";

import { getAppConfigValues } from "@/lib/server/app-config";
import {
  modelConfigKeys,
  resolveFromValues,
  withModelSuffixFallback,
} from "@/lib/server/model-config";
import { sanitizeAssistantMessageContent } from "@/lib/server/assistant/sanitize";
import {
  resolveAudioFormat,
  transcribeAudio,
} from "@/lib/server/openrouter-transcribe";
import {
  parseOpenRouterUsage,
  type AiUsageBillTo,
  type AiUsageInput,
  type OpenRouterUsage,
} from "@/lib/server/ai-usage";
import {
  FEEDBACK_BODY_MAX,
  FEEDBACK_TITLE_MAX,
  type FeedbackVoiceDraft,
  type FeedbackVoicePatch,
  type FeedbackVoiceTurn,
} from "@/lib/feedback/types";
import { fetchAiChat, resolveAiRuntime } from "@/lib/server/ai-runtime";
import { getServiceClient } from "@/lib/supabase-service";
import type { ByokModelKey } from "@/lib/ai-surfaces";
import { isManagedAiEnabled } from "@/lib/managed-services";

/**
 * Dictate a return — the core shared by the TWO surfaces (MIN-37).
 *
 * The public board and the “internal return” modal of the dashboard write in the
 * same two fields, with the same rules: it is therefore the same prompt and the
 * same validation, and this file exists so that there is only one. What
 * changes from one surface to another — who pays, who is rate-limited, how we
 * solves the project — remains in the entry points, because it is exactly
 * which is NOT common.
 *
 * One take = two calls (listening then storage), a `runId`, the feature
 * `feedback_voice`: in the ledger, one line = a dictated return.
 */


/** Admin switch — mutes the microphone on both surfaces at once. */
export const FEEDBACK_VOICE_ENABLED_KEY = "feedback_voice_enabled";

/**
 * 10 MB, the same limit as `/api/transcribe`: at the rate pinned on the client side
 * (48 kb/s), it's worth ~28 minutes of recording time. A return never does the same —
 * the terminal is there for the payload, not to ration speech.
 */
export const FEEDBACK_VOICE_MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const MAX_TRANSCRIPT_CHARS = 20_000;

async function feedbackRuntime(
  billTo: AiUsageBillTo,
  projectId: string,
  modelKey: ByokModelKey,
) {
  let userId = "userId" in billTo ? billTo.userId : null;
  if (!userId && "projectOwner" in billTo) {
    const { data } = await getServiceClient()
      .from("projects")
      .select("owner_id")
      .eq("id", projectId)
      .maybeSingle();
    userId = (data as { owner_id?: string } | null)?.owner_id ?? null;
  }
  return userId
    ? resolveAiRuntime({ userId, modelKey, surface: "feedback" })
    : null;
}
const MAX_HISTORY_TURNS = 12;
const MAX_HISTORY_CHARS = 4000;

const UPDATE_FEEDBACK_TOOL = {
  type: "function" as const,
  function: {
    name: "update_feedback",
    description:
      "Apply changes to the feedback being written. Only pass the fields to change — omitted fields keep their current value.",
    parameters: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description:
            "One-line summary of the feedback, as the person would title it (≤ 120 chars).",
        },
        body: {
          type: "string",
          description:
            "The detailed feedback, markdown. Faithful to what was said — never invented.",
        },
        reply: {
          type: "string",
          description:
            "ONE short plain sentence, in the user's language, saying what you wrote or changed. No markdown, no emoji.",
        },
      },
      // All in `required`, and the forced tool: on small models a field
      // optional is just not answered. “Don’t touch anything” is said
      // therefore by returning the current value — and Numo's sentence travels in
      // the same call rather than costing a second one (the tool being forced, the
      // message d'assistant revient sans contenu).
      required: ["title", "body", "reply"],
    },
  },
};

/**
 * The storage prompt. It differs from that of ticket dictation on the
 * point that matters: here we estimate NOTHING. A ticket is filed (priority,
 * effort, deadline) because the team writing it knows what it values; a
 * return is someone's testimony, and anything the model would add
 * would be put in their mouth — then read by the team as coming from them.
 */
function buildFeedbackVoicePrompt({
  projectName,
  draft,
  locale,
  surface,
}: {
  projectName: string;
  draft: FeedbackVoiceDraft;
  locale: string;
  /** "board" = the visitor talks about himself; "internal" = a member reports feedback received. */
  surface: "board" | "internal";
}): string {
  const intro =
    surface === "board"
      ? `You are Numo, the minddy assistant, helping someone share feedback about "${projectName}".
They speak; you write their feedback into the form by calling update_feedback.
This fills a form on screen — nothing is sent until they click the submit button. You cannot submit it yourself.`
      : `You are Numo, the minddy assistant, helping a team member record a piece of feedback they received elsewhere about "${projectName}" — an email, a call, a conversation.
They speak; you write that feedback into the form by calling update_feedback.
This fills a form on screen — nothing is saved until they click the create button. You cannot save it yourself.`;

  return `${intro}

## Current form (ground truth — includes what they typed by hand)
${JSON.stringify(draft, null, 1)}

## Rules
- FIRST dictation (form mostly empty): write BOTH fields. The title is a single line naming the need or the problem — no marketing verb, no "please", ≤ 120 characters. The body is the detail: what they are trying to do, what blocks them, what they expected. Structure it in markdown when the words support it (a short paragraph, or a list when several distinct points were made).
- FOLLOW-UP dictation ("ajoute que…", "reformule le titre", "enlève la dernière phrase"): apply EXACTLY that, keeping everything else word for word. Never rewrite the whole thing because one sentence was added.
- NEVER invent. No cause you were not told, no step that was not described, no severity, no priority, no workaround. If the person was vague, the feedback stays vague — that is information too.
- Keep their voice: first person if they speak in the first person, their words for their domain. You are transcribing a thought into a form, not writing a support ticket about it.
- Write \`title\` and \`body\` in the language the person dictates in; write \`reply\` in ${locale === "fr" ? "French (with proper accents)" : "English"}.
- Every field of the tool is required: to leave one untouched, pass back its current value unchanged.`;
}

/** Whitelist what the model returns: two fields, bounded, never empty. */
export function sanitizeFeedbackPatch(
  raw: Record<string, unknown>,
  draft: FeedbackVoiceDraft
): { patch: FeedbackVoicePatch; rejected: string[] } {
  const patch: FeedbackVoicePatch = {};
  const rejected: string[] = [];

  if (raw.title !== undefined) {
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    if (!title) rejected.push("title: must be a non-empty string");
    // The two fields being `required`, a model that only wants to touch the
    // body returns the title identically: this is not a change, and the
    // letting it pass would cause the field to flash for nothing.
    else if (title !== draft.title) patch.title = title.slice(0, FEEDBACK_TITLE_MAX);
  }
  if (raw.body !== undefined) {
    if (typeof raw.body !== "string") rejected.push("body: must be a string");
    else if (raw.body !== draft.body) patch.body = raw.body.slice(0, FEEDBACK_BODY_MAX);
  }

  return { patch, rejected };
}

/** Cuts the transcript and history tours received from the client. */
export function normalizeVoiceTranscript(value: unknown): string {
  return typeof value === "string"
    ? sanitizeAssistantMessageContent(value).slice(0, MAX_TRANSCRIPT_CHARS)
    : "";
}

export function normalizeVoiceHistory(value: unknown): FeedbackVoiceTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (turn): turn is FeedbackVoiceTurn =>
        !!turn &&
        typeof turn === "object" &&
        ((turn as FeedbackVoiceTurn).role === "user" ||
          (turn as FeedbackVoiceTurn).role === "assistant") &&
        typeof (turn as FeedbackVoiceTurn).content === "string"
    )
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => ({
      role: turn.role,
      content: sanitizeAssistantMessageContent(turn.content).slice(
        0,
        MAX_HISTORY_CHARS
      ),
    }));
}

export function normalizeVoiceDraft(value: unknown): FeedbackVoiceDraft {
  const raw = (value ?? {}) as Record<string, unknown>;
  return {
    title: typeof raw.title === "string" ? raw.title.slice(0, FEEDBACK_TITLE_MAX) : "",
    body: typeof raw.body === "string" ? raw.body.slice(0, FEEDBACK_BODY_MAX) : "",
  };
}

/** The admin flag, read once per call (values ​​are cached). */
export async function feedbackVoiceEnabled(): Promise<boolean> {
  const cfg = await getAppConfigValues([FEEDBACK_VOICE_ENABLED_KEY]);
  return (cfg[FEEDBACK_VOICE_ENABLED_KEY] ?? "true").trim() !== "false";
}

/**
 * Listening: audio → text, one line in the ledger (seq 0 of the run).
 *
 * Returns `null` when the model has heard nothing — Whisper fills the silence
 * ("...", "♪"), and a return invented from that costs more expensive than
 * say. The usage line is returned in all cases: the call was made.
 */
export async function transcribeFeedbackAudio({
  audio,
  locale,
  runId,
  billTo,
  projectId,
}: {
  audio: Blob;
  locale: string;
  runId: string;
  billTo: AiUsageBillTo;
  projectId: string;
}): Promise<{ text: string | null; usage: AiUsageInput[] }> {
  const format = resolveAudioFormat(audio.type || "audio/webm");
  if (!format) throw new Error(`Unsupported audio mime type: ${audio.type}`);

  const runtime = await feedbackRuntime(billTo, projectId, "transcription_model");
  const cfg = runtime ? null : await getAppConfigValues(modelConfigKeys("transcription_model"));
  const model = runtime?.model ?? resolveFromValues("transcription_model", cfg ?? {}).model;
  const apiKey = runtime?.apiKey ?? requireApiKey();

  const audioBase64 = Buffer.from(await audio.arrayBuffer()).toString("base64");
  // The pattern ACTUALLY called: routing shortcut fallback (MIN-263)
  // can remove the suffix, and it is this value which goes to the ledger.
  let usedModel = model;
  const result = await withModelSuffixFallback(
    model,
    (m) => {
      usedModel = m;
      return transcribeAudio(m, audioBase64, format, apiKey, {
        language: locale,
        title: "minddy Feedback voice",
        providerId: runtime?.provider,
        baseUrl: runtime?.baseUrl,
      });
    },
    { logPrefix: "[feedback-voice]" },
  );
  const usage: AiUsageInput[] = [
    {
      runId,
      seq: 0,
      feature: "feedback_voice",
      provider: runtime?.provider ?? "openrouter",
      keyMode: runtime?.mode ?? "platform",
      model: usedModel,
      promptTokens: result.inputTokens || null,
      completionTokens: result.outputTokens || null,
      totalTokens: (result.inputTokens || 0) + (result.outputTokens || 0) || null,
      cost: result.cost || null,
      billTo,
      projectId,
    },
  ];
  const text = result.text.trim();
  return { text: /[\p{L}\p{N}]/u.test(text) ? text : null, usage };
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

/**
 * Storage: transcript → patch of the form (seq 1 of the run).
 *
 * A single call, the forced tool: unlike ticket dictation, there is
 * neither id to find nor enum to respect — nothing which justifies a loop of
 * correction. The model writes two fields, we validate them, it's finished.
 */
export async function runFeedbackVoicePass({
  transcript,
  draft,
  history,
  locale,
  projectName,
  surface,
  runId,
  seq,
  billTo,
  projectId,
}: {
  transcript: string;
  draft: FeedbackVoiceDraft;
  history: FeedbackVoiceTurn[];
  locale: string;
  projectName: string;
  surface: "board" | "internal";
  runId: string;
  /** Position of the call in the run: 1 after listening, 0 if it comes alone. */
  seq: number;
  billTo: AiUsageBillTo;
  projectId: string;
}): Promise<{ patch: FeedbackVoicePatch; reply: string; usage: AiUsageInput[] }> {
  const runtime = await feedbackRuntime(billTo, projectId, "dictate_model");
  const cfg = runtime ? null : await getAppConfigValues(modelConfigKeys("dictate_model"));
  const model = runtime?.model ?? resolveFromValues("dictate_model", cfg ?? {}).model;
  if (!runtime) requireApiKey();

  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: buildFeedbackVoicePrompt({ projectName, draft, locale, surface }),
    },
    ...history,
    { role: "user", content: transcript },
  ];

  const effectiveRuntime =
    runtime ??
    (await resolveAiRuntime({
      userId: "userId" in billTo ? billTo.userId : "",
      modelKey: "dictate_model",
      surface: "feedback",
    }));
  const { response } = await fetchAiChat(
    effectiveRuntime,
    model,
    (m) => ({
      model: m,
      messages,
      tools: [UPDATE_FEEDBACK_TOOL],
      toolChoice: { type: "function", function: { name: "update_feedback" } },
      maxOutputTokens: 4096,
    }),
    "Numo (minddy)",
    "[feedback-voice]",
  );
  if (!response.ok) {
    throw new Error(
      `LLM error (${response.status}): ${(await response.text()).slice(0, 200)}`
    );
  }
  const data = (await response.json()) as {
    choices?: { message?: OpenRouterMessage }[];
    id?: string;
    model?: string;
    usage?: OpenRouterUsage;
  };
  const u = parseOpenRouterUsage(data.usage);
  const usage: AiUsageInput[] = [
    {
      runId,
      seq,
      feature: "feedback_voice",
      provider: effectiveRuntime.provider,
      keyMode: effectiveRuntime.mode,
      model: data.model ?? model,
      generationId: data.id ?? null,
      promptTokens: u.promptTokens,
      completionTokens: u.completionTokens,
      totalTokens: u.totalTokens,
      cost: u.cost,
      billTo,
      projectId,
    },
  ];

  const message = data.choices?.[0]?.message;
  const call = message?.tool_calls?.[0];
  if (!call || call.function.name !== "update_feedback") {
    throw new Error("no update_feedback call");
  }
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(call.function.arguments || "{}");
  } catch {
    throw new Error("invalid update_feedback arguments");
  }
  const { patch } = sanitizeFeedbackPatch(args, draft);
  const reply = typeof args.reply === "string" ? args.reply.trim().slice(0, 300) : "";
  return { patch, reply, usage };
}

function requireApiKey(): string {
  if (!isManagedAiEnabled()) {
    throw new Error("Managed AI is not configured. Configure BYOK or enable MINDDY_MANAGED_AI.");
  }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");
  return apiKey;
}
