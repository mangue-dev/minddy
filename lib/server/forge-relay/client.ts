import "server-only";

import {
  resolveForgeRelayConfig,
  type ForgeRelayConfig,
} from "@/lib/forge-relay";
import {
  signRelayRequest,
  type RelayRequestSignature,
} from "./protocol";

/**
 * Instance-side client of the managed forge relay
 * (docs/managed-forge-relay-plan.md). Every request is signed with the
 * instance's Ed25519 private key (kept in `MINDDY_FORGE_RELAY_SECRET`-issued
 * key material) and carries the instance id; the transport origin is the
 * pinned `MINDDY_FORGE_RELAY_URL`.
 *
 * The relay is strictly optional: every helper here fails fast when the
 * instance has not opted in, and callers degrade to the local provider.
 */

export function forgeRelayConfig(): ForgeRelayConfig | null {
  return resolveForgeRelayConfig(process.env);
}

export function isForgeRelayClientConfigured(): boolean {
  return forgeRelayConfig() !== null;
}

function relayEnv(): ForgeRelayConfig {
  const config = forgeRelayConfig();
  if (!config) {
    throw new Error(
      "Managed forge relay is not configured (MINDDY_FORGE_RELAY_URL, MINDDY_FORGE_RELAY_INSTANCE_ID, MINDDY_FORGE_RELAY_SECRET)",
    );
  }
  return normalizeRelaySecret(config);
}

/** Single-line envs store the PEM with \n escapes; restore them (same
 * convention as GITHUB_APP_PRIVATE_KEY). */
function normalizeRelaySecret(config: ForgeRelayConfig): ForgeRelayConfig {
  return {
    ...config,
    secret: config.secret.includes("\\n") ? config.secret.replace(/\\n/g, "\n") : config.secret,
  };
}

/** The instance's Ed25519 signing key, normalized for crypto use. Also used by
 * the user-authorization broker to sign authorization states. */
export function forgeRelaySigningKey(): string {
  return normalizeRelaySecret(relayEnv()).secret;
}

export interface RelayResponse<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

/**
 * One signed relay request. `path` is the control-plane route; the signature
 * covers the exact path and raw body, so the caller must not re-serialize.
 */
export async function relayRequest<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<RelayResponse<T>> {
  const config = relayEnv();
  const rawBody = JSON.stringify(body);
  const signature: RelayRequestSignature = signRelayRequest({
    method: "POST",
    path,
    rawBody,
    instanceId: config.instanceId,
    privateKey: config.secret,
  });
  const response = await fetch(`${config.url.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...signature },
    body: rawBody,
  });
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  return {
    ok: response.ok,
    status: response.status,
    data: response.ok ? data : null,
    error: response.ok ? null : (data?.error ?? `Relay request failed (${response.status})`),
  };
}
