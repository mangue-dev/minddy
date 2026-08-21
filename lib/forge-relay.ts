/**
 * Pure description of the managed forge relay configuration (instance side).
 *
 * The relay lets a self-hosted instance obtain GitHub/GitLab credentials from
 * the minddy-operated control plane instead of an operator-owned forge app.
 * It is a DEFAULT capability of the self-hosted edition: an instance that has
 * no operator-owned app provisions its relay credentials automatically, on
 * first connect, and stores them in its own database
 * (`lib/server/forge-relay/provisioning.ts`) — no environment setup. The
 * connection rows created through the relay carry the `source: "relay"`
 * marker that selects the relay provider per connection (see
 * `lib/server/git/forge-provider.ts`).
 *
 * Three ways to configure, in order of precedence:
 * 1. explicit environment variables (below) — Cloud itself and operators who
 *    pin a specific control plane;
 * 2. automatic provisioning against `DEFAULT_FORGE_RELAY_URL`, stored in the
 *    instance database;
 * 3. `MINDDY_FORGE_RELAY=0` — explicit opt-out for instances that must never
 *    contact minddy infrastructure.
 */
export interface ForgeRelayEnvironment {
  [key: string]: string | undefined;
  MINDDY_FORGE_RELAY?: string;
  MINDDY_FORGE_RELAY_URL?: string;
  MINDDY_FORGE_RELAY_INSTANCE_ID?: string;
  MINDDY_FORGE_RELAY_SECRET?: string;
}

export interface ForgeRelayConfig {
  /** Control-plane base URL (pinned origin, HTTPS in production). */
  url: string;
  /** Instance identifier issued at registration. */
  instanceId: string;
  /** Instance secret used to sign every relay request. */
  secret: string;
}

/**
 * The minddy-operated control plane used by automatic provisioning. Pinned
 * here so a self-hosted instance needs NO relay variable; the environment
 * variables above override it (self-hosted relay, staging, air-gapped ops).
 */
export const DEFAULT_FORGE_RELAY_URL = "https://minddy.app";

/** Explicit opt-out (`MINDDY_FORGE_RELAY=0`, written by `--no-forge-relay`). */
export function isForgeRelayOptedOut(env: ForgeRelayEnvironment): boolean {
  return env.MINDDY_FORGE_RELAY?.trim() === "0";
}

/** Resolves the relay configuration from the environment, or null when it is absent or partial. */
export function resolveForgeRelayConfig(
  env: ForgeRelayEnvironment,
): ForgeRelayConfig | null {
  const url = env.MINDDY_FORGE_RELAY_URL?.trim();
  const instanceId = env.MINDDY_FORGE_RELAY_INSTANCE_ID?.trim();
  const secret = env.MINDDY_FORGE_RELAY_SECRET?.trim();
  if (!url || !instanceId || !secret) return null;
  return { url, instanceId, secret };
}

export function isForgeRelayConfigured(env: ForgeRelayEnvironment): boolean {
  return resolveForgeRelayConfig(env) !== null;
}
