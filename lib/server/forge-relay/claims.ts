import "server-only";

import crypto from "node:crypto";

import { getServiceClient } from "@/lib/supabase-service";
import { requireSecret } from "@/lib/server/env-secrets";
import { getInstallationAccount } from "@/lib/server/git/github-app";

/**
 * GitHub installation claim flow, Cloud side
 * (docs/managed-forge-relay-plan.md, "Installation claim").
 *
 * The instance first registers a pending, single-use code over its signed
 * relay channel. Cloud carries that pending setup through the GitHub App
 * installation page, reserves the callback's installation id, and requires a
 * GitHub user authorization that proves a stable repository identity for that
 * installation. Only then is the installation bound to the instance. The
 * instance polls the signed relay channel for the result and stores its local
 * connection flagged `source: "relay"`.
 *
 * The code is stored only as a SHA-256 hash: a database leak must not expose
 * live claim codes. The binding proper lives in `forge_relay_installations`;
 * the claim row is the code→binding handoff the poll consumes.
 */

const CLAIM_STATE_MAX_AGE_MS = 10 * 60_000;
const CLOCK_SKEW_TOLERANCE_MS = 60_000;
/** How long a completed claim remains available for one successful poll. */
const CLAIM_RESULT_TTL_MS = 60 * 60_000;

const CLAIM_NONCE_PATTERN = /^[0-9a-f]{64}$/;
const CLAIM_CODE_PATTERN = /^[0-9a-f]{64}(?:\.[0-9a-f]{64})?$/;
const FULL_REPOSITORY_NAME_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

export function isValidClaimCode(code: string | null | undefined): code is string {
  return typeof code === "string" && CLAIM_CODE_PATTERN.test(code);
}

export function generateClaimCode(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Creates an opaque claim code that only the initiating local account can
 * present back to the instance. Cloud treats the value as an opaque nonce and
 * stores only its hash; the account id never leaves the instance.
 */
export function generateAccountBoundClaimCode(input: {
  userId: string;
  secret: string;
}): string {
  const nonce = generateClaimCode();
  const binding = crypto
    .createHmac("sha256", input.secret)
    .update(`${input.userId}\0${nonce}`, "utf8")
    .digest("hex");
  return `${nonce}.${binding}`;
}

/** Verifies the local account binding without disclosing which part differed. */
export function claimCodeBelongsToAccount(
  code: string | null | undefined,
  userId: string,
  secret: string,
): code is string {
  if (!code || !CLAIM_CODE_PATTERN.test(code)) return false;
  const [nonce, providedBinding] = code.split(".");
  if (!CLAIM_NONCE_PATTERN.test(nonce) || !providedBinding) return false;
  const expectedBinding = crypto
    .createHmac("sha256", secret)
    .update(`${userId}\0${nonce}`, "utf8")
    .digest("hex");
  const provided = Buffer.from(providedBinding);
  const expected = Buffer.from(expectedBinding);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
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

interface RelayClaimAuthorizationStatePayload {
  kind: "forge-relay-claim-authorize";
  instanceId: string;
  code: string;
  installationId: number;
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

/** OAuth state used to authenticate the GitHub user who completed setup. */
export function signRelayClaimAuthorizationState(input: {
  instanceId: string;
  code: string;
  installationId: number;
  now?: number;
}): string {
  const payload: RelayClaimAuthorizationStatePayload = {
    kind: "forge-relay-claim-authorize",
    instanceId: input.instanceId,
    code: input.code,
    installationId: input.installationId,
    iat: input.now ?? Date.now(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signState(body)}`;
}

/** Verifies the OAuth confirmation state, or null on any anomaly. */
export function verifyRelayClaimAuthorizationState(
  token: string | null | undefined,
): { instanceId: string; code: string; installationId: number } | null {
  if (!token) return null;
  const dotIndex = token.indexOf(".");
  if (dotIndex <= 0 || dotIndex === token.length - 1) return null;
  const body = token.slice(0, dotIndex);
  const provided = Buffer.from(token.slice(dotIndex + 1));
  let computed: Buffer;
  try {
    computed = Buffer.from(signState(body));
  } catch {
    return null;
  }
  if (provided.length !== computed.length) return null;
  if (!crypto.timingSafeEqual(provided, computed)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as RelayClaimAuthorizationStatePayload;
    const now = Date.now();
    if (
      payload.kind !== "forge-relay-claim-authorize" ||
      typeof payload.instanceId !== "string" ||
      !isValidClaimCode(payload.code) ||
      !Number.isSafeInteger(payload.installationId) ||
      payload.installationId <= 0 ||
      typeof payload.iat !== "number" ||
      now - payload.iat > CLAIM_STATE_MAX_AGE_MS ||
      payload.iat - now > CLOCK_SKEW_TOLERANCE_MS
    ) {
      return null;
    }
    return {
      instanceId: payload.instanceId,
      code: payload.code,
      installationId: payload.installationId,
    };
  } catch {
    return null;
  }
}

/** Creates the server-side, authenticated pending setup before browser use. */
export async function createPendingRelayClaim(input: {
  instanceId: string;
  code: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!isValidClaimCode(input.code)) {
    return { ok: false, status: 400, error: "Invalid claim code" };
  }
  const { error } = await getServiceClient().from("forge_relay_claims").insert({
    instance_id: input.instanceId,
    code_hash: hashClaimCode(input.code),
    status: "pending",
    installation_id: null,
    account_login: null,
    created_at: new Date().toISOString(),
    claimed_at: null,
    consumed_at: null,
  });
  if (error) {
    return {
      ok: false,
      status: (error as { code?: string }).code === "23505" ? 409 : 500,
      error: (error as { message?: string }).message ?? "Failed to create pending claim",
    };
  }
  return { ok: true };
}

/** A browser claim URL is useful only after its instance registered it. */
export async function hasPendingRelayClaim(input: {
  instanceId: string;
  code: string;
}): Promise<boolean> {
  const { data } = await getServiceClient()
    .from("forge_relay_claims")
    .select("id")
    .eq("instance_id", input.instanceId)
    .eq("code_hash", hashClaimCode(input.code))
    .eq("status", "pending")
    .gte("created_at", new Date(Date.now() - CLAIM_STATE_MAX_AGE_MS).toISOString())
    .maybeSingle();
  return Boolean(data);
}

/**
 * Reserves exactly one callback installation for a pending setup. The status
 * predicate makes two callbacks unable to select different installations.
 */
export async function reserveRelayClaimInstallation(input: {
  instanceId: string;
  code: string;
  installationId: number;
}): Promise<boolean> {
  if (!Number.isSafeInteger(input.installationId) || input.installationId <= 0) {
    return false;
  }
  const supabase = getServiceClient();
  const { data: instance } = await supabase
    .from("forge_relay_instances")
    .select("id")
    .eq("id", input.instanceId)
    .eq("status", "active")
    .maybeSingle();
  if (!instance) return false;
  const { data } = await supabase
    .from("forge_relay_claims")
    .update({ status: "verifying", installation_id: input.installationId })
    .eq("instance_id", input.instanceId)
    .eq("code_hash", hashClaimCode(input.code))
    .eq("status", "pending")
    .gte("created_at", new Date(Date.now() - CLAIM_STATE_MAX_AGE_MS).toISOString())
    .select("id")
    .maybeSingle();
  return Boolean(data);
}

export type ClaimBinding =
  | { ok: true; installationId: number; accountLogin: string | null }
  | { ok: false; error: string; status: number };

/**
 * Binds a user-verified installation and repository to the claiming instance.
 * Completion is single-use for the pending setup; an installation already
 * bound to ANOTHER instance is refused, so the blast radius of a claim never
 * crosses instances.
 */
export async function bindRelayClaim(input: {
  instanceId: string;
  code: string;
  installationId: number;
  repositoryId: number;
  repositoryFullName: string;
}): Promise<ClaimBinding> {
  if (!Number.isSafeInteger(input.installationId) || input.installationId <= 0) {
    return { ok: false, status: 400, error: "Invalid installation id" };
  }
  const supabase = getServiceClient();

  if (
    !Number.isSafeInteger(input.repositoryId) ||
    input.repositoryId <= 0 ||
    !FULL_REPOSITORY_NAME_PATTERN.test(input.repositoryFullName)
  ) {
    return { ok: false, status: 400, error: "Invalid repository identity" };
  }

  const { data: instance } = await supabase
    .from("forge_relay_instances")
    .select("id, status")
    .eq("id", input.instanceId)
    .maybeSingle();
  const instanceRow = instance as { id: string; status: string } | null;
  if (!instanceRow || instanceRow.status !== "active") {
    return { ok: false, status: 403, error: "Relay instance is unknown or revoked" };
  }

  // The browser callback may suggest an installation, but only the pending
  // setup reserved before OAuth may authorize the final binding.
  const { data: pending } = await supabase
    .from("forge_relay_claims")
    .select("id")
    .eq("instance_id", input.instanceId)
    .eq("code_hash", hashClaimCode(input.code))
    .eq("status", "verifying")
    .eq("installation_id", input.installationId)
    .gte("created_at", new Date(Date.now() - CLAIM_STATE_MAX_AGE_MS).toISOString())
    .maybeSingle();
  if (!pending) {
    return { ok: false, status: 409, error: "Pending installation setup does not match" };
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
  const repositoryOwner = input.repositoryFullName.slice(
    0,
    input.repositoryFullName.indexOf("/"),
  );
  if (repositoryOwner.toLowerCase() !== login.toLowerCase()) {
    return {
      ok: false,
      status: 409,
      error: "Verified repository does not belong to the installation account",
    };
  }

  // The final ownership checks, relay upsert, and claim completion share the
  // same installation advisory lock as Cloud connection provisioning.
  const { data: completed, error: claimError } = await supabase.rpc(
    "complete_forge_relay_claim",
    {
      p_instance_id: input.instanceId,
      p_claim_id: (pending as { id: string }).id,
      p_installation_id: input.installationId,
      p_account_login: login,
      p_repository_id: input.repositoryId,
      p_repository_full_name: input.repositoryFullName,
    },
  );
  if (claimError) return { ok: false, status: 500, error: claimError.message };
  const state = (completed as { state?: unknown } | null)?.state;
  if (state !== "claimed") {
    const error =
      state === "cloud_owned"
        ? "This installation is already connected to a minddy Cloud account; disconnect it there first"
        : state === "relay_owned"
          ? "Installation is already claimed by another instance"
          : "Pending installation setup was already used";
    return { ok: false, status: 409, error };
  }

  return { ok: true, installationId: input.installationId, accountLogin: login };
}

export type ClaimResult =
  | { status: "pending" }
  | { status: "claimed"; installationId: number; accountLogin: string | null };

/**
 * The instance's poll. The conditional update is the one-time consumption
 * boundary: concurrent polls and later replays see `pending` and receive no
 * installation identity.
 */
export async function consumeRelayClaim(input: {
  instanceId: string;
  code: string;
}): Promise<ClaimResult> {
  const supabase = getServiceClient();
  const codeHash = hashClaimCode(input.code);
  const { data } = await supabase
    .from("forge_relay_claims")
    .update({ status: "consumed", consumed_at: new Date().toISOString() })
    .eq("instance_id", input.instanceId)
    .eq("code_hash", codeHash)
    .eq("status", "claimed")
    .gte("claimed_at", new Date(Date.now() - CLAIM_RESULT_TTL_MS).toISOString())
    .select("id, installation_id, account_login")
    .maybeSingle();
  const claim = data as {
    id: string;
    installation_id: number | null;
    account_login: string | null;
  } | null;
  if (!claim || claim.installation_id == null) {
    return { status: "pending" };
  }

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
  const supabase = getServiceClient();
  await supabase
    .from("forge_relay_claims")
    .delete()
    .lt("claimed_at", new Date(Date.now() - CLAIM_RESULT_TTL_MS).toISOString());
  await supabase
    .from("forge_relay_claims")
    .delete()
    .in("status", ["pending", "verifying"])
    .lt("created_at", new Date(Date.now() - CLAIM_STATE_MAX_AGE_MS).toISOString());
}
