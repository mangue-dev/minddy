import "server-only";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { fetchAiProvider } from "@/lib/server/ai-provider-request";
import type { AgentProviderId } from "@/lib/agent-providers";

/**
 * OpenRouter speech-to-text helper (ported from AutoKap).
 * Calls /api/v1/audio/transcriptions with base64-encoded audio.
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
  temperature?: number;
  provider?: Record<string, unknown>;
  title?: string;
  providerId?: AgentProviderId;
  baseUrl?: string;
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

export async function transcribeAudio(
  model: string,
  audioBase64: string,
  format: TranscribeAudioFormat,
  apiKey: string,
  options?: TranscribeAudioOptions,
): Promise<TranscribeAudioResult> {
  const body: Record<string, unknown> = {
    model,
    input_audio: { data: audioBase64, format },
  };
  if (options?.language) body.language = options.language;
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
    if (options?.language) directBody.append("language", options.language);
    if (options?.temperature !== undefined) {
      directBody.append("temperature", String(options.temperature));
    }
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
    text: data.text ?? "",
    seconds: data.usage?.seconds ?? 0,
    cost: data.usage?.cost ?? 0,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}
