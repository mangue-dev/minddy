import "server-only";
import { after } from "next/server";
import { PostHog } from "posthog-node";
import {
  ALLOWED_SERVER_ANALYTICS_EVENTS,
  type ServerAnalyticsEventName,
} from "@/lib/analytics-events";
import { getAppEnv } from "@/lib/env";
import {
  sanitizeAnalyticsEventName,
  sanitizeAnalyticsProps,
} from "@/lib/analytics-sanitize";
import { shouldSendServerAnalytics } from "@/lib/analytics-localhost";

/**
 * PostHog events emitted by the SERVER (MIN-78).
 *
 * Why double the client: these events are AUTHORITY. They leave
 * whatever the browser's cookie consent (legal basis = legitimate interest
 * on non-identifying data on the device side: no cookie is
 * placed, the `distinctId` is the account id), and above all they exist where there
 * is no browser at all — MCP, agent code, Stripe/GitHub webhooks,
 * crons. This is the only way to accurately count the tickets created when half of them are created by an agent.
 *
 * Never put PII or free text in `properties`: same rules as
 * the customer catalog (counters, booleans, enums, ids, slices).
 */

let client: PostHog | null = null;

/**
 * `$` properties are rejected by default. This single PostHog option is
 * however necessary for anonymous public uploads: it prevents the
 * SDK server from creating a person profile for a disposable UUID.
 */
function sanitizeServerProperties(
  properties: Record<string, unknown> | undefined,
): Record<string, string | number | boolean | null> {
  const sanitized = sanitizeAnalyticsProps(properties);
  if (properties?.$process_person_profile === false) {
    sanitized.$process_person_profile = false;
  }
  return sanitized;
}

/**
 * Shared client, or null if the server analytics must not emit:
 * no key (self-host, CI), or local execution without
 * `NEXT_PUBLIC_POSTHOG_ALLOW_LOCALHOST=1`.
 *
 * Local guarding is the exact counterpart of that of the browser
 * (`isLocalAnalyticsHostname`): without it, cutting the flag would only silence
 * half of the instrumentation and a `pnpm dev` would continue writing to
 * the production project.
 */
export function getServerPostHog(): PostHog | null {
  const serverKey = process.env.POSTHOG_API_KEY?.trim();
  const serverHost = process.env.POSTHOG_HOST?.trim();
  const publicKey = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  const publicHost = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim();
  // A pair remains atomic: mix a server key with the public host (or
  // the reverse) would enable a client that the diagnostic capabilities register
  // as incomplete. The explicit server pair keeps priority.
  const hasExplicitServerConfig = Boolean(
    process.env.POSTHOG_API_KEY?.trim() || process.env.POSTHOG_HOST?.trim(),
  );
  const config = hasExplicitServerConfig
    ? serverKey && serverHost
      ? { key: serverKey, host: serverHost }
      : null
    : publicKey && publicHost
      ? { key: publicKey, host: publicHost }
      : null;
  if (
    !config ||
    !shouldSendServerAnalytics({
      hasKey: true,
      appEnv: getAppEnv(),
      allowLocalhost: process.env.NEXT_PUBLIC_POSTHOG_ALLOW_LOCALHOST === "1",
    })
  ) {
    return null;
  }
  if (!client) {
    client = new PostHog(config.key, {
      host: config.host,
      flushAt: 5,
      flushInterval: 10_000,
    });
  }
  return client;
}

export interface ServerEvent {
  /** ID of the account concerned, or a stable anonymous ID for public feeds. */
  distinctId: string;
  event: ServerAnalyticsEventName;
  properties?: Record<string, unknown>;
  /** Attaches the event to a project (same type of group as on the client side). */
  groups?: Record<string, string>;
}

/**
 * Captures a server event AND guarantees its sending before freezing the lambda.
 *
 * The client `posthog-node` buffers (`flushAt: 5`, `flushInterval: 10s`). Un
 * isolated event — the MOST common case here, e.g. the first
 * `user_signed_up` of the day — would therefore remain in the queue: the route returns
 * its response, the function freezes, the 10s interval is never triggered and
 * the event is lost. `after()` keeps the invocation alive just for the flush period, without delaying the response.
 *
 * Errors are swallowed: a PostHog failure should never cause a
 * user request to fail. To be called from a request context (route handler /
 * server action) — this is always the case here.
 */
export function captureServerEvent({
  distinctId,
  event,
  properties,
  groups,
}: ServerEvent): void {
  const safeEvent = sanitizeAnalyticsEventName(event);
  if (!ALLOWED_SERVER_ANALYTICS_EVENTS.has(safeEvent as ServerAnalyticsEventName)) return;
  const safeProperties = sanitizeServerProperties(properties);
  const safeGroups = sanitizeAnalyticsProps(groups);
  const posthog = getServerPostHog();
  if (!posthog) return;
  try {
    posthog.capture({
      distinctId,
      event: safeEvent,
      properties: safeProperties,
      groups: Object.fromEntries(
        Object.entries(safeGroups).filter((entry): entry is [string, string] =>
          typeof entry[1] === "string"
        ),
      ),
    });
    after(async () => {
      try {
        await posthog.flush();
      } catch {
        // A delivery failure should not affect the request.
      }
    });
  } catch {
    // `after()` out of request context, or client in error: we ignore.
  }
}

/**
 * Set person properties from the server (Stripe plan, activation milestones
 *). Same flush guarantee as `captureServerEvent`.
 */
export function identifyServerUser(
  distinctId: string,
  properties: Record<string, unknown>
): void {
  const posthog = getServerPostHog();
  if (!posthog) return;
  try {
    posthog.identify({ distinctId, properties: sanitizeAnalyticsProps(properties) });
    after(async () => {
      try {
        await posthog.flush();
      } catch {
        // idem
      }
    });
  } catch {
    // idem
  }
}
