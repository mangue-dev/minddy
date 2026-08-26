import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getInstallationToken } from "@/lib/server/git/github-app";

/**
 * Control-plane side of `POST /relay/github/installation-token`
 * (docs/managed-forge-relay-plan.md, "Token minting").
 *
 * The wire schema carries stable numeric GitHub repository ids, and `profile`
 * is one of the fixed permission
 * profiles of MIN-327 (`RepoTokenAccess`) — the relay enforces server-side the
 * same narrowing the instance already applies client-side. Two authorization
 * checks, both required, fail-closed:
 *
 * 1. the installation is CLAIMED by the authenticated instance;
 * 2. every requested stable repository id is mirrored as linked to that
 *    instance. The narrow `repository-list` profile is the sole pre-link
 *    exception: a claimed installation may enumerate the repositories that
 *    GitHub already exposes to that installation.
 *
 * The profile is REQUIRED on the wire. A bare `{}` or an absent permissions
 * object would silently mint a token with ALL the app's declared permissions;
 * only the explicit `full` profile may do that — it is what the agent's
 * control-plane gestures legitimately need (approve/merge/comment), now
 * opt-in, named, and audited rather than an accidental default.
 */

export const FORGE_RELAY_MINT_QUOTA_PER_HOUR = 120;
const MAX_REPOSITORIES_PER_MINT = 10;

/** Linked-repository profiles plus the pre-link repository selector. */
export type MintProfile = "full" | "repo-write" | "repo-read" | "repository-list";

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
  "repository-list": { metadata: "read" },
};

export interface InstallationTokenMintPayload {
  installationId: number;
  repositoryIds: number[];
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

  const profile = body.profile;
  if (!isMintProfile(profile)) {
    return {
      ok: false,
      error: "profile must be one of: full, repo-write, repo-read, repository-list",
    };
  }

  const repositoryIds = body.repositoryIds;
  if (
    !Array.isArray(repositoryIds) ||
    (profile === "repository-list"
      ? repositoryIds.length !== 0
      : repositoryIds.length === 0) ||
    repositoryIds.length > MAX_REPOSITORIES_PER_MINT ||
    !repositoryIds.every(
      (repoId) => typeof repoId === "number" && Number.isSafeInteger(repoId) && repoId > 0,
    ) ||
    new Set(repositoryIds).size !== repositoryIds.length
  ) {
    return {
      ok: false,
      error:
        profile === "repository-list"
          ? "repository-list requires an empty repositoryIds array"
          : "repositoryIds must contain 1-10 unique positive repository ids",
    };
  }

  // Fixed permission profiles: the relay never forwards an arbitrary
  // permission object, and an empty one would mint the app's FULL power set —
  // so the profile is mandatory and must name a known profile.
  return { ok: true, payload: { installationId, repositoryIds, profile } };
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

  const { data: activeInstance } = await supabase
    .from("forge_relay_instances")
    .select("id")
    .eq("id", instanceId)
    .eq("status", "active")
    .maybeSingle();
  if (!activeInstance) {
    return { ok: false, status: 403, error: "Relay mint is not authorized" };
  }

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
    return { ok: false, status: 403, error: "Relay mint is not authorized" };
  }

  // Check 2 — every post-link repository id is mirrored as linked. The
  // repository-list profile deliberately has no ids yet; installation
  // ownership and GitHub's own installation selection are its boundary.
  const requestedIds = payload.repositoryIds.map(String);
  const { data: mirrored } = await supabase
    .from("forge_relay_link_mirror")
    .select("external_repo_id")
    .eq("instance_id", instanceId)
    .eq("provider", "github")
    .in("external_repo_id", requestedIds);
  const mirroredIds = new Set(
    ((mirrored ?? []) as { external_repo_id: string }[]).map((row) => row.external_repo_id),
  );
  if (requestedIds.some((repoId) => !mirroredIds.has(repoId))) {
    await recordRelayAudit(instanceId, "mint_refused", {
      reason: "repository_not_linked",
    });
    return { ok: false, status: 403, error: "Relay mint is not authorized" };
  }

  // Abuse control — one database function serializes count + reservation for
  // this instance, so concurrent requests cannot all pass the same count.
  const { data: reservation, error: reservationError } = await supabase.rpc(
    "reserve_forge_relay_mint",
    {
      p_instance_id: instanceId,
      p_limit: FORGE_RELAY_MINT_QUOTA_PER_HOUR,
    },
  );
  if (reservationError) {
    return { ok: false, status: 503, error: "Relay mint authorization unavailable" };
  }
  if (reservation === "instance_inactive") {
    return { ok: false, status: 403, error: "Relay mint is not authorized" };
  }
  if (reservation !== "reserved") {
    await recordRelayAudit(instanceId, "mint_refused", { reason: "quota_exceeded" });
    return { ok: false, status: 429, error: "Relay mint quota exceeded for this instance" };
  }

  // Revocation may race with the earlier authorization reads. Recheck at the
  // external side-effect boundary, after the serialized quota reservation and
  // immediately before asking GitHub to mint or return a cached token.
  const { data: stillActive } = await supabase
    .from("forge_relay_instances")
    .select("id")
    .eq("id", instanceId)
    .eq("status", "active")
    .maybeSingle();
  if (!stillActive) {
    return { ok: false, status: 403, error: "Relay mint is not authorized" };
  }

  try {
    const { token, expiresAt } = await getInstallationToken(
      payload.installationId,
      payload.profile === "repository-list"
        ? { permissions: MINT_PERMISSIONS_BY_PROFILE[payload.profile] }
        : {
            repositoryIds: payload.repositoryIds,
            permissions: MINT_PERMISSIONS_BY_PROFILE[payload.profile],
          },
    );
    await recordRelayAudit(instanceId, "mint_installation_token_completed", {
      installationId: payload.installationId,
      repositoryIds: payload.repositoryIds,
      profile: payload.profile,
    });
    return { ok: true, token, expiresAt };
  } catch (err) {
    return { ok: false, status: 502, error: (err as Error).message };
  }
}
