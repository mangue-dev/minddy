import "server-only";

import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";
import { sha256Hex } from "@/lib/server/oauth/crypto";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { sendOtpEmail } from "@/lib/server/feedback/otp-email";
import { capability } from "@/lib/server/capabilities";

/**
 * Vérification email par code OTP (MIN-37). Codes 6 chiffres, hashés sha256
 * salés par le row id (jamais stockés en clair), 10 minutes de vie, 5
 * tentatives max (incrémentées AVANT la comparaison), cooldown de renvoi 60 s
 * en base. La table est RLS deny-all.
 *
 * ── Ce qu'un ANONYME atteint ici (MIN-342) ────────────────────────────────
 *
 * L'appelant est un visiteur non authentifié qui choisit le destinataire :
 * c'est, par construction, la seule surface de minddy où un inconnu déclenche
 * un envoi depuis le domaine vérifié. On ne peut pas exiger que l'adresse soit
 * déjà connue du board — c'est la porte d'entrée, personne n'y est connu la
 * première fois. Ce qui tient l'ouverture, c'est donc :
 *
 * 1. le corps de l'e-mail ne contient AUCUN texte choisi par un tiers
 *    (cf. otp-email.ts : le nom du projet n'y est plus) ;
 * 2. des compteurs PERSISTANTS, par destinataire et par origine. Le compteur
 *    en mémoire ne suffisait pas : il repart à zéro à chaque déploiement et ne
 *    voit qu'une instance sur N. Et le plafond par destinataire compte toutes
 *    boards confondues — arroser une victime via N boards était le levier.
 */

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

/** Fenêtre des compteurs persistants, et leurs plafonds. Le pire cas légitime
    est quelqu'un qui se trompe d'adresse deux fois puis reçoit son code. */
const OTP_COUNTER_WINDOW_MS = 60 * 60 * 1000;
/** Par ADRESSE, tous boards confondus : ce qu'une victime peut recevoir en 1 h. */
const OTP_MAX_PER_EMAIL = 5;
/** Par ORIGINE : ce qu'un demandeur peut déclencher en 1 h, toutes adresses. */
const OTP_MAX_PER_IP = 15;

/** Empreinte d'origine, jamais l'IP en clair : la colonne sert à COMPTER, pas à
    identifier. Salée par la clé de service — le seul secret dont ce module
    dispose déjà, et sans lequel il n'aurait de toute façon pas de base. */
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

  // Première ligne, gratuite : elle coupe le martèlement avant toute requête.
  const rate = checkSessionRateLimit(ip, `feedback-otp:${params.boardId}`, {
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
