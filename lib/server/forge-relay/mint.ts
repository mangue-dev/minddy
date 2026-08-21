import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import {
  getInstallationAccount,
  getInstallationToken,
} from "@/lib/server/git/github-app";

/**
 * Control-plane side of `POST /relay/github/installation-token`
 * (docs/managed-forge-relay-plan.md, "Token minting").
 *
 * The wire schema mirrors GitHub's API and the local behavior: `repositories`
 * takes SHORT names only, and `profile` is one of the fixed permission
 * profiles of MIN-327 (`RepoTokenAccess`) — the relay enforces server-side the
 * same narrowing the instance already applies client-side. Two authorization
 * checks, both required, fail-closed:
 *
 * 1. the installation is CLAIMED by the authenticated instance;
 * 2. every requested repo is mirrored as linked to that instance
 *    (short names are resolved against the installation's account so the
 *    mirror always operates on full names).
 *
 * The profile is REQUIRED on the wire. A bare `{}` or an absent permissions
 * object would silently mint a token with ALL the app's declared permissions;
 * only the explicit `full` profile may do that — it is what the agent's
 * control-plane gestures legitimately need (approve/merge/comment), now
 * opt-in, named, and audited rather than an accidental default.
 */

export const FORGE_RELAY_MINT_QUOTA_PER_HOUR = 120;
const MAX_REPOSITORIES_PER_MINT = 10;
const SHORT_REPO_NAME = /^[A-Za-z0-9._-]+$/;

/** Same three profiles as `RepoTokenAccess` (lib/server/agent/repo-access.ts). */
export type MintProfile = "full" | "repo-write" | "repo-read";

function isMintProfile(value: unknown): value is MintProfile {
  return typeof value === "string" && value in MINT_PERMISSIONS_BY_PROFILE;
}

/** GitHub permissions requested from the mint, per profile. `full` narrows
 * nothing (the token keeps the installation's) — the restriction that matters
 * is the per-repository scope, enforced above. */
export const MINT_PERMISSIONS_BY_PROFILE: Record<
  MintProfile,
  Record<string, "read" | "write"> | undefined
> = {
  full: undefined,
  "repo-write": { contents: "write" },
  "repo-read": { contents: "read" },
};

export interface InstallationTokenMintPayload {
  installationId: number;
  repositories: string[];
  profile: MintProfile;
}

export type ParsedMintPayload =
  | { ok: true; payload: InstallationTokenMintPayload }
  | { ok: false; error: string };

export function parseInstallationTokenMintPayload(raw: unknown): ParsedMintPayload {
  const body = (raw ?? {}) as Record<string, unknown>;
  const installationId = body.installationId;
  if (
    typeof installationId !== "number" ||
    !Number.isSafeInteger(installationId) ||
    installationId <= 0
  ) {
    return { ok: false, error: "Invalid installationId" };
  }

  const repositories = body.repositories;
  if (
    !Array.isArray(repositories) ||
    repositories.length === 0 ||
    repositories.length > MAX_REPOSITORIES_PER_MINT ||
    !repositories.every(
      (repo) => typeof repo === "string" && repo.length > 0 && !repo.includes("/") && SHORT_REPO_NAME.test(repo),
    )
  ) {
    return {
      ok: false,
      error: "repositories must be 1-10 SHORT repository names (no owner/ prefix)",
    };
  }

  // Fixed permission profiles: the relay never forwards an arbitrary
  // permission object, and an empty one would mint the app's FULL power set —
  // so the profile is mandatory and must name a known profile.
  const profile = body.profile;
  if (!isMintProfile(profile)) {
    return {
      ok: false,
      error: "profile must be one of: full, repo-write, repo-read",
    };
  }
  return { ok: true, payload: { installationId, repositories, profile } };
}

export type MintResult =
  | { ok: true; token: string; expiresAt: string }
  | { ok: false; status: number; error: string };

/** Append-only trace of a relay action. Best-effort: the action already happened. */
async function recordRelayAudit(
  instanceId: string,
  action: string,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await getServiceClient()
      .from("forge_relay_audit")
      .insert({ instance_id: instanceId, action, detail });
    if (error) throw error;
  } catch (err) {
    console.error("[forge-relay] audit write failed:", (err as Error).message);
  }
}

export async function mintRelayedInstallationToken(input: {
  instanceId: string;
  payload: InstallationTokenMintPayload;
}): Promise<MintResult> {
  const supabase = getServiceClient();
  const { instanceId, payload } = input;

  // Check 1 — the installation belongs to THIS instance.
  const { data: claim } = await supabase
    .from("forge_relay_installations")
    .select("id, account_login")
    .eq("instance_id", instanceId)
    .eq("installation_id", payload.installationId)
    .maybeSingle();
  const claimRow = claim as { id: string; account_login: string } | null;
  if (!claimRow) {
    await recordRelayAudit(instanceId, "mint_refused", {
      reason: "installation_not_claimed",
      installationId: payload.installationId,
    });
    return { ok: false, status: 403, error: "Installation is not claimed by this instance" };
  }

  // Check 2 — every requested repo is mirrored as linked. The short names are
  // resolved against the installation's account so the mirror check always
  // operates on full names (the wire format does not carry the owner).
  const installationAccount = await getInstallationAccount(payload.installationId);
  const owner = installationAccount?.login;
  if (!owner) {
    // Fail-closed: without the account login we cannot resolve short names to
    // the full names the mirror stores, so no mint can be authorized.
    await recordRelayAudit(instanceId, "mint_refused", {
      reason: "installation_account_unresolved",
      installationId: payload.installationId,
    });
    return { ok: false, status: 403, error: "Installation account could not be resolved" };
  }
  const fullNames = payload.repositories.map((repo) => `${owner}/${repo}`);
  const { data: mirrored } = await supabase
    .from("forge_relay_link_mirror")
    .select("repo_full_name")
    .eq("instance_id", instanceId)
    .eq("provider", "github")
    .in("repo_full_name", fullNames);
  const mirroredNames = new Set(
    ((mirrored ?? []) as { repo_full_name: string }[]).map((row) => row.repo_full_name),
  );
  const unlinked = fullNames.filter((name) => !mirroredNames.has(name));
  if (unlinked.length > 0) {
    await recordRelayAudit(instanceId, "mint_refused", {
      reason: "repository_not_linked",
      repositories: unlinked,
    });
    return { ok: false, status: 403, error: `Repository not linked to this instance: ${unlinked.join(", ")}` };
  }

  // Abuse control — per-instance quota over the audit ledger.
  const windowStart = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count } = await supabase
    .from("forge_relay_audit")
    .select("id", { count: "exact", head: true })
    .eq("instance_id", instanceId)
    .eq("action", "mint_installation_token")
    .gte("created_at", windowStart);
  if ((count ?? 0) >= FORGE_RELAY_MINT_QUOTA_PER_HOUR) {
    await recordRelayAudit(instanceId, "mint_refused", { reason: "quota_exceeded" });
    return { ok: false, status: 429, error: "Relay mint quota exceeded for this instance" };
  }

  try {
    const { token, expiresAt } = await getInstallationToken(payload.installationId, {
      repositories: payload.repositories,
      permissions: MINT_PERMISSIONS_BY_PROFILE[payload.profile],
    });
    await recordRelayAudit(instanceId, "mint_installation_token", {
      installationId: payload.installationId,
      repositories: payload.repositories,
      profile: payload.profile,
    });
    return { ok: true, token, expiresAt };
  } catch (err) {
    return { ok: false, status: 502, error: (err as Error).message };
  }
}
