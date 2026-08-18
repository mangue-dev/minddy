import "server-only";

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
  locale: "fr" | "en";
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

  // Resend cooldown: generic “sent” response without resending (not
  // from oracle on the existence of a previous request).
  const { data: last } = await service
    .from("feedback_otp_codes")
    .select("created_at")
    .eq("board_id", params.boardId)
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last && Date.now() - new Date(last.created_at as string).getTime() < OTP_RESEND_COOLDOWN_MS) {
    return { ok: true };
  }

  const ipHash = hashIp(ip);
  const since = new Date(Date.now() - OTP_COUNTER_WINDOW_MS).toISOString();
  const [byEmail, byIp] = await Promise.all([
    service
      .from("feedback_otp_codes")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", since),
    service
      .from("feedback_otp_codes")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", since),
  ]);
  if ((byEmail.count ?? 0) >= OTP_MAX_PER_EMAIL || (byIp.count ?? 0) >= OTP_MAX_PER_IP) {
    return { ok: false, error: "rateLimited" };
  }

  const id = randomUUID();
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const { error } = await service.from("feedback_otp_codes").insert({
    id,
    board_id: params.boardId,
    email,
    ip_hash: ipHash,
    code_hash: sha256Hex(`${id}:${code}`),
    expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
  });
  if (error) {
    console.error("[feedback-otp] insert failed:", error.message);
    return { ok: false, error: "sendFailed" };
  }

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

  const { data: row } = await service
    .from("feedback_otp_codes")
    .select("id, code_hash, expires_at, attempts")
    .eq("board_id", params.boardId)
    .eq("email", email)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row) return { ok: false, error: "invalidCode" };
  if (new Date(row.expires_at as string) <= new Date()) return { ok: false, error: "expired" };
  if ((row.attempts as number) >= OTP_MAX_ATTEMPTS) {
    return { ok: false, error: "tooManyAttempts" };
  }

  // Burn an attempt BEFORE comparing: no brute force in parallel.
  await service
    .from("feedback_otp_codes")
    .update({ attempts: (row.attempts as number) + 1 })
    .eq("id", row.id as string);

  const expected = Buffer.from(sha256Hex(`${row.id}:${code}`), "hex");
  const stored = Buffer.from(row.code_hash as string, "hex");
  const match = expected.length === stored.length && timingSafeEqual(expected, stored);
  if (!match) return { ok: false, error: "invalidCode" };

  await service
    .from("feedback_otp_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id as string);

  return { ok: true, email };
}
