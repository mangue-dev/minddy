import "server-only";

import crypto from "node:crypto";

import { getServiceClient } from "@/lib/supabase-service";
import { requireSecret } from "@/lib/server/env-secrets";
import { getInstallationAccount } from "@/lib/server/git/github-app";

/**
 * GitHub installation claim flow, Cloud side
 * (docs/managed-forge-relay-plan.md, "Installation claim").
 *
 * Three beats: (1) the instance hands the operator's browser a claim URL on
 * Cloud carrying a random single-use code; (2) Cloud redirects to the standard
 * GitHub App installation page with a signed `state` (10 min TTL) that carries
 * the instance + code; (3) the GitHub setup URL lands back on Cloud, which
 * binds `(installation_id, account)` to the claiming instance. The instance
 * then polls the signed relay channel to learn the result and store its local
 * connection flagged `source: "relay"`.
 *
 * The code is stored only as a SHA-256 hash: a database leak must not expose
 * live claim codes. The binding proper lives in `forge_relay_installations`;
 * the claim row is the code→binding handoff the poll consumes.
 */

const CLAIM_STATE_MAX_AGE_MS = 10 * 60_000;
const CLOCK_SKEW_TOLERANCE_MS = 60_000;
/** How long a consumed claim stays readable by the polling instance. */
const CLAIM_RESULT_TTL_MS = 60 * 60_000;

const CLAIM_CODE_PATTERN = /^[0-9a-f]{64}$/;

export function isValidClaimCode(code: string | null | undefined): code is string {
  return typeof code === "string" && CLAIM_CODE_PATTERN.test(code);
}

export function generateClaimCode(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashClaimCode(code: string): string {
  return crypto.createHash("sha256").update(code, "utf8").digest("hex");
}

interface RelayClaimStatePayload {
  kind: "forge-relay-claim";
  instanceId: string;
  code: string;
  iat: number;
}

function signState(body: string): string {
  return crypto
    .createHmac("sha256", requireSecret("GIT_STATE_SECRET"))
    .update(body)
    .digest("hex");
}

/** Signed state carried through GitHub's installation redirect. */
export function signRelayClaimState(input: {
  instanceId: string;
  code: string;
  now?: number;
}): string {
  const payload: RelayClaimStatePayload = {
    kind: "forge-relay-claim",
    instanceId: input.instanceId,
    code: input.code,
    iat: input.now ?? Date.now(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signState(body)}`;
}

/** Verifies a claim state, or null on any anomaly. Never raises. */
export function verifyRelayClaimState(
  token: string | null | undefined,
): { instanceId: string; code: string } | null {
  if (!token) return null;
  const dotIndex = token.indexOf(".");
  if (dotIndex <= 0 || dotIndex === token.length - 1) return null;
  const body = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);

  let computed: Buffer;
  try {
    // Poorly configured secret → fail closed, never raise.
    computed = Buffer.from(signState(body));
  } catch {
    return null;
  }
  const provided = Buffer.from(signature);
  if (provided.length !== computed.length) return null;
  if (!crypto.timingSafeEqual(provided, computed)) return null;

  let payload: RelayClaimStatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as RelayClaimStatePayload;
  } catch {
    return null;
  }
  if (
    !payload ||
    payload.kind !== "forge-relay-claim" ||
    typeof payload.instanceId !== "string" ||
    !isValidClaimCode(payload.code) ||
    typeof payload.iat !== "number"
  ) {
    return null;
  }
  const now = Date.now();
  if (now - payload.iat > CLAIM_STATE_MAX_AGE_MS) return null;
  if (payload.iat - now > CLOCK_SKEW_TOLERANCE_MS) return null;
  return { instanceId: payload.instanceId, code: payload.code };
}

export type ClaimBinding =
  | { ok: true; installationId: number; accountLogin: string | null }
  | { ok: false; error: string; status: number };

/**
 * Binds an installation to the claiming instance: the setup-URL landing.
 * Idempotent on the (installation, instance) pair; an installation already
 * bound to ANOTHER instance is refused — the blast radius of a claim never
 * crosses instances.
 */
export async function bindRelayClaim(input: {
  instanceId: string;
  code: string;
  installationId: number;
}): Promise<ClaimBinding> {
  if (!Number.isSafeInteger(input.installationId) || input.installationId <= 0) {
    return { ok: false, status: 400, error: "Invalid installation id" };
  }
  const supabase = getServiceClient();

  const { data: instance } = await supabase
    .from("forge_relay_instances")
    .select("id, status")
    .eq("id", input.instanceId)
    .maybeSingle();
  const instanceRow = instance as { id: string; status: string } | null;
  if (!instanceRow || instanceRow.status !== "active") {
    return { ok: false, status: 403, error: "Relay instance is unknown or revoked" };
  }

  const { data: existing } = await supabase
    .from("forge_relay_installations")
    .select("id, instance_id")
    .eq("installation_id", input.installationId)
    .maybeSingle();
  const existingRow = existing as { id: string; instance_id: string } | null;
  if (existingRow && existingRow.instance_id !== input.instanceId) {
    return { ok: false, status: 409, error: "Installation is already claimed by another instance" };
  }

  // An installation CONNECTED to a Cloud account must not be claimable: the
  // webhook receiver routes claimed installations to their instance and skips
  // local handlers, so binding one would silently cut every Cloud project
  // linked to it off its PR and issue events.
  const { data: cloudConnection } = await supabase
    .from("git_connections")
    .select("id")
    .eq("installation_id", input.installationId)
    .limit(1)
    .maybeSingle();
  if (cloudConnection) {
    return {
      ok: false,
      status: 409,
      error:
        "This installation is already connected to a minddy Cloud account; disconnect it there first",
    };
  }

  let account: { login: string | null } | null = null;
  try {
    account = await getInstallationAccount(input.installationId);
  } catch (err) {
    // Transient GitHub failure: refuse cleanly so the operator can retry.
    console.error("[forge-relay] installation account lookup failed:", (err as Error).message);
  }
  const login = account?.login ?? null;
  if (!login) {
    // The column is NOT NULL (the mint's short-name resolution needs the
    // account anyway): a missing login must surface as a retryable claim
    // failure, not as a 23502 → 500 at insert time.
    return {
      ok: false,
      status: 502,
      error: "GitHub did not confirm the installation account — restart the connection",
    };
  }

  if (existingRow) {
    await supabase
      .from("forge_relay_installations")
      .update({ account_login: login })
      .eq("id", existingRow.id);
  } else {
    const { error } = await supabase.from("forge_relay_installations").insert({
      instance_id: input.instanceId,
      installation_id: input.installationId,
      account_login: login,
    });
    if (error) return { ok: false, status: 500, error: error.message };
  }

  // The claim row is the handoff the instance polls. Upsert: re-completing the
  // same claim (operator retried) refreshes it instead of duplicating.
  const { error: claimError } = await supabase.from("forge_relay_claims").upsert(
    {
      instance_id: input.instanceId,
      code_hash: hashClaimCode(input.code),
      status: "claimed",
      installation_id: input.installationId,
      account_login: login,
      claimed_at: new Date().toISOString(),
      consumed_at: null,
    },
    { onConflict: "code_hash" },
  );
  if (claimError) return { ok: false, status: 500, error: claimError.message };

  return { ok: true, installationId: input.installationId, accountLogin: login };
}

export type ClaimResult =
  | { status: "pending" }
  | { status: "claimed"; installationId: number; accountLogin: string | null };

/**
 * The instance's poll. Reads are idempotent for the SAME instance (a network
 * retry after a successful consume must not lose the binding); the first
 * successful read marks the claim consumed.
 */
export async function consumeRelayClaim(input: {
  instanceId: string;
  code: string;
}): Promise<ClaimResult> {
  const supabase = getServiceClient();
  const codeHash = hashClaimCode(input.code);
  const { data } = await supabase
    .from("forge_relay_claims")
    .select("id, status, installation_id, account_login, claimed_at")
    .eq("instance_id", input.instanceId)
    .eq("code_hash", codeHash)
    .maybeSingle();
  const claim = data as {
    id: string;
    status: string;
    installation_id: number;
    account_login: string | null;
    claimed_at: string;
  } | null;
  if (!claim) return { status: "pending" };

  if (
    Date.now() - Date.parse(claim.claimed_at) > CLAIM_RESULT_TTL_MS ||
    claim.status === "consumed"
  ) {
    // Still returned: only the claiming instance can ask (signed channel), so
    // replaying the answer to its author is safe and retry-friendly.
    return {
      status: "claimed",
      installationId: claim.installation_id,
      accountLogin: claim.account_login,
    };
  }

  await supabase
    .from("forge_relay_claims")
    .update({ status: "consumed", consumed_at: new Date().toISOString() })
    .eq("id", claim.id);

  void pruneStaleRelayClaims();

  return {
    status: "claimed",
    installationId: claim.installation_id,
    accountLogin: claim.account_login,
  };
}

/**
 * Housekeeping: claim rows older than the result TTL are unreadable by the
 * poll (consumed or expired) and leave. Same opportunistic pattern as the
 * nonce ledger and the user deliveries; the cron route calls it too.
 */
export async function pruneStaleRelayClaims(): Promise<void> {
  if (Math.random() >= 0.01) return;
  await getServiceClient()
    .from("forge_relay_claims")
    .delete()
    .lt("claimed_at", new Date(Date.now() - CLAIM_RESULT_TTL_MS).toISOString());
}
