import "server-only";

import crypto from "node:crypto";

/**
 * `state` signé pour les flux de connexion git (MIN-47), porté d'AutoKap
 * (github-link-state.ts).
 *
 * « Connecter un dépôt » est une danse à 3 temps : (1) minddy mint une URL
 * d'install/authorize portant un `state` signé, (2) l'utilisateur installe/
 * autorise chez le provider, (3) le provider redirige vers notre callback avec
 * ce même `state`. Le callback n'a aucun contexte de confiance propre : le
 * `state` est la preuve « cette installation vise le projet P, initiée par
 * l'utilisateur U ». HMAC-signé (infalsifiable) et court (15 min → une URL fuitée
 * ne se rejoue pas). Secret : GIT_STATE_SECRET.
 */

const DEFAULT_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
const CLOCK_SKEW_TOLERANCE_MS = 60 * 1000;

/**
 * `projectId` sentinelle pour une connexion au niveau COMPTE (depuis les
 * paramètres du compte, sans projet). Le state porte toujours le vrai `userId` ;
 * les callbacks branchent sur `origin === "account"` pour sauter la vérification
 * d'accès projet et rediriger vers /settings.
 */
export const ACCOUNT_CONNECT_PROJECT = "__account__";

interface GitLinkStatePayload {
  projectId: string;
  userId: string;
  provider: string;
  /** issued-at, epoch ms */
  iat: number;
  /** D'où l'install a été initiée — contrôle la redirection du callback. */
  origin?: string;
}

function getStateSecret(): string {
  const value = process.env.GIT_STATE_SECRET;
  if (!value) {
    throw new Error("Missing GIT_STATE_SECRET");
  }
  return value;
}

function sign(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Mint un state signé : `base64url(json).hexHmac`. Lève si le secret est absent
 * (fail closed — jamais de token non signé).
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
 * Vérifie un state et renvoie son payload, ou null sur toute anomalie (malformé,
 * mauvaise signature, expiré, secret manquant). Ne lève jamais — l'appelant
 * redirige vers un état d'erreur sur null.
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
    return null; // mal configuré → fail closed
  }

  // Comparaison de signature en temps constant (longueurs égales requises).
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
