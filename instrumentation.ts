import type { InstrumentationOnRequestError } from "next/dist/server/instrumentation/types";

/**
 * `register()` — called once per server instance, before the first
 * request (see node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md).
 *
 * This what we do there: control the environment secrets which serve as key
 * (MIN-347). To raise here is to refuse to start — and this is exactly what we want from an empty encryption key or a three-character HMAC:
 * the alternative is a deployment that runs, that encrypts, and from which no one learns anything before the incident.
 *
 * Node-only runtime: `instrumentation.ts` is also loaded on the edge side, where
 * `server-only` and `node:crypto` have nothing to do. The proxy does not touch
 * any of these secrets.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const [{ assertSecretsAreStrong }, { assertRuntimeConfig }, { getDeploymentEdition, legacyCloudProfileDiagnostic }] = await Promise.all([
    import("@/lib/server/env-secrets"),
    import("@/lib/runtime-config"),
    import("@/lib/env"),
  ]);
  const legacyProfileDiagnostic = legacyCloudProfileDiagnostic({
    MINDDY_EDITION: process.env.MINDDY_EDITION,
    MINDDY_PUBLIC_APP_URL: process.env.MINDDY_PUBLIC_APP_URL,
    VERCEL: process.env.VERCEL,
  });
  if (legacyProfileDiagnostic) console.warn(`[deployment] ${legacyProfileDiagnostic}`);
  getDeploymentEdition();
  assertRuntimeConfig();
  assertSecretsAreStrong();

  // Managed forge relay: register (or rotate) the webhook fan-out endpoint
  // once per server instance. No-op unless the relay is configured; failures
  // are logged, never fatal — the next startup retries.
  const { ensureRelayWebhookRegistration } = await import(
    "@/lib/server/forge-relay/webhook-registration"
  );
  await ensureRelayWebhookRegistration();
}

/**
 * Error reporting hook (MIN-542): every error Next.js handles in the Node
 * runtime — route handlers, server actions, RSC rendering — is reported to
 * PostHog error tracking. Opt-in only (`MINDDY_PUBLIC_ERROR_TRACKING=1`,
 * default OFF): everything else inside is a no-op, and a reporting failure
 * never compounds the error being reported. See `lib/server/error-tracking.ts`.
 */
export const onRequestError: InstrumentationOnRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { captureServerException } = await import("@/lib/server/error-tracking");
    await captureServerException(error, request.headers.cookie, {
      routePath: context.routePath,
      routeType: context.routeType,
      httpMethod: request.method,
      revalidateReason: context.revalidateReason,
    });
  } catch {
    // A tracking failure must never compound the error being reported.
  }
};
