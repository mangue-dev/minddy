import "server-only";

import crypto from "node:crypto";
import { requireSecret } from "@/lib/server/env-secrets";

/**
 * `state` signed for git connection flows (MIN-47), ported from AutoKap
 * (github-link-state.ts).
 *
 * "Connecting a repository" is a 3-beat dance: (1) minddy mint a URL
 * of install/authorize carrying a signed `state`, (2) the user installs/
 * authorizes at the provider, (3) the provider redirects to our callback with
 * this same `state`. The callback has no trust context of its own: the
 * `state` is the proof “this installation targets project P, initiated by
 * user U”. HMAC-signed (unfalsifiable) and short (15 min → a leaked URL
 * is not replayed). Secret: GIT_STATE_SECRET.
 */

const DEFAULT_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
const CLOCK_SKEW_TOLERANCE_MS = 60 * 1000;

/**
 * `projectId` sentinel for a connection at ACCOUNT level (from the
 * account settings, without project). The state always carries the real `userId` ;
 * callbacks branch to `origin === "account"` to skip the project access check
 * and redirect to /settings.
 */
export const ACCOUNT_CONNECT_PROJECT = "__account__";

interface GitLinkStatePayload {
  projectId: string;
  userId: string;
  provider: string;
  /** issued-at, epoch ms */
  iat: number;
  /** Where the install was initiated from — controls callback redirection. */
  origin?: string;
}

function getStateSecret(): string {
  // Absent OR too short: the same refusal (MIN-347). A short secret HMAC is
  // a forgeable `state`, therefore an installation attributed to someone else's project.
  return requireSecret("GIT_STATE_SECRET");
}

function sign(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Mint a signed state: `base64url(json).hexHmac`. Raised if the secret is absent
 * (fail closed — never an unsigned token).
 */
export function signGitLinkState(params: {
  projectId: string;
  userId: string;
  provider: string;
  origin?: string;
}): string {
  const payload: GitLinkStatePayload = {
    projectId: params.projectId,
    userId: params.userId,
    provider: params.provider,
    iat: Date.now(),
  };
  if (params.origin) payload.origin = params.origin;
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, getStateSecret())}`;
}

/**
 * Checks a state and returns its payload, or null on any anomaly (malformed,
 * bad signature, expired, missing secret). Never raises — caller
 * redirects to an error state on null.
 */
export function verifyGitLinkState(
  token: string | null | undefined,
  opts: { maxAgeMs?: number } = {},
): { projectId: string; userId: string; provider: string; origin?: string } | null {
  if (!token) return null;
  const dotIndex = token.indexOf(".");
  if (dotIndex <= 0 || dotIndex === token.length - 1) return null;
  const body = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);

  let secret: string;
  try {
    secret = getStateSecret();
  } catch {
    return null; // poorly configured → fail closed
  }

  // Signature comparison in constant time (equal lengths required).
  const provided = Buffer.from(signature);
  const computed = Buffer.from(sign(body, secret));
  if (provided.length !== computed.length) return null;
  if (!crypto.timingSafeEqual(provided, computed)) return null;

  let payload: GitLinkStatePayload;
  try {
    payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as GitLinkStatePayload;
  } catch {
    return null;
  }
  if (
    !payload ||
    typeof payload.projectId !== "string" ||
    typeof payload.userId !== "string" ||
    typeof payload.provider !== "string" ||
    typeof payload.iat !== "number"
  ) {
    return null;
  }

  const maxAgeMs = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const now = Date.now();
  if (now - payload.iat > maxAgeMs) return null;
  if (payload.iat - now > CLOCK_SKEW_TOLERANCE_MS) return null;

  return {
    projectId: payload.projectId,
    userId: payload.userId,
    provider: payload.provider,
    origin: typeof payload.origin === "string" ? payload.origin : undefined,
  };
}
