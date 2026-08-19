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
}
