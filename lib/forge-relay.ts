/**
 * Pure description of the managed forge relay configuration (instance side).
 *
 * The relay lets a self-hosted instance obtain GitHub/GitLab credentials from
 * the minddy-operated control plane instead of an operator-owned forge app.
 * It is strictly opt-in: presence of the three variables below is required,
 * and presence alone activates nothing by itself — the connection rows created
 * through the relay carry the `source: "relay"` marker that selects the relay
 * provider per connection (see `lib/server/git/forge-provider.ts`).
 */
export interface ForgeRelayEnvironment {
  [key: string]: string | undefined;
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

/** Resolves the relay configuration, or null when it is absent or partial. */
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
