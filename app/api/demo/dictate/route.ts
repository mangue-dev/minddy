import { NextResponse, after, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { defaultLocale, type Locale } from "@/i18n/config";
import { getAppConfigValues } from "@/lib/server/app-config";
import { isManagedAiEnabled } from "@/lib/managed-services";
import {
  fetchOpenRouterWithSuffixFallback,
  modelConfigKeys,
  resolveFromValues,
  withModelSuffixFallback,
} from "@/lib/server/model-config";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { getClientIp } from "@/lib/server/request-ip";
import { transcribeAudio } from "@/lib/server/openrouter-transcribe";
import {
  recordAiUsage,
  newRunId,
  parseOpenRouterUsage,
  type AiUsageInput,
  type OpenRouterUsage,
} from "@/lib/server/ai-usage";
import {
  FILL_TICKET_TOOL,
  FILL_TICKET_RESPONSE_FORMAT,
  buildDemoPrompt,
  isSameOrigin,
  resolveAudioFormat,
  resolveLocale,
  resolveTimeZone,
  sanitizeDemoTicket,
  todayIn,
  withinDailyBudget,
  extractDemoFillTicketArguments,
} from "@/lib/server/demo-dictation";
import {
  DEMO_CATEGORY_IDS,
  DEMO_CATEGORY_KEYS,
  DEMO_MAX_AUDIO_BYTES,
  DEMO_MEMBER_IDS,
  DEMO_MEMBER_KEYS,
  DEMO_SAMPLE_KEYS,
  isDemoSampleId,
  type DemoTicket,
} from "@/lib/demo-dictation";
import {
  aiChatProviderHeaders,
  translateAiChatRequest,
} from "@/lib/ai-chat";
import { polishDictationTranscript } from "@/lib/server/dictation-polish";
import { resolvePolishedDictation } from "@/lib/dictation-context";

/**
 * Dictation demo available without an account (MIN-150).
 *
 * This is minddy's only AI endpoint open to an anonymous visitor. It
 * transcribes and cleans up a short take, or resolves a server-owned sample,
 * then fills a fictional issue (`lib/demo-dictation.ts`). It never reads a
 * project or writes an issue. Its only persistent effects are reading the AI
 * configuration and recording platform-funded usage.
 *
 * Four safeguards bound that usage: a same-origin check, an hourly IP limit,
 * a per-instance daily ceiling, and the `demo_dictation_enabled` admin switch.
 * The first three live in `lib/server/demo-dictation.ts` and are covered by
 * its tests. Bot detection could be added later if these inexpensive controls
 * stop being sufficient.
 *
 * The client cannot submit arbitrary text. The model sees either recognized
 * speech or a sample sentence selected by identifier from the server catalog,
 * and every generated field is validated by `sanitizeDemoTicket` before it is
 * returned.
 */

export const runtime = "nodejs";
// A demo take is short, but it now includes transcription, cleanup, and issue
// formatting. The extra headroom covers two sequential lightweight model calls.
export const maxDuration = 120;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const IP_RATE_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 } as const;
const GLOBAL_DAILY_LIMIT = 500;
const BILL_TO = { platform: "landing voice demo" } as const;

type OpenRouterMessage = {
  role: "assistant";
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
};

type DemoCompletionData = {
  choices?: { message?: OpenRouterMessage }[];
  id?: string;
  model?: string;
  usage?: OpenRouterUsage;
};

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const rate = checkSessionRateLimit(
    `ip:${getClientIp(request)}`,
    "demo-dictate",
    IP_RATE_LIMIT,
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retry_after: rate.retryAfter },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }
  if (!withinDailyBudget(GLOBAL_DAILY_LIMIT)) {
    return NextResponse.json(
      { error: "rate_limited", retry_after: 3600 },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  const apiKey = isManagedAiEnabled() ? process.env.OPENROUTER_API_KEY : undefined;
  if (!apiKey) {
    console.error("[api/demo/dictate] OPENROUTER_API_KEY not configured");
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const cfg = await getAppConfigValues([
    "demo_dictation_enabled",
    ...modelConfigKeys("transcription_model"),
    ...modelConfigKeys("dictate_model"),
  ]);
  if ((cfg.demo_dictation_enabled ?? "true").trim() === "false") {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  // ── The entrance: a microphone, or an example sentence ──────────────
  const runId = newRunId();
  const usageRows: AiUsageInput[] = [];
  let nextUsageSeq = 0;
  let transcript = "";
  let locale: Locale = defaultLocale;
  let timeZone = "UTC";

  if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    locale = resolveLocale(form.get("locale"));
    timeZone = resolveTimeZone(form.get("timeZone"));

    const audio = form.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    if (audio.size > DEMO_MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }
    const format = resolveAudioFormat(audio.type || "audio/webm");
    if (!format) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }

    const model = resolveFromValues("transcription_model", cfg).model;
    // The Model ACTUALLY Called: Routing Shortcut Fallback (MIN-263)
    // can remove the suffix, and it is this value which goes to the ledger.
    let usedModel = model;
    try {
      const audioBase64 = Buffer.from(await audio.arrayBuffer()).toString("base64");
      const result = await withModelSuffixFallback(
        model,
        (m) => {
          usedModel = m;
          return transcribeAudio(m, audioBase64, format, apiKey, {
            language: locale,
            temperature: 0,
            title: "minddy public demo",
          });
        },
        { logPrefix: "[api/demo/dictate]" },
      );
      transcript = result.text.trim();
      // All calls of a passage share `runId` and the feature `landing_demo`: the
      // admin table makes ONE line (“the demo”), and its cost per run is the price
      // of a passage. The `seq` and the model distinguish the transcription from
      // cleanup and the one or two form-formatting attempts in the run detail.
      usageRows.push({
        runId,
        seq: nextUsageSeq++,
        feature: "landing_demo",
        model: usedModel,
        promptTokens: result.inputTokens || null,
        completionTokens: result.outputTokens || null,
        cost: result.cost || null,
        billTo: BILL_TO,
      });
    } catch (err) {
      console.error("[api/demo/dictate] transcription failed:", (err as Error).message);
      return NextResponse.json({ error: "failed" }, { status: 502 });
    }
    // Whisper fills the silence ("...", "♪"): without letters or numbers it has
    // heard nothing, and saying it costs less than a made-up ticket.
    if (!/[\p{L}\p{N}]/u.test(transcript)) {
      after(() => recordAiUsage(usageRows));
      return NextResponse.json({ error: "empty" }, { status: 422 });
    }

    // The public demo uses the same editorial pass as every authenticated
    // dictation before its issue-specific formatter fills the fictional form.
    const cleaned = await polishDictationTranscript({
      transcript,
      context: "issue_form",
      record: {
        runId,
        seq: nextUsageSeq++,
        feature: "landing_demo",
        billTo: BILL_TO,
      },
    }).catch((err) => {
      console.error(
        "[api/demo/dictate] cleanup failed, returning raw transcript:",
        err instanceof Error ? err.message : err,
      );
      return null;
    });
    transcript = resolvePolishedDictation(transcript, cleaned).text;
  } else {
    let body: { sample?: unknown; locale?: unknown; timeZone?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || !isDemoSampleId(body.sample)) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    locale = resolveLocale(body.locale);
    timeZone = resolveTimeZone(body.timeZone);
    const t = await getTranslations({ locale, namespace: "Landing" });
    transcript = t(DEMO_SAMPLE_KEYS[body.sample]);
  }

  // ── The fictional setting, in the visitor's language ────────────────────────
  const t = await getTranslations({ locale, namespace: "Landing" });
  const members = DEMO_MEMBER_IDS.map((id) => ({ id, name: t(DEMO_MEMBER_KEYS[id]) }));
  const categories = DEMO_CATEGORY_IDS.map((id) => ({
    id,
    name: t(DEMO_CATEGORY_KEYS[id]),
  }));
  const today = todayIn(timeZone);

  // ── Tidying up: one forced tool call, with a structured-output fallback ──
  const model = resolveFromValues("dictate_model", cfg).model;
  const prompt = buildDemoPrompt({ locale, today, members, categories });
  const fetchCompletion = async (requestedModel: string, useStructuredOutput: boolean) => {
    const result = await fetchOpenRouterWithSuffixFallback(
      OPENROUTER_URL,
      requestedModel,
      (m) => ({
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...aiChatProviderHeaders("openrouter", "minddy public demo"),
        },
        body: JSON.stringify(
          translateAiChatRequest(
            {
              model: m,
              messages: [
                { role: "system", content: prompt },
                { role: "user", content: transcript },
              ],
              ...(useStructuredOutput
                ? {
                    responseFormat: FILL_TICKET_RESPONSE_FORMAT,
                    extensions: { plugins: [{ id: "response-healing" }] },
                  }
                : {
                    tools: [FILL_TICKET_TOOL],
                    // The request contains one tool, so `required` is enough and is
                    // supported more consistently by OpenAI-compatible Gemini routes.
                    toolChoice: "required",
                    parallelToolCalls: false,
                  }),
              // Gemini 3.1 may spend completion tokens on reasoning before it
              // emits the tool call or the structured object.
              reasoning: { effort: "minimal" },
              maxOutputTokens: 1200,
            },
            "openrouter",
          ),
        ),
        signal: AbortSignal.timeout(30_000),
      }),
      "[api/demo/dictate]",
    );
    if (!result.response.ok) {
      throw new Error(
        `LLM error (${result.response.status}): ${(await result.response.text()).slice(0, 200)}`,
      );
    }

    const data = (await result.response.json()) as DemoCompletionData;
    const u = parseOpenRouterUsage(data.usage);
    usageRows.push({
      runId,
      seq: nextUsageSeq++,
      feature: "landing_demo",
      model: data.model ?? result.model,
      generationId: data.id ?? null,
      promptTokens: u.promptTokens,
      completionTokens: u.completionTokens,
      totalTokens: u.totalTokens,
      cost: u.cost,
      billTo: BILL_TO,
    });
    return { data, model: result.model };
  };

  let ticket: DemoTicket;
  try {
    const primary = await fetchCompletion(model, false);
    let arguments_ = extractDemoFillTicketArguments(primary.data);
    if (!arguments_) {
      // Some providers return a normal message despite a required tool call.
      // Retry without tools and require the same contract as a JSON Schema response.
      const fallback = await fetchCompletion(primary.model, true);
      arguments_ = extractDemoFillTicketArguments(fallback.data);
    }
    if (!arguments_) {
      throw new Error("no structured fill_ticket response");
    }
    ticket = sanitizeDemoTicket(arguments_, {
      transcript,
      today,
      members,
      categories,
    });
  } catch (err) {
    console.error("[api/demo/dictate] fill failed:", (err as Error).message);
    after(() => recordAiUsage(usageRows));
    return NextResponse.json({ error: "failed" }, { status: 502 });
  }

  after(() => recordAiUsage(usageRows));
  return NextResponse.json(
    { transcript: transcript.slice(0, 600), ticket },
    // A personal, throwaway answer: nothing to cache anywhere.
    { headers: { "Cache-Control": "no-store" } },
  );
}
