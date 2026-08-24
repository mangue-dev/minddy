import "server-only";

import {
  getAgentProvider,
  isLocalAgentProvider,
  type AgentProviderId,
} from "@/lib/agent-providers";
import { safeFetch } from "@/lib/server/safe-fetch";

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

export type ByokProbeVerdict = "valid" | "invalid" | "unknown";

/** Beyond that, we don't know — and we don't make you wait for the settings screen. */
const PROBE_TIMEOUT_MS = 8000;

interface ProbeRequest {
  url: string;
  headers: Record<string, string>;
}

/**
 * The cheapest authenticated call from each provider.
 *
 * OpenRouter has better than a `/models` — which is PUBLIC at home, and would respond
 * 200 to a bogus key: `/key` describes the key presented, so only exists for
 * a key that exists. The others go through their listing, which requires the key.
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
}): Promise<ByokProbeVerdict> {
  const { provider, apiKey, baseUrl } = params;
  if (!apiKey || !baseUrl) return "invalid";
  if (!getAgentProvider(provider)) return "invalid";
  // A probe from the cloud deployment would precisely cancel the promise of
  // local provider. Its state is established by the first call to the local proxy.
  if (isLocalAgentProvider(provider)) return "unknown";

  const { url, headers } = probeRequestFor(provider, baseUrl.replace(/\/+$/, ""), apiKey);
  try {
    const res = await safeFetch(url, {
      headers,
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
