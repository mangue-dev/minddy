import { NextResponse, after, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { defaultLocale, type Locale } from "@/i18n/config";
import { getAppConfigValues } from "@/lib/server/app-config";
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
 * La dictée, jouable sans compte (MIN-150).
 *
 * Le seul endpoint IA de minddy ouvert à un visiteur ANONYME. Il existe parce
 * que la valeur du produit n'était démontrable qu'après inscription : on lâche
 * une phrase, tous les champs se rangent — et aucune capture d'écran ne fait
 * ressentir ça.
 *
 * Ce qu'il fait, et rien d'autre : transcrire une prise de quelques secondes
 * (ou relire une phrase d'exemple), puis la ranger dans les champs d'un ticket
 * FICTIF (`lib/demo-dictation.ts`). Il ne lit aucun projet, n'écrit aucun
 * ticket, ne touche à la base que pour deux choses : lire la configuration IA,
 * et inscrire la dépense au ledger — en `platform`, parce qu'elle est offerte.
 *
 * ## Ce qui le protège
 *
 * Quatre garde-fous, du moins cher au plus cher (les trois premiers sont dans
 * `lib/server/demo-dictation.ts`, exercés par son test) :
 *
 *  1. **Même origine** — le filtre à coût nul contre le script qui voudrait une
 *     API de transcription gratuite.
 *  2. **Par IP** — dix passages par heure. Un visiteur curieux en joue trois ou
 *     quatre ; au-delà, ce n'est plus une visite.
 *  3. **Plafond global journalier**, par instance : la dépense d'une journée est
 *     bornée quoi qu'il arrive, y compris sur adresses tournantes.
 *  4. **Interrupteur `demo_dictation_enabled`** dans `/admin` : la démo se coupe
 *     sans déploiement.
 *
 * S'il fallait aller plus loin, ce serait une détection de bot devant la page —
 * mais ça se paye en poids sur la landing, et le passage coûte 0,0003 $ (mesuré
 * au ledger : 0,0001 $ de transcription + 0,0002 $ de rangement). Le plafond
 * journalier borne donc la dépense à ~0,15 $ par jour et par instance : très en
 * dessous de ce que coûterait ce poids-là.
 *
 * ## Aucune entrée en texte libre
 *
 * Le modèle ne voit que deux choses : la transcription de la voix du visiteur,
 * ou une phrase d'exemple que le SERVEUR relit dans son propre catalogue à
 * partir d'un identifiant (`stripe`, `export`, `onboarding`). Le client n'envoie
 * jamais de texte, et tout ce que le modèle renvoie est re-validé
 * (`sanitizeDemoTicket`) avant de sortir d'ici.
 */

export const runtime = "nodejs";
// Une prise de démo fait 15 s au plus : transcription courte, petit modèle pour
// le rangement. Rien à voir avec les 300 s de /api/transcribe.
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

  const apiKey = process.env.OPENROUTER_API_KEY;
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

  // ── L'entrée : une prise au micro, ou une phrase d'exemple ──────────────
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
    // Le modèle RÉELLEMENT appelé : le repli du raccourci de routage (MIN-263)
    // peut retirer le suffixe, et c'est cette valeur-là qui va au ledger.
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
      // Les deux appels d'un passage partagent `runId` et la feature
      // `landing_demo` : le tableau admin en fait UNE ligne (« la démo »), et
      // son coût par run est le prix d'un passage. Le `seq` et le modèle
      // distinguent la transcription du rangement dans le détail du run.
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
    // Whisper meuble le silence ("...", "♪") : sans lettre ni chiffre il n'a
    // rien entendu, et le dire coûte moins cher qu'un ticket inventé.
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

  // ── Le décor fictif, dans la langue du visiteur ────────────────────────
  const t = await getTranslations({ locale, namespace: "Landing" });
  const members = DEMO_MEMBER_IDS.map((id) => ({ id, name: t(DEMO_MEMBER_KEYS[id]) }));
  const categories = DEMO_CATEGORY_IDS.map((id) => ({
    id,
    name: t(DEMO_CATEGORY_KEYS[id]),
  }));
  const today = todayIn(timeZone);

  // ── Le rangement : un seul appel, un seul outil, forcé ─────────────────
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
    // Une réponse personnelle et jetable : rien à mettre en cache nulle part.
    { headers: { "Cache-Control": "no-store" } },
  );
}
