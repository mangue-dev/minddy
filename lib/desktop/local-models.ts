import type { AgentProviderId } from "@/lib/agent-providers";

/** The two local protocols that the shell can discover. */
export type LocalModelProvider = Extract<AgentProviderId, "local_openai" | "ollama">;

export interface LocalModelDiscoveryInput {
  provider: LocalModelProvider;
  /** Base URL as configured in the settings (without secret). */
  baseUrl: string;
}

export type LocalModelDiscoveryResult =
  | { ok: true; models: string[] }
  | { ok: false; reason: "invalid_endpoint" | "unavailable" | "invalid_response" };

const DISCOVERY_TIMEOUT_MS = 3_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_MODELS = 500;
const MAX_MODEL_ID_LENGTH = 256;
const NON_CHAT_RE = /(embed(?:ding)?|whisper|tts|dall-e|moderation|audio|image|imagen|veo|realtime|transcribe|rerank)/i;

/**
 * Replays the minimum that the remote page can request from the main process.
 *
 * This is NOT a proxy: only a loopback endpoint, on the two documented discovery routes, can be reached. The page can neither read a private
 * network, nor request an arbitrary URL from Electron.
 */
export function parseLocalModelDiscoveryInput(value: unknown): LocalModelDiscoveryInput | null {
  if (!value || typeof value !== "object") return null;
  const { provider, baseUrl } = value as { provider?: unknown; baseUrl?: unknown };
  if ((provider !== "ollama" && provider !== "local_openai") || typeof baseUrl !== "string") {
    return null;
  }
  const trimmed = baseUrl.trim();
  return trimmed && trimmed.length <= 2048 ? { provider, baseUrl: trimmed } : null;
}

/** The bounded URL that the shell can attach to, or null if not local. */
export function localModelDiscoveryUrl(input: LocalModelDiscoveryInput): string | null {
  let url: URL;
  try {
    url = new URL(input.baseUrl);
  } catch {
    return null;
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !isLoopbackHost(url.hostname)
  ) {
    return null;
  }

  if (input.provider === "ollama") {
    // Ollama lists its models on its native API `/api/tags`, even when the
    // chat uses the OpenAI-compatible `/v1` layer.
    const rootPath = url.pathname.replace(/\/+$/, "").replace(/\/v1$/i, "");
    url.pathname = `${rootPath || ""}/api/tags`;
  } else {
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/models`;
  }
  return url.toString();
}

/**
 * Called exclusively by the Electron main process. `redirect: "error"`
 * is important: a loopback address must never be able to become a relay
 * to the outside thanks to a 30x.
 */
export async function discoverLocalModels(
  raw: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<LocalModelDiscoveryResult> {
  const input = parseLocalModelDiscoveryInput(raw);
  const url = input && localModelDiscoveryUrl(input);
  if (!input || !url) return { ok: false, reason: "invalid_endpoint" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, reason: "unavailable" };
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
      return { ok: false, reason: "invalid_response" };
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return { ok: false, reason: "invalid_response" };
    }
    return { ok: true, models: parseDiscoveredModels(input.provider, body) };
  } catch {
    return { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}

/** The two catalog formats, reduced to the picker's contract. */
export function parseDiscoveredModels(provider: LocalModelProvider, body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const rows = (body as { models?: unknown; data?: unknown }).models;
  const openAiRows = (body as { data?: unknown }).data;
  const source = provider === "ollama" ? rows : openAiRows;
  if (!Array.isArray(source)) return [];

  const ids = source.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as { id?: unknown; name?: unknown; model?: unknown };
    const raw = provider === "ollama" ? row.name ?? row.model : row.id;
    return typeof raw === "string" ? [raw.replace(/^models\//, "")] : [];
  });
  return [...new Set(ids.map((id) => id.trim()).filter(isChatModelId))]
    .sort((a, b) => a.localeCompare(b))
    .slice(0, MAX_MODELS);
}

function isChatModelId(id: string): boolean {
  return !!id && id.length <= MAX_MODEL_ID_LENGTH && !NON_CHAT_RE.test(id);
}

function isLoopbackHost(raw: string): boolean {
  const host = raw.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  if (host === "localhost" || host === "::1") return true;
  const octets = host.split(".");
  return (
    octets.length === 4 &&
    octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255) &&
    Number(octets[0]) === 127
  );
}
