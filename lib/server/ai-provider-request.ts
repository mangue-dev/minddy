import "server-only";

import {
  getAgentProvider,
  isLocalAgentProvider,
  type AgentProviderId,
} from "@/lib/agent-providers";
import {
  safeFetch,
  safeFetchResponse,
  type SafeFetchOptions,
  type SafeFetchResponseOptions,
  type SafeResponse,
} from "@/lib/server/safe-fetch";

/** Raised when cloud code attempts to contact a desktop-only model server. */
export class LocalAiProviderRequestError extends Error {
  code = "localEndpointRequiresLocalRun" as const;

  constructor() {
    super("Local AI providers can only be contacted by a local agent run");
    this.name = "LocalAiProviderRequestError";
  }
}

function assertServerProvider(provider: AgentProviderId): void {
  if (!getAgentProvider(provider)) throw new Error(`Unknown AI provider: ${provider}`);
  if (isLocalAgentProvider(provider)) throw new LocalAiProviderRequestError();
}

/**
 * The single streaming/multipart transport for server-side AI provider calls.
 * It rejects desktop-only providers, validates every DNS answer and redirect,
 * and connects only to the address that passed validation.
 */
export function fetchAiProvider(
  provider: AgentProviderId,
  url: string | URL,
  options: SafeFetchResponseOptions = {},
): Promise<Response> {
  assertServerProvider(provider);
  return safeFetchResponse(url, options);
}

/** The same provider boundary with a response byte cap for catalogs and probes. */
export function fetchAiProviderBytes(
  provider: AgentProviderId,
  url: string | URL,
  options: SafeFetchOptions,
): Promise<SafeResponse> {
  assertServerProvider(provider);
  return safeFetch(url, options);
}
