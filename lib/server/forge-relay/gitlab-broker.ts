import "server-only";

import crypto from "node:crypto";

import { getServiceClient } from "@/lib/supabase-service";
import { requireSecret } from "@/lib/server/env-secrets";
import { encryptForgeToken } from "@/lib/server/git/token-crypto";
import {
  createUserDelivery,
  consumeUserDelivery,
  safeRelayReturnPath,
  type RelayUserDelivery,
} from "./user-broker";

/**
 * GitLab OAuth broker + hook-secret handoff, Cloud side
 * (docs/managed-forge-relay-plan.md, "GitLab flows").
 *
 * GitLab is standard OAuth (no app-store model): the redirect URI is
 * registered on Cloud's GitLab app, so a relayed instance cannot run the
 * connect dance itself. Same three beats as the GitHub user broker:
 *
 * 1. INSTANCE — signs an authorization state with its Ed25519 key and sends
 *    the user to `/api/relay/gitlab/authorize`.
 * 2. CLOUD — completes the exchange with its registered callback URI, parks
 *    the token pair as a single-consumption delivery (provider `gitlab`), and
 *    bounces the browser to the instance.
 * 3. INSTANCE — fetches the delivery over the authenticated channel and
 *    stores it via `upsertGitlabConnection`; the lazy refresh of a relayed
 *    connection runs through `POST /relay/gitlab/refresh` (the grant belongs
 *    to the managed app's client, lineage-checked Cloud-side).
 *
 * Hook relay: GitLab hooks live ON THE REPOSITORY. In relay mode the hook URL
 * points at Cloud's `/api/relay/gitlab/webhook`, which verifies the per-repo
 * `X-Gitlab-Token` against the secret the instance pushed at hook-registration
 * time (`registerGitlabHookSecret`) and enqueues a fan-out delivery that the
 * worker re-signs with the SAME secret — the instance verification path is
 * unchanged.
 */

export const RELAY_GITLAB_STATE_KIND = "forge-relay-gitlab-authorize";

const USER_STATE_MAX_AGE_MS = 10 * 60_000;

// ── Instance side ───────────────────────────────────────────────────────────

interface RelayGitlabStatePayload {
  kind: typeof RELAY_GITLAB_STATE_KIND;
  userId: string;
  callbackOrigin: string;
  /**
   * Instance-relative page the callback leads back to (project settings,
   * wizard, …). Signed by the instance and re-validated at every hop —
   * without it the browser would always land on the account git settings,
   * losing a project-level connect's context.
   */
  returnPath?: string;
  iat: number;
}

/**
 * Signs the authorization request the instance redirects the user to. The
 * private key is the instance's relay signing key; Cloud verifies it against
 * the registered public key.
 */
export function signRelayGitlabState(input: {
  userId: string;
  callbackOrigin: string;
  returnPath?: string;
  privateKey: string;
  now?: number;
}): string {
  // Only a well-shaped relative path is carried; anything else falls back to
  // the callback's default at redirect time.
  const returnPath =
    input.returnPath &&
    safeRelayReturnPath(input.returnPath) === input.returnPath
      ? input.returnPath
      : undefined;
  const payload: RelayGitlabStatePayload = {
    kind: RELAY_GITLAB_STATE_KIND,
    userId: input.userId,
    callbackOrigin: input.callbackOrigin,
    ...(returnPath ? { returnPath } : {}),
    iat: input.now ?? Date.now(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.sign(null, Buffer.from(body), crypto.createPrivateKey(input.privateKey));
  return `${body}.${signature.toString("base64")}`;
}

// ── Cloud side ──────────────────────────────────────────────────────────────

function cloudSign(body: string): string {
  return crypto
    .createHmac("sha256", requireSecret("GIT_STATE_SECRET"))
    .update(body)
    .digest("hex");
}

/** Signed state carried through GitLab's authorize redirect (Cloud → GitLab → Cloud). */
export function signCloudGitlabState(payload: {
  instanceId: string;
  userId: string;
  callbackOrigin: string;
  returnPath?: string;
}): string {
  const body = Buffer.from(
    JSON.stringify({ kind: "forge-relay-gitlab-cloud", ...payload, iat: Date.now() }),
  ).toString("base64url");
  return `${body}.${cloudSign(body)}`;
}

export function verifyCloudGitlabState(
  token: string | null | undefined,
): {
  instanceId: string;
  userId: string;
  callbackOrigin: string;
  returnPath?: string;
} | null {
  if (!token) return null;
  const dotIndex = token.indexOf(".");
  if (dotIndex <= 0 || dotIndex === token.length - 1) return null;
  const body = token.slice(0, dotIndex);
  const provided = Buffer.from(token.slice(dotIndex + 1));
  let computed: Buffer;
  try {
    computed = Buffer.from(cloudSign(body));
  } catch {
    return null;
  }
  if (provided.length !== computed.length) return null;
  if (!crypto.timingSafeEqual(provided, computed)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      kind?: string;
      instanceId?: string;
      userId?: string;
      callbackOrigin?: string;
      returnPath?: string;
      iat?: number;
    };
    if (
      payload.kind !== "forge-relay-gitlab-cloud" ||
      typeof payload.instanceId !== "string" ||
      typeof payload.userId !== "string" ||
      typeof payload.callbackOrigin !== "string" ||
      typeof payload.iat !== "number" ||
      Date.now() - payload.iat > USER_STATE_MAX_AGE_MS
    ) {
      return null;
    }
    return {
      instanceId: payload.instanceId,
      userId: payload.userId,
      callbackOrigin: payload.callbackOrigin,
      ...(typeof payload.returnPath === "string" &&
      safeRelayReturnPath(payload.returnPath) === payload.returnPath
        ? { returnPath: payload.returnPath }
        : {}),
    };
  } catch {
    return null;
  }
}

// ── Deliveries ──────────────────────────────────────────────────────────────

export async function createGitlabTokenDelivery(input: {
  instanceId: string;
  delivery: RelayUserDelivery;
}): Promise<string> {
  return createUserDelivery({
    instanceId: input.instanceId,
    provider: "gitlab",
    delivery: input.delivery,
  });
}

export async function consumeGitlabTokenDelivery(input: {
  instanceId: string;
  deliveryId: string;
}): Promise<{ status: "pending" } | { status: "delivered"; delivery: RelayUserDelivery }> {
  return consumeUserDelivery({
    instanceId: input.instanceId,
    deliveryId: input.deliveryId,
    provider: "gitlab",
  });
}

// ── Hook secrets ────────────────────────────────────────────────────────────

/**
 * Records the per-repo hook secret an instance shares at hook-registration
 * time and on every rotation. Upserts a minimal mirror row when the link
 * event was lost: verification must not depend on event ordering.
 */
export async function registerGitlabHookSecret(input: {
  instanceId: string;
  repoId: string;
  repo: string;
  secret: string;
}): Promise<boolean> {
  if (!/^[1-9][0-9]*$/.test(input.repoId)) return false;
  if (!/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+$/.test(input.repo)) return false;
  if (input.secret.length < 32) return false;
  const supabase = getServiceClient();
  const { error } = await supabase.from("forge_relay_link_mirror").upsert(
    {
      instance_id: input.instanceId,
      provider: "gitlab",
      external_repo_id: input.repoId,
      repo_full_name: input.repo,
      webhook_secret_encrypted: encryptForgeToken(input.secret),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "instance_id,provider,external_repo_id" },
  );
  return !error;
}
