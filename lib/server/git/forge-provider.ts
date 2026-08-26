import "server-only";

import { isForgeRelayConfigured, type ForgeRelayEnvironment } from "@/lib/forge-relay";
import {
  getInstallationToken,
  type InstallationToken,
  type InstallationTokenScope,
} from "./github-app";
import { getGitlabAccessToken } from "./gitlab-app";
import {
  isForgeRelayClientConfigured,
  relayRequest,
} from "@/lib/server/forge-relay/client";
import type { MintProfile } from "@/lib/server/forge-relay/mint";

/**
 * Token-provider seam for the managed forge relay (docs/managed-forge-relay-plan.md,
 * Phase 1). The scoping, caching, and error-handling logic of the callers
 * (`lib/server/agent/repo-access.ts` and everything routed through it) stays
 * untouched — only the token source behind this interface is swapped.
 *
 * Two implementations:
 *
 * - `LocalForgeProvider` — the current behavior: the instance owns its GitHub
 *   App and GitLab OAuth app credentials and mints tokens itself. Default.
 * - `RelayForgeProvider` — active only when the relay is configured AND the
 *   connection was created through it (`source: "relay"`). GitHub tokens are
 *   minted by the Cloud control plane; GitLab tokens stay instance-side (the
 *   broker hands them over at connect time, and their REFRESH grant runs
 *   Cloud-side through `POST /relay/gitlab/refresh` — see gitlab-app.ts).
 *   Selection happens per connection, not per instance, so mixed setups
 *   (local GitHub app + relayed GitLab) work.
 *
 * Scope note: `resolveForgeActor` (forge-actor.ts) resolves *human* gestures
 * via user tokens, not installation tokens, and those tokens stay stored on
 * the instance even in relay mode — so it keeps its local behavior; only the
 * initial user-authorization dance is brokered by the relay.
 */

export interface InstallationTokenRequest {
  installationId: number | string;
  /** Same constraint as the local path: short repo names, fixed permission profiles. */
  scope?: InstallationTokenScope;
}

export interface ForgeProvider {
  /** Which token source sits behind the interface. */
  readonly kind: "local" | "relay";
  /** GitHub installation token, scoped per request (mirrors `getInstallationToken`). */
  getInstallationToken(input: InstallationTokenRequest): Promise<InstallationToken>;
  /** GitLab OAuth access token for a connection, refreshed lazily (mirrors `getGitlabAccessToken`). */
  getGitlabAccessToken(connectionId: string): Promise<string>;
}

/**
 * The current behavior, unchanged: delegation to the local GitHub App and
 * GitLab OAuth clients, which keep enforcing their own capability guards,
 * scoping, in-process caches, and error contracts.
 */
export const localForgeProvider: ForgeProvider = {
  kind: "local",
  getInstallationToken: ({ installationId, scope }) =>
    getInstallationToken(installationId, scope),
  getGitlabAccessToken: (connectionId) => getGitlabAccessToken(connectionId),
};

// In-process cache for RELAYED installation tokens, keyed like the local one
// (installation + scope) and with the same safety window: GitHub sets the
// lifespan at ~1h and the relay must not become a per-call round trip.
const RELAY_TOKEN_SAFETY_WINDOW_MS = 5 * 60_000;
// Hard bound: tokens expire within the hour, so the working set is small —
// the cap only exists so a pathological scope variety cannot grow the map
// forever (entries are evicted expired-first, then oldest-insertion).
const RELAY_TOKEN_CACHE_MAX_ENTRIES = 500;
const relayTokenCache = new Map<string, InstallationToken>();
const relayTokenMints = new Map<string, Promise<InstallationToken>>();

/** Clears relay token state between tests. */
export function __clearRelayTokenCacheForTests(): void {
  relayTokenCache.clear();
  relayTokenMints.clear();
}

/** Reports the bounded cache size for eviction tests. */
export function __relayTokenCacheSizeForTests(): number {
  return relayTokenCache.size;
}

function cacheRelayToken(key: string, token: InstallationToken): void {
  if (relayTokenCache.size >= RELAY_TOKEN_CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [existingKey, existing] of relayTokenCache) {
      if (Date.parse(existing.expiresAt) - now <= RELAY_TOKEN_SAFETY_WINDOW_MS) {
        relayTokenCache.delete(existingKey);
      }
    }
    while (relayTokenCache.size >= RELAY_TOKEN_CACHE_MAX_ENTRIES) {
      const oldest = relayTokenCache.keys().next();
      if (oldest.done) break;
      relayTokenCache.delete(oldest.value);
    }
  }
  relayTokenCache.set(key, token);
}

/**
 * Maps a local mint scope to its wire profile. The relay only accepts the
 * fixed profiles of MIN-327 — an empty/absent permission object would be
 * indistinguishable from "the app's full power set" and is exactly the
 * accidental over-mint the profile field exists to prevent.
 */
function mintProfileFromScope(
  scope?: InstallationTokenScope,
): MintProfile {
  if (!scope) return "repository-list";
  const permissions = scope.permissions;
  const entries = Object.entries(permissions ?? {});
  if (entries.length === 0) return "full";
  if (entries.length === 1 && entries[0][0] === "contents") {
    if (entries[0][1] === "write") return "repo-write";
    if (entries[0][1] === "read") return "repo-read";
  }
  throw new Error(
    `No relay mint profile for permissions: ${JSON.stringify(permissions)}`,
  );
}

function relayTokenCacheKey(
  installationId: number | string,
  scope?: InstallationTokenScope,
): string {
  const repos = [...(scope?.repositories ?? [])].sort().join(",");
  const repoIds = [...(scope?.repositoryIds ?? [])].sort((a, b) => a - b).join(",");
  const perms = Object.entries(scope?.permissions ?? {})
    .map(([name, level]) => `${name}:${level}`)
    .sort()
    .join(",");
  return `${installationId}|${repos}|${repoIds}|${perms}`;
}

/**
 * The managed relay: GitHub installation tokens are minted by the Cloud
 * control plane (`POST /relay/github/installation-token`) — the private key
 * never leaves Cloud. GitLab tokens stay INSTANCE-side even for relayed
 * connections (the OAuth broker hands the token pair to the instance, which
 * stores and refreshes them as today), so GitLab resolution is a plain local
 * delegation.
 */
export const relayForgeProvider: ForgeProvider = {
  kind: "relay",
  getInstallationToken: async ({ installationId, scope }) => {
    const key = relayTokenCacheKey(installationId, scope);
    const cached = relayTokenCache.get(key);
    if (cached && Date.parse(cached.expiresAt) - Date.now() > RELAY_TOKEN_SAFETY_WINDOW_MS) {
      return cached;
    }
    const existingMint = relayTokenMints.get(key);
    if (existingMint) return existingMint;

    const mint = (async () => {
      const response = await relayRequest<{
        token: string;
        expiresAt: string;
      }>("/api/relay/github/installation-token", {
        installationId:
          typeof installationId === "string" ? Number(installationId) : installationId,
        repositoryIds: scope?.repositoryIds ?? [],
        profile: mintProfileFromScope(scope),
      });
      if (!response.ok || !response.data?.token) {
        throw new Error(response.error || "Relayed installation token mint failed");
      }
      const minted: InstallationToken = {
        token: response.data.token,
        expiresAt: response.data.expiresAt ?? "",
      };
      if (minted.expiresAt && !Number.isNaN(Date.parse(minted.expiresAt))) {
        cacheRelayToken(key, minted);
      }
      return minted;
    })().finally(() => {
      if (relayTokenMints.get(key) === mint) relayTokenMints.delete(key);
    });
    relayTokenMints.set(key, mint);
    return mint;
  },
  getGitlabAccessToken: (connectionId) => getGitlabAccessToken(connectionId),
};

/**
 * Provider selection for ONE connection. `source` is the connection row's
 * origin marker (`source: "relay"` for connections claimed through the relay,
 * absent/local otherwise). Selection happens per connection, not per instance,
 * so mixed setups (local GitHub app + relayed GitLab) work.
 */
export function forgeProviderForConnection(
  source?: string | null,
  env: ForgeRelayEnvironment = process.env,
): ForgeProvider {
  if (source === "relay") {
    if (isForgeRelayConfigured(env) && isForgeRelayClientConfigured()) {
      return relayForgeProvider;
    }
    throw new Error(
      "Connection was created through the forge relay but MINDDY_FORGE_RELAY_* is not configured",
    );
  }
  return localForgeProvider;
}
