import { NextRequest, after } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getAppConfigValues } from "@/lib/server/app-config";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import {
  transcribeAudio,
  type TranscribeAudioFormat,
} from "@/lib/server/openrouter-transcribe";
import { recordAiUsage, newRunId } from "@/lib/server/ai-usage";
import { ensureUsageBudget } from "@/lib/server/usage";
import {
  isPlanLimitError,
  planLimitResponse,
} from "@/lib/server/plan-limit-error";

// Une longue dictée met plus de temps à remonter qu'une courte : la route
// prend le budget maximal de la plateforme, sous lequel le timeout de
// transcribeAudio (240 s) tombe avec de la marge.
export const maxDuration = 300;

// La dictée n'a pas de limite de durée — seulement ce plafond de charge utile.
// Au débit de parole épinglé côté client (48 kb/s), 10 Mo valent ~28 minutes de
// prise ; au-delà, la réponse est un 413 et le client affiche `Dictate.tooLarge`.
const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB
const RATE_LIMIT = { limit: 30, windowMs: 60 * 60 * 1000 } as const;
const FALLBACK_MODEL = "openai/whisper-large-v3";

function resolveAudioFormat(mimeType: string): TranscribeAudioFormat | null {
  const lower = mimeType.toLowerCase();
  if (lower.includes("webm")) return "webm";
  if (lower.includes("ogg")) return "ogg";
  if (lower.includes("wav")) return "wav";
  if (lower.includes("mpeg") || lower.includes("mp3")) return "mp3";
  if (lower.includes("flac")) return "flac";
  if (lower.includes("m4a") || lower.includes("mp4")) return "m4a";
  if (lower.includes("aac")) return "aac";
  return null;
}

export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const rateLimit = checkSessionRateLimit(user.id, "transcribe", RATE_LIMIT);
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Too many requests", retry_after: rateLimit.retryAfter },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfter) },
      },
    );
  }

  // Budget d'usage du plan (MIN-72) — pré-vol avant l'appel de transcription.
  try {
    await ensureUsageBudget(user.id);
  } catch (err) {
    if (isPlanLimitError(err)) return planLimitResponse(err);
    throw err;
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const audio = formData.get("audio");
  if (!(audio instanceof Blob)) {
    return Response.json({ error: "audio field is required" }, { status: 400 });
  }
  if (audio.size === 0) {
    return Response.json({ error: "audio is empty" }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return Response.json(
      { error: "audio too large", max_bytes: MAX_AUDIO_BYTES },
      { status: 413 },
    );
  }

  const format = resolveAudioFormat(audio.type || "audio/webm");
  if (!format) {
    return Response.json(
      { error: `Unsupported audio mime type: ${audio.type}` },
      { status: 400 },
    );
  }

  const langRaw = formData.get("lang");
  const language =
    typeof langRaw === "string" && langRaw.trim() ? langRaw.trim() : undefined;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("[/api/transcribe] OPENROUTER_API_KEY not configured");
    return Response.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Model is DB-configured (app_config), like the assistant model.
  const cfg = await getAppConfigValues([
    "transcription_model",
    "transcription_model_provider",
  ]);
  const model = cfg.transcription_model?.trim() || FALLBACK_MODEL;
  let provider: Record<string, unknown> | undefined;
  if (cfg.transcription_model_provider?.trim()) {
    try {
      provider = JSON.parse(cfg.transcription_model_provider);
    } catch {
      console.warn(
        "[/api/transcribe] transcription_model_provider is not valid JSON, ignoring",
      );
    }
  }

  const arrayBuffer = await audio.arrayBuffer();
  const audioBase64 = Buffer.from(arrayBuffer).toString("base64");

  try {
    const result = await transcribeAudio(model, audioBase64, format, apiKey, {
      language,
      provider,
      title: "minddy Dictate",
    });

    // Suivi des coûts : appel unique (un run d'un seul appel). Best-effort.
    after(() =>
      recordAiUsage({
        runId: newRunId(),
        feature: "transcription",
        model,
        promptTokens: result.inputTokens || null,
        completionTokens: result.outputTokens || null,
        totalTokens:
          (result.inputTokens || 0) + (result.outputTokens || 0) || null,
        cost: result.cost || null,
        billTo: { userId: user.id },
      }),
    );

    return Response.json({
      text: result.text,
      model,
      durationSeconds: result.seconds,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Transcription failed";
    console.error("[/api/transcribe]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
