import "server-only";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { fetchAiProvider } from "@/lib/server/ai-provider-request";
import { handleManagedKeyRejection } from "@/lib/server/ai-runtime";
import type { AgentProviderId } from "@/lib/agent-providers";
import { stripTranscriptionHallucinations } from "@/lib/dictation-hallucinations";

/**
 * Speech-to-text helper (ported from AutoKap). OpenRouter's
 * /api/v1/audio/transcriptions takes base64 audio; OpenAI and generic servers
 * the multipart upload; Gemini its native Interactions API.
 */

export type TranscribeAudioFormat =
  | "wav"
  | "mp3"
  | "flac"
  | "m4a"
  | "ogg"
  | "webm"
  | "aac";

/**
 * The MIME type that the browser actually saved → the format expected
 * by OpenRouter, or `null` if it is not audio that we can play.
 *
 * Here and not in each route: the four callers (dictation authenticated,
 * landing demo, return dictated) save with the SAME `MediaRecorder`,
 * so the table is the same — and a derived copy does a 400 on a
 * browser, never on the developer's.
 */
export function resolveAudioFormat(mimeType: string): TranscribeAudioFormat | null {
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

export interface TranscribeAudioOptions {
  language?: string;
  /**
   * Spelling hint (the account's dictation vocabulary). Sent as the standard
   * `prompt` field to direct OpenAI-compatible providers only: OpenRouter's
   * endpoint has no generic equivalent, so there the cleanup pass carries it.
   */
  prompt?: string;
  temperature?: number;
  /**
   * The same vocabulary as a list of terms, for a provider with a dedicated
   * field (Gemini's `custom_vocabulary`). Falls back to splitting `prompt`.
   */
  vocabulary?: string[];
  provider?: Record<string, unknown>;
  title?: string;
  providerId?: AgentProviderId;
  baseUrl?: string;
  /** Owner of a per-account Minddy Cloud key (MIN-761), so a refusal is handled. */
  managedKeyOwner?: string;
}

export interface TranscribeAudioResult {
  text: string;
  /** Duration of the input audio in seconds, as reported by OpenRouter. */
  seconds: number;
  /** Cost in USD reported by OpenRouter (may be 0 for some providers). */
  cost: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * The language hint as the transcription APIs read it: ISO-639-1 (`pt`, not
 * the interface locale `pt-BR`), or nothing for a value of another shape.
 */
export function transcriptionLanguage(locale: string | null | undefined): string | undefined {
  const primary = locale?.trim().split(/[-_]/)[0]?.toLowerCase();
  return primary && /^[a-z]{2}$/.test(primary) ? primary : undefined;
}

/** Gemini's accepted MIME type for each recorded format (no `audio/mp4`: `audio/m4a`). */
const GEMINI_AUDIO_MIME: Record<TranscribeAudioFormat, string> = {
  wav: "audio/wav",
  mp3: "audio/mp3",
  flac: "audio/flac",
  m4a: "audio/m4a",
  ogg: "audio/ogg",
  webm: "audio/webm",
  aac: "audio/aac",
};

/** Gemini bills audio at 25 tokens per second of input (pricing page). */
const GEMINI_AUDIO_TOKENS_PER_SECOND = 25;

/** The Interactions endpoint beside a Gemini base URL (`…/v1beta/openai` → `…/v1beta/interactions`). */
export function geminiInteractionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "").replace(/\/openai$/i, "")}/interactions`;
}

/**
 * Gemini 3.5 Transcribe through the native Interactions API (MIN-979): the
 * OpenAI-compatible layer has no `/audio/transcriptions`. The language hint
 * and the vocabulary go in `transcription_config`; the default verbatim mode
 * keeps the words as heard, as the cleanup pass that may follow expects.
 * Stateless (`store: false`).
 */
async function transcribeWithGemini(
  model: string,
  audioBase64: string,
  format: TranscribeAudioFormat,
  apiKey: string,
  options: TranscribeAudioOptions,
): Promise<TranscribeAudioResult> {
  const language = options.language?.trim();
  const vocabulary = (options.vocabulary ?? options.prompt?.split(",") ?? [])
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 100);
  const transcriptionConfig = {
    // BCP-47: `fr` and `pt-BR` are both valid; anything else is left to detection.
    ...(language && /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(language) ? { language_codes: [language] } : {}),
    ...(vocabulary.length > 0 ? { custom_vocabulary: vocabulary } : {}),
  };
  const res = await fetchAiProvider("google", geminiInteractionsUrl(options.baseUrl ?? ""), {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model.startsWith("models/") ? model : `models/${model}`,
      store: false,
      input: [{ type: "audio", mime_type: GEMINI_AUDIO_MIME[format], data: audioBase64 }],
      ...(Object.keys(transcriptionConfig).length > 0
        ? { generation_config: { transcription_config: transcriptionConfig } }
        : {}),
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) {
    throw new Error(`STT error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    status?: string;
    steps?: { type?: string; content?: { type?: string; text?: string }[] }[];
    usage?: {
      total_input_tokens?: number;
      total_output_tokens?: number;
      input_tokens_by_modality?: { modality?: string; tokens?: number }[];
    };
  };
  if (data.status && data.status !== "completed") {
    throw new Error(`STT error: interaction ${data.status}`);
  }
  const text = (data.steps ?? [])
    .filter((step) => step.type === "model_output")
    .flatMap((step) => step.content ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
  const audioTokens = data.usage?.input_tokens_by_modality
    ?.find((entry) => entry.modality === "audio")?.tokens ?? 0;
  return {
    text: stripTranscriptionHallucinations(text),
    // No duration is reported: derived from the billed audio tokens.
    seconds: Math.round(audioTokens / GEMINI_AUDIO_TOKENS_PER_SECOND),
    // A personal key's provider bills the call; minddy records no cost for it.
    cost: 0,
    inputTokens: data.usage?.total_input_tokens ?? 0,
    outputTokens: data.usage?.total_output_tokens ?? 0,
  };
}

export async function transcribeAudio(
  model: string,
  audioBase64: string,
  format: TranscribeAudioFormat,
  apiKey: string,
  options?: TranscribeAudioOptions,
): Promise<TranscribeAudioResult> {
  if (options?.providerId === "google") {
    return transcribeWithGemini(model, audioBase64, format, apiKey, options);
  }
  const body: Record<string, unknown> = {
    model,
    input_audio: { data: audioBase64, format },
  };
  const language = transcriptionLanguage(options?.language);
  if (language) body.language = language;
  if (options?.temperature !== undefined) body.temperature = options.temperature;
  if (options?.provider && Object.keys(options.provider).length > 0) {
    body.provider = options.provider;
  }

  const providerId = options?.providerId ?? "openrouter";
  const baseUrl = (options?.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const direct = providerId === "openai" || providerId === "generic";
  const directBody = direct ? new FormData() : null;
  if (directBody) {
    const bytes = Uint8Array.from(Buffer.from(audioBase64, "base64"));
    directBody.append("file", new Blob([bytes]), `audio.${format}`);
    directBody.append("model", model);
    if (language) {
      // GPT Transcribe replaces the legacy singular language hint with an array.
      const languageField = providerId === "openai" && /^gpt-transcribe(?:-|$)/i.test(model)
        ? "languages[]"
        : "language";
      directBody.append(languageField, language);
    }
    if (options?.temperature !== undefined) {
      directBody.append("temperature", String(options.temperature));
    }
    if (options?.prompt) directBody.append("prompt", options.prompt);
  }

  const res = await fetchAiProvider(providerId, `${baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(direct
        ? {}
        : {
            "Content-Type": "application/json",
            "HTTP-Referer": SITE_URL,
            "X-Title": options?.title ?? SITE_NAME,
          }),
    },
    body: directBody ?? JSON.stringify(body),
    // As dictation is no longer limited in duration, one take can be worth several
    // tens of minutes of audio: 120 s was no longer enough to send it and
    // transcribe it. We remain under the maxDuration = 300 of /api/transcribe.
    signal: AbortSignal.timeout(240_000),
  });

  if (!res.ok) {
    const text = await res.text();
    await handleManagedKeyRejection(
      { apiKey, managedKeyOwner: options?.managedKeyOwner },
      res.status,
      text,
    );
    throw new Error(
      `STT error ${res.status}: ${text.slice(0, 300)}`,
    );
  }

  const data = (await res.json()) as {
    text?: string;
    usage?: {
      cost?: number;
      input_tokens?: number;
      output_tokens?: number;
      seconds?: number;
    };
  };

  return {
    // Every transcription path goes through here, so credits and sign-offs the
    // model invents on silence (MIN-831) never reach a caller.
    text: stripTranscriptionHallucinations(data.text ?? ""),
    seconds: data.usage?.seconds ?? 0,
    cost: data.usage?.cost ?? 0,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}
