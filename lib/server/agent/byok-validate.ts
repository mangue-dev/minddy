import "server-only";

import {
  getAgentProvider,
  isLocalAgentProvider,
  type AgentProviderId,
} from "@/lib/agent-providers";
import { fetchAiProviderBytes } from "@/lib/server/ai-provider-request";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";

/**
 * PROBE A BYOK KEY (MIN-344) — does the provider recognize this key?
 *
 * Declaring a key was enough to switch to unlimited use. We therefore present the key
 * to the supplier BEFORE drawing any billing consequences: an authenticated call, read for its STATUS and nothing else (we keep neither the list
 * of models nor the body of the response — the catalog already has its own path,
 * with its cache).
 *
 * Three verdicts, and the nuance counts:
 * • `valid` — the key responded, we can raise the ceilings;
 * • `invalid` — the supplier REFUSES it (401/403): it's a fact, we say
 * to the user instead of registering a dead key;
 * • `unknown` — network failure, 5xx, endpoint missing: we don't know. The key
 * is registered, but without validation date — therefore without raising
 * the ceiling, and `getUserByok` will try again later.
 *
 * `unknown` is the SAFE fallback on both sides: you cannot refuse a good key on
 * a hiccup from OpenRouter, and we do not credit unlimited a key that we do not have
 * seen working.
 */

export type ByokProbeVerdict = "valid" | "invalid" | "unknown" | "rate_limited";

/** Beyond that, we don't know — and we don't make you wait for the settings screen. */
const PROBE_TIMEOUT_MS = 8000;

/**
 * Cheapest model listed on BOTH OpenCode gateways (Go and Zen publish it at
 * $0.15/$0.50 per 1M tokens): a one-token probe costs a fraction of a cent
 * of the subscription. If OpenCode retires the id, the probe degrades to an
 * `unknown` verdict and the key is revalidated on first use instead.
 */
const OPENCODE_PROBE_MODEL = "glm-5.3-flash";
const PROBE_RATE_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 } as const;
export const BYOK_PROBE_RETRY_AFTER_SECONDS = PROBE_RATE_LIMIT.windowMs / 1000;

interface ProbeRequest {
  url: string;
  headers: Record<string, string>;
  method?: "POST";
  /** POST body. The response is discarded (`maxBytes: 1`): only the status counts. */
  body?: string;
}

/**
 * The cheapest authenticated call from each provider.
 *
 * OpenRouter has better than a `/models` — which is PUBLIC at home, and would respond
 * 200 to a bogus key: `/key` describes the key presented, so only exists for
 * a key that exists. The others go through their listing, which requires the key.
 *
 * The OpenCode gateways (Go and Zen) are the opposite trap: their `/models`
 * is public too, so the probe must be an authenticated call. A one-token
 * completion on the cheapest model works because the gateway checks the key
 * BEFORE the body: an invalid key is refused 401 without spending anything,
 * a valid one answers 200 at the cost of a single output token.
 */
function probeRequestFor(
  provider: AgentProviderId,
  baseUrl: string,
  apiKey: string,
): ProbeRequest {
  switch (provider) {
    case "openrouter":
      return { url: `${baseUrl}/key`, headers: { Authorization: `Bearer ${apiKey}` } };
    case "anthropic":
      return {
        url: `${baseUrl}/models?limit=1`,
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      };
    case "opencode-go":
    case "opencode-zen":
      return {
        url: `${baseUrl}/chat/completions`,
        method: "POST",
        body: JSON.stringify({
          model: OPENCODE_PROBE_MODEL,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
        }),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
      };
    default:
      // OpenAI, Google and any OpenAI-compatible server: `/models` authenticated.
      return { url: `${baseUrl}/models`, headers: { Authorization: `Bearer ${apiKey}` } };
  }
}

/**
 * Presents the key to the provider. Never throws: a failure is a verdict, not
 * an exception — the caller decides what to do with it.
 *
 * The base URL is assumed ALREADY passed through the anti-SSRF guard (`assertPublicHttpUrl`,
 * MIN-341): it is the caller who holds it, here we just calls it.
 */
export async function probeByokKey(params: {
  provider: AgentProviderId;
  apiKey: string;
  baseUrl: string;
  /** Shares one outbound-probe budget across registration and runtime validation. */
  rateLimitKey?: string;
}): Promise<ByokProbeVerdict> {
  const { provider, apiKey, baseUrl, rateLimitKey } = params;
  if (!apiKey || !baseUrl) return "invalid";
  if (!getAgentProvider(provider)) return "invalid";
  // A probe from the cloud deployment would precisely cancel the promise of
  // local provider. Its state is established by the first call to the local proxy.
  if (isLocalAgentProvider(provider)) return "unknown";

  if (
    rateLimitKey &&
    !checkSessionRateLimit(rateLimitKey, "byok-provider-probe", PROBE_RATE_LIMIT).allowed
  ) {
    return "rate_limited";
  }

  const { url, headers, method, body } = probeRequestFor(
    provider,
    baseUrl.replace(/\/+$/, ""),
    apiKey,
  );
  try {
    const res = await fetchAiProviderBytes(provider, url, {
      headers,
      ...(method ? { method } : {}),
      ...(body !== undefined ? { body } : {}),
      maxBytes: 1,
      onOverflow: "truncate",
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    if (res.ok) return "valid";
    // 401/403 = the key is refused. 402 also: OpenRouter renders it for a key
    // TRUE but no credit — she won't run any runs, treat her like
    // valid would amount to raising a ceiling for the benefit of an endpoint which refuses
    // already serving. 429/5xx = we know nothing about the key, only the time.
    if (res.status === 401 || res.status === 403 || res.status === 402) return "invalid";
    return "unknown";
  } catch {
    // Network, DNS, timeout: no information on the key.
    return "unknown";
  }
}
