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
  buildDemoPrompt,
  isSameOrigin,
  resolveAudioFormat,
  resolveLocale,
  resolveTimeZone,
  sanitizeDemoTicket,
  todayIn,
  withinDailyBudget,
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

/**
 * Dictation, playable without an account (MIN-150).
 *
 * Minddy's only AI endpoint open to an ANONYMOUS visitor. It exists because
 * that the value of the product was only demonstrable after registration: we let go
 * a sentence, all the fields are sorted — and no screenshot is
 * feel that.
 *
 * What it does, and nothing else: transcribe a take of a few seconds
 * (or reread an example sentence), then store it in the fields of a ticket
 * FICTITIOUS (`lib/demo-dictation.ts`). He reads no projects, writes no
 * ticket, only touches the base for two things: reading the AI ​​configuration,
 * and enter the expense in the ledger — in `platform`, because it is free.
 *
 * ## What protects him
 *
 * Four safeguards, from least expensive to most expensive (the first three are in
 * `lib/server/demo-dictation.ts`, exercised by its test):
 *
 * 1. **Same origin** — the zero-cost filter against the script that wants a
 *     API de transcription gratuite.
 *  2. **Par IP** — dix passages par heure. Un visiteur curieux en joue trois ou
 * four ; beyond that, it is no longer a visit.
 * 3. **Overall daily ceiling**, per instance: the expense of one day is
 * limited whatever happens, including on rotating addresses.
 * 4. **`demo_dictation_enabled`** switch in `/admin`: the demo cuts out
 * without deployment.
 *
 * If we had to go further, it would be bot detection in front of the page —
 * but it is paid by weight on the landing, and the passage costs $0.0003 (measured
 * to the ledger: $0.0001 transcription + $0.0002 storage). The ceiling
 * daily therefore limits the expense to ~$0.15 per day and per instance: very
 * below what that weight would cost.
 *
 * ## No free text input
 *
 * The model only sees two things: the transcription of the visitor's voice,
 * or an example sentence that the SERVER rereads in its own catalog to
 * from an identifier (`stripe`, `export`, `onboarding`). The customer does not send
 * never text, and everything the model returns is re-validated
 * (`sanitizeDemoTicket`) before leaving here.
 */

export const runtime = "nodejs";
// A demo take takes 15 seconds at most: short transcription, small model for
// storage. Nothing to do with the 300 s of /api/transcribe.
export const maxDuration = 60;

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
            title: "minddy public demo",
          });
        },
        { logPrefix: "[api/demo/dictate]" },
      );
      transcript = result.text.trim();
      // The two calls of a passage share `runId` and the feature
      // `landing_demo`: the admin table makes ONE line (“the demo”), and
      // its cost per run is the price of a passage. The `seq` and the model
      // distinguish the transcription from the storage in the detail of the run.
      usageRows.push({
        runId,
        seq: 0,
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

  // ── Tidying up: one call, one tool, forced ─────────────────
  const model = resolveFromValues("dictate_model", cfg).model;
  let ticket: DemoTicket;
  try {
    const { response } = await fetchOpenRouterWithSuffixFallback(
      OPENROUTER_URL,
      model,
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
                {
                  role: "system",
                  content: buildDemoPrompt({ locale, today, members, categories }),
                },
                { role: "user", content: transcript },
              ],
              tools: [FILL_TICKET_TOOL],
              toolChoice: { type: "function", function: { name: "fill_ticket" } },
              maxOutputTokens: 700,
            },
            "openrouter",
          ),
        ),
        signal: AbortSignal.timeout(30_000),
      }),
      "[api/demo/dictate]",
    );
    if (!response.ok) {
      throw new Error(
        `LLM error (${response.status}): ${(await response.text()).slice(0, 200)}`,
      );
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
      seq: usageRows.length,
      feature: "landing_demo",
      model: data.model ?? model,
      generationId: data.id ?? null,
      promptTokens: u.promptTokens,
      completionTokens: u.completionTokens,
      totalTokens: u.totalTokens,
      cost: u.cost,
      billTo: BILL_TO,
    });

    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!call || call.function.name !== "fill_ticket") {
      throw new Error("no fill_ticket call");
    }
    ticket = sanitizeDemoTicket(JSON.parse(call.function.arguments || "{}"), {
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
