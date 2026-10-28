import "server-only";

import type { AgentProviderId } from "@/lib/agent-providers";
import { afterOrNow } from "@/lib/server/after-safe";
import { isErrorTrackingEnabled } from "@/lib/server/error-tracking";
import { getServerPostHog, sanitizeServerProperties } from "@/lib/server/posthog";

/**
 * Provider failures, made visible (MIN-826). A rejected request used to leave
 * nothing behind: no log line, a generic "Numo turn failed" stored encrypted,
 * and a `retryable` turn the UI kept polling. A 400 from Anthropic's
 * compatibility endpoint went unnoticed this way for every Claude 4.7+ turn.
 *
 * Every final non-OK provider response now becomes a `ProviderRequestError`,
 * logged on the server and reported to PostHog error tracking with structural
 * properties only: provider, model, HTTP status, and the provider's error
 * type. The provider's message stays in the server log and on the turn (the
 * user's own view, encrypted at rest); it never leaves for PostHog, since a
 * provider may echo request content in it.
 */

const MAX_MESSAGE_LENGTH = 300;

/** The provider chosen for a conversation no longer has a usable credential. */
export class ChosenProviderUnavailableError extends Error {
  constructor(readonly provider: AgentProviderId) {
    super(`The ${provider} key is no longer available. Choose another provider.`);
    this.name = "ChosenProviderUnavailableError";
  }
}

export class ProviderRequestError extends Error {
  readonly provider: AgentProviderId;
  readonly model: string;
  /** HTTP status, or `null` for an error reported inside a 200 stream. */
  readonly status: number | null;
  /** The provider's error type or code (`invalid_request_error`…), when given. */
  readonly providerErrorType: string | null;
  readonly providerMessage: string;

  constructor(input: {
    provider: AgentProviderId;
    model: string;
    status: number | null;
    providerErrorType?: string | null;
    providerMessage: string;
  }) {
    const providerMessage = input.providerMessage.trim().slice(0, MAX_MESSAGE_LENGTH);
    // Structural only: PostHog records `message`, and the provider's own
    // words may quote request content.
    super(`${input.provider} ${input.status ?? "stream"} ${input.providerErrorType ?? "error"} for ${input.model}`);
    this.name = "ProviderRequestError";
    this.provider = input.provider;
    this.model = input.model;
    this.status = input.status;
    this.providerErrorType = input.providerErrorType ?? null;
    this.providerMessage = providerMessage;
  }

  /**
   * A request the provider rejected as such (bad request, unknown model,
   * invalid key, forbidden) fails the same way on every retry; rate limits,
   * timeouts, overload and server errors may pass later.
   */
  get retryable(): boolean {
    if (this.status === null) return true;
    return this.status === 408 || this.status === 409 || this.status === 429 || this.status >= 500;
  }

  /** What the conversation shows: the provider, the status, and its own words. */
  get userMessage(): string {
    const where = this.status === null ? "" : ` (${this.status})`;
    return `The ${this.provider} provider rejected the request for ${this.model}${where}: ${this.providerMessage || "no details"}`;
  }
}

/**
 * The provider's message and type from an error body: the OpenAI shape
 * (`{ error: { message, type, code } }`, also produced by the Anthropic
 * transport), OpenRouter's (`{ error: { message, code } }`), or plain text.
 */
export function parseProviderErrorBody(text: string): { message: string; type: string | null } {
  try {
    const parsed = JSON.parse(text) as unknown;
    const raw = Array.isArray(parsed) ? parsed[0] : parsed;
    const error = (raw as { error?: unknown } | null)?.error;
    if (error && typeof error === "object") {
      const value = error as { message?: unknown; type?: unknown; code?: unknown; status?: unknown };
      const type = [value.type, value.code, value.status]
        .find((candidate) => typeof candidate === "string" && candidate) as string | undefined;
      return { message: typeof value.message === "string" ? value.message : text, type: type ?? null };
    }
    if (typeof error === "string") return { message: error, type: null };
  } catch {
    // Not JSON: the text itself is the message.
  }
  return { message: text, type: null };
}

/** Builds the error from a non-OK provider response, without consuming it. */
export async function providerErrorFromResponse(
  provider: AgentProviderId,
  model: string,
  response: Response,
): Promise<ProviderRequestError> {
  const text = await response.clone().text().catch(() => "");
  const parsed = parseProviderErrorBody(text);
  return new ProviderRequestError({
    provider,
    model,
    status: response.status,
    providerErrorType: parsed.type,
    providerMessage: parsed.message || response.statusText,
  });
}

/**
 * Logs a provider failure and reports it to PostHog error tracking, after the
 * response when inside a request. Never throws, never blocks the caller.
 */
export function reportProviderError(error: ProviderRequestError, surface: string): void {
  console.error("[ai-provider] request_failed", {
    surface,
    provider: error.provider,
    model: error.model,
    status: error.status,
    type: error.providerErrorType,
    message: error.providerMessage,
  });
  captureBackgroundException(error, {
    surface,
    provider: error.provider,
    model: error.model,
    provider_status: error.status,
    provider_error_type: error.providerErrorType,
  });
}

/**
 * Reports an exception raised outside the request hook (`onRequestError`
 * never sees work running after the response, such as a Numo turn). Same
 * gating and minimization as `captureServerException`; no person profile.
 */
export function captureBackgroundException(
  error: unknown,
  properties: Record<string, string | number | boolean | null | undefined>,
): void {
  if (!isErrorTrackingEnabled()) return;
  const posthog = getServerPostHog();
  if (!posthog) return;
  afterOrNow(async () => {
    try {
      await posthog.captureExceptionImmediate(error, undefined, sanitizeServerProperties({
        ...properties,
        $process_person_profile: false,
      }));
    } catch {
      // A tracking failure must never compound the error being reported.
    }
  });
}
