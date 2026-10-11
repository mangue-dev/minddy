import "server-only";

import { SITE_URL } from "@/lib/site";
import { resolveAgentExecutionBackend } from "@/lib/capabilities";
import { parseAgentControlOrigin } from "./control-origin";
import { deploymentScopeFromEnv } from "./deployment";

/** Application origin used to invoke the agent drain when its caller supplies
 * no request origin. An explicit app URL takes precedence over the current
 * Vercel deployment URL, with the public site as the final fallback. */
export function getAgentDrainOrigin(): string {
  const explicit = process.env.MINDDY_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`;
  return SITE_URL;
}

/** Control-plane origin for sandbox events, usage, checkpoints and Minddy tools.
 * A preview worker stays on its exact deployment so its controller and runtime
 * use the same code. Production uses the configured app origin; an explicit
 * control origin supports a dedicated HTTPS proxy or an internal server runner.
 * This origin also sets the firewall forwarding URL and the expected OIDC
 * audience, so malformed configuration fails rather than selecting a fallback. */
export function agentControlOrigin(env: Record<string, string | undefined> = process.env): string {
  const options = { hosted: resolveAgentExecutionBackend(env) === "vercel" };
  const internal = env.AGENT_CONTROL_ORIGIN?.trim();
  if (internal) return parseAgentControlOrigin(internal, options);
  const scope = deploymentScopeFromEnv(env);
  if (scope) return parseAgentControlOrigin(`https://${scope}`, options);
  const explicit = env.MINDDY_PUBLIC_APP_URL?.trim();
  if (explicit) return parseAgentControlOrigin(explicit, options);
  throw new Error(
    "Vercel Sandbox requires MINDDY_PUBLIC_APP_URL outside Vercel so the sandbox can reach this instance",
  );
}
