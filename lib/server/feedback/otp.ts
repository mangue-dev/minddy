import "server-only";

import type { Locale } from "@/i18n/config";

import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";
import { sha256Hex } from "@/lib/server/oauth/crypto";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { sendOtpEmail } from "@/lib/server/feedback/otp-email";
import { capability } from "@/lib/server/capabilities";

/**
 * Email verification by OTP code (MIN-37). 6-digit codes, sha256
 hashes * salted by the row id (never stored in plain text), 10 minutes of life, 5
 * max attempts (incremented BEFORE comparison), return cooldown 60 s
 * in base. The table is RLS deny-all.
 *
 * ── What ANONYMOUS achieves here (MIN-342) ────────────────────────────────
 *
 * The caller is an unauthenticated visitor who chooses the recipient:
 * this is, by construction, the only surface of minddy where an unknown person triggers
 * a send from the verified domain. We cannot require that the address be
 * already known to the board — it is the front door, no one is known there the
 * the first time. What holds the opening is therefore:
 *
 * 1. the body of the e-mail does not contain ANY text chosen by a third party
 * (see otp-email.ts: the name of the project is no longer there);
 * 2. PERSISTENT counters, per recipient and by origin. The counter
 * in memory was not enough: it starts from zero on each deployment and only sees one instance out of N. And the ceiling per recipient counts all
 * boards combined — spraying a victim via N boards was the lever.
 */

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

/** Window of persistent counters, and their ceilings. The legitimate worst case
 is someone who enters the wrong address twice and then receives their code. */
const OTP_COUNTER_WINDOW_MS = 60 * 60 * 1000;
/** By ADDRESS, all boards combined: what a victim can receive in 1 hour. */
const OTP_MAX_PER_EMAIL = 5;
/** By ORIGIN: what a requester can trigger in 1 hour, all addresses. */
const OTP_MAX_PER_IP = 15;

/** Original fingerprint, never the IP in plain text: the column is used to COUNT, not to
 identify. Salted by the service key — the only secret that this module
 already has, and without which it would have no basis anyway. */
function hashIp(ip: string): string {
  return sha256Hex(`feedback-otp-ip:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}:${ip}`);
}

export type RequestOtpResult =
  | { ok: true }
  | { ok: false; error: "rateLimited" | "sendFailed" | "notConfigured" };

export async function requestFeedbackOtp(params: {
  boardId: string;
  email: string;
  ip: string;
  locale: Locale;
}): Promise<RequestOtpResult> {
  const consoleEmail =
    process.env.EMAIL_PROVIDER?.trim() === "console" &&
    process.env.NODE_ENV !== "production";
  if (!capability("transactionalEmail").configured && !consoleEmail) {
    return { ok: false, error: "notConfigured" };
  }
  const service = getServiceClient();
  const email = params.email.trim().toLowerCase();
  const ip = params.ip || "unknown";

  // First line, free: it cuts the hammering before any request.
  const rate = checkSessionRateLimit(ip, `feedback-otp:${params.boardId}`, {
    limit: 5,
    windowMs: 10 * 60_000,
  });
  if (!rate.allowed) return { ok: false, error: "rateLimited" };

  const ipHash = hashIp(ip);
  const id = randomUUID();
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const now = new Date();
  const { data: issued, error } = await service.rpc("issue_feedback_otp_code", {
    p_id: id,
    p_board_id: params.boardId,
    p_email: email,
    p_ip_hash: ipHash,
    p_code_hash: sha256Hex(`${id}:${code}`),
    p_expires_at: new Date(now.getTime() + OTP_TTL_MS).toISOString(),
    p_now: now.toISOString(),
    p_window_seconds: Math.floor(OTP_COUNTER_WINDOW_MS / 1000),
    p_cooldown_seconds: Math.floor(OTP_RESEND_COOLDOWN_MS / 1000),
    p_email_limit: OTP_MAX_PER_EMAIL,
    p_ip_limit: OTP_MAX_PER_IP,
  });
  if (error) {
    console.error("[feedback-otp] atomic issuance failed:", error.message);
    return { ok: false, error: "sendFailed" };
  }
  if (issued === "rate_limited") return { ok: false, error: "rateLimited" };
  // A cooldown deliberately has the same response as a send so this endpoint
  // cannot reveal whether a recipient requested a code recently.
  if (issued === "cooldown") return { ok: true };
  if (issued !== "issued") return { ok: false, error: "sendFailed" };

  const sent = await sendOtpEmail({ to: email, code, locale: params.locale });
  return sent ? { ok: true } : { ok: false, error: "sendFailed" };
}

export type VerifyOtpResult =
  | { ok: true; email: string }
  | { ok: false; error: "invalidCode" | "expired" | "tooManyAttempts" };

export async function verifyFeedbackOtp(params: {
  boardId: string;
  email: string;
  code: string;
}): Promise<VerifyOtpResult> {
  const service = getServiceClient();
  const email = params.email.trim().toLowerCase();
  const code = params.code.trim();

  const { data, error } = await service.rpc("claim_feedback_otp_attempt", {
    p_board_id: params.boardId,
    p_email: email,
    p_now: new Date().toISOString(),
    p_max_attempts: OTP_MAX_ATTEMPTS,
  });
  if (error) {
    console.error("[feedback-otp] atomic attempt claim failed:", error.message);
    return { ok: false, error: "invalidCode" };
  }
  const row = (
    data as { status: string; id: string | null; code_hash: string | null }[] | null
  )?.[0];
  if (!row || row.status === "invalid") return { ok: false, error: "invalidCode" };
  if (row.status === "expired") return { ok: false, error: "expired" };
  if (row.status === "too_many_attempts") {
    return { ok: false, error: "tooManyAttempts" };
  }
  if (row.status !== "claimed" || !row.id || !row.code_hash) {
    return { ok: false, error: "invalidCode" };
  }

  const expected = Buffer.from(sha256Hex(`${row.id}:${code}`), "hex");
  const stored = Buffer.from(row.code_hash, "hex");
  const match = expected.length === stored.length && timingSafeEqual(expected, stored);
  if (!match) return { ok: false, error: "invalidCode" };

  const { data: consumed, error: consumeError } = await service.rpc(
    "consume_feedback_otp_code",
    { p_id: row.id, p_now: new Date().toISOString() }
  );
  if (consumeError) {
    console.error("[feedback-otp] atomic consumption failed:", consumeError.message);
  }
  // Competing correct submissions may both claim an attempt, but only one can
  // transition the code from unconsumed to consumed.
  if (consumeError || consumed !== true) return { ok: false, error: "invalidCode" };

  return { ok: true, email };
}
