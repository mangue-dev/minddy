import { NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getAppConfigValues } from "@/lib/server/app-config";
import {
  modelConfigKeys,
  withModelSuffixFallback,
} from "@/lib/server/model-config";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import {
  resolveAudioFormat,
  transcribeAudio,
} from "@/lib/server/openrouter-transcribe";
import { recordAiUsage, newRunId, type AiFeature } from "@/lib/server/ai-usage";
import { ensureUsageBudget } from "@/lib/server/usage";
import { resolveAiRuntime } from "@/lib/server/ai-runtime";
import {
  isPlanLimitError,
  planLimitResponse,
} from "@/lib/server/plan-limit-error";
import {
  releaseProviderOperation,
  reserveProviderOperation,
} from "@/lib/server/provider-operation-guard";

// A long dictation takes longer to come back than a short one: the road
// takes the maximum budget of the platform, under which the timeout of
// transcribeAudio (240 s) falls with some margin.
export const maxDuration = 300;

// Dictation has no duration limit — only this payload cap.
// At the client-side pinned speech rate (48 kb/s), 10 MB is worth ~28 minutes of
// socket ; beyond that, the response is a 413 and the client displays `Dictate.tooLarge`.
const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB
const RATE_LIMIT = { limit: 30, windowMs: 60 * 60 * 1000 } as const;

/**
 * Under which feature of the ledger to register the take. By default `transcription`,
 * dictation of a ticket or objective. ONLY one other value is accepted:
 * the dictation of a return, which is counted separately (on the user side it falls into
 * “Feedback” and not in “Voice dictation”). Allowlist, not pass-through — the
 * customer does not freely choose an invoicing line.
 */
function resolveFeature(value: FormDataEntryValue | null): AiFeature {
  return value === "feedback_voice" ? "feedback_voice" : "transcription";
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

  // Model is DB-configured (app_config), like the assistant model.
  const cfg = await getAppConfigValues([
    ...modelConfigKeys("transcription_model"),
    "transcription_model_provider",
  ]);
  const runtime = await resolveAiRuntime({
    userId: user.id,
    modelKey: "transcription_model",
    surface: "voice",
  });
  const model = runtime.model;
  // The Model ACTUALLY Called: Routing Shortcut Fallback (MIN-263)
  // can remove the suffix, and it is this value which goes to the ledger.
  let usedModel = model;
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

  // One run per take. It is RENDERED to the client: the next step in a dictation
  // (the storage by Numo) returns it to its route, and the two calls read
  // then as a single line in the ledger.
  const runId = newRunId();
  const feature = resolveFeature(formData.get("feature"));

  // Budget pre-flight happens before the shared lease. The lease then admits
  // only one managed transcription per account until its usage row is written,
  // so concurrent requests cannot all spend against the same stale remainder.
  try {
    await ensureUsageBudget(user.id, "voice");
  } catch (err) {
    if (isPlanLimitError(err)) return planLimitResponse(err);
    throw err;
  }

  const lease = {
    actorId: user.id,
    provider: "managed-ai",
    operation: "transcription",
    resourceKey: `transcription:${user.id}`,
  };
  if (runtime.mode === "platform") {
    const reservation = await reserveProviderOperation({
      ...lease,
      limit: RATE_LIMIT.limit,
      windowSeconds: RATE_LIMIT.windowMs / 1000,
      dedupeSeconds: maxDuration,
    });
    if (reservation.state !== "reserved") {
      const unavailable = reservation.state === "unavailable";
      return Response.json(
        { error: unavailable ? "Transcription admission unavailable" : "Too many requests" },
        {
          status: unavailable ? 503 : 429,
          ...(reservation.retryAfter > 0
            ? { headers: { "Retry-After": String(reservation.retryAfter) } }
            : {}),
        },
      );
    }
  }

  try {
    const result = await withModelSuffixFallback(
      model,
      (m) => {
        usedModel = m;
        return transcribeAudio(m, audioBase64, format, runtime.apiKey, {
          language,
          provider: runtime.provider === "openrouter" ? provider : undefined,
          title: "minddy Dictate",
          providerId: runtime.provider,
          baseUrl: runtime.baseUrl,
        });
      },
      { logPrefix: "[/api/transcribe]" },
    );

    // Persist usage before releasing the shared lease so the next request's
    // budget pre-flight observes this call.
    await recordAiUsage({
      runId,
      feature,
      provider: runtime.provider,
      keyMode: runtime.mode,
      model: usedModel,
      promptTokens: result.inputTokens || null,
      completionTokens: result.outputTokens || null,
      totalTokens:
        (result.inputTokens || 0) + (result.outputTokens || 0) || null,
      cost: result.cost || null,
      billTo: { userId: user.id },
    });

    return Response.json({
      text: result.text,
      model,
      runId,
      durationSeconds: result.seconds,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Transcription failed";
    console.error("[/api/transcribe]", message);
    return Response.json({ error: message }, { status: 500 });
  } finally {
    if (runtime.mode === "platform") await releaseProviderOperation(lease);
  }
}
