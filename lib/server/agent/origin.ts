import "server-only";

import { SITE_URL } from "@/lib/site";
import { currentDeploymentScope } from "./deployment";

/**
 * App origin (scheme+host) for self-invocation of agent drain
 * (MIN-46). minddy does not have a canonical origin helper; we favor the URL
 * of the current DEPLOYMENT (VERCEL_URL) so that the child runs on the same
 * deployment, otherwise the prod domain. Used as a fallback when the
 * cron route does not provide its own request origin.
 */
export function getAgentDrainOrigin(): string {
  const explicit = process.env.MINDDY_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`;
  return SITE_URL;
}

/**
 * Origin that the microVM calls to join the CONTROL PLAN (MIN-223) —
 * events, ledger, checkpoint, platform tools.
 *
 * It is not `getAgentDrainOrigin`: this one favors `MINDDY_PUBLIC_APP_URL`,
 * which is worth the PROD domain up to a preview. A microVM launched by a
 * preview must speak to ITS deployment, not to prod — same rule as
 * drain affinity (`deploymentScopeFromEnv`, MIN-165): a run continues with
 * the code that launched it, otherwise the control plane and the loop diverge in
 * full tour.
 *
 * It also serves as `forwardURL` and therefore as `aud` of the OIDC verified by
 * `defineSandboxProxy`: it is an EXACT address, not a display preference
 *. Excluding Vercel (dev position), we fall back on production — a microVM
 * does not know how to reach a localhost.
 */
export function agentControlOrigin(): string {
  const scope = currentDeploymentScope();
  if (scope) return `https://${scope}`;
  const explicit = process.env.MINDDY_PUBLIC_APP_URL?.trim();
  if (explicit) return new URL(explicit).origin;
  throw new Error(
    "Vercel Sandbox requires MINDDY_PUBLIC_APP_URL outside Vercel so the sandbox can reach this instance",
  );
}
