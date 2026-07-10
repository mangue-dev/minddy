import "server-only";

import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";
import { sha256Hex } from "@/lib/server/oauth/crypto";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { sendOtpEmail } from "@/lib/server/feedback/otp-email";

/**
 * Vérification email par code OTP (MIN-37). Codes 6 chiffres, hashés sha256
 * salés par le row id (jamais stockés en clair), 10 minutes de vie, 5
 * tentatives max (incrémentées AVANT la comparaison), cooldown de renvoi 60 s
 * en base + rate limit IP en mémoire. La table est RLS deny-all.
 */

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

export type RequestOtpResult = { ok: true } | { ok: false; error: "rateLimited" | "sendFailed" };

export async function requestFeedbackOtp(params: {
  boardId: string;
  email: string;
  projectName: string;
  ip: string;
  locale: "fr" | "en";
}): Promise<RequestOtpResult> {
  const service = getServiceClient();
  const email = params.email.trim().toLowerCase();

  const rate = checkSessionRateLimit(params.ip || "unknown", `feedback-otp:${params.boardId}`, {
    limit: 5,
    windowMs: 10 * 60_000,
  });
  if (!rate.allowed) return { ok: false, error: "rateLimited" };

  // Cooldown de renvoi : réponse générique « envoyé » sans renvoyer (pas
  // d'oracle sur l'existence d'une demande précédente).
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

  const id = randomUUID();
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const { error } = await service.from("feedback_otp_codes").insert({
    id,
    board_id: params.boardId,
    email,
    code_hash: sha256Hex(`${id}:${code}`),
    expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
  });
  if (error) {
    console.error("[feedback-otp] insert failed:", error.message);
    return { ok: false, error: "sendFailed" };
  }

  const sent = await sendOtpEmail({
    to: email,
    code,
    projectName: params.projectName,
    locale: params.locale,
  });
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

  // Brûle une tentative AVANT de comparer : pas de brute force en parallèle.
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
