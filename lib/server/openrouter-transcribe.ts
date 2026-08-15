import "server-only";

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
 * Le type MIME que le navigateur a réellement enregistré → le format attendu
 * par OpenRouter, ou `null` si ce n'est pas de l'audio qu'on sait lire.
 *
 * Ici et pas dans chaque route : les quatre appelants (dictée authentifiée,
 * démo de la landing, retour dicté) enregistrent avec le MÊME `MediaRecorder`,
 * donc la table est la même — et une copie qui dérive fait un 400 sur un
 * navigateur, jamais sur celui du développeur.
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
  providerId?: string;
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

  const res = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(direct
        ? {}
        : {
            "Content-Type": "application/json",
            "HTTP-Referer": "https://minddy.app",
            "X-Title": options?.title ?? "minddy",
          }),
    },
    body: directBody ?? JSON.stringify(body),
    // La dictée n'étant plus bornée en durée, une prise peut valoir plusieurs
    // dizaines de minutes d'audio : 120 s ne suffisaient plus à l'envoyer et à
    // la transcrire. On reste sous le maxDuration = 300 de /api/transcribe.
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
