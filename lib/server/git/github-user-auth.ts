import "server-only";

import { GITHUB_API_BASE, githubHeaders } from "./github-rest";
import { capability } from "@/lib/server/capabilities";
import { isForgeTokenCryptoConfigured } from "./token-crypto";

/**
 * Autorisation UTILISATEUR de la GitHub App (MIN-144) — les tokens
 * *user-to-server*, distincts du token d'installation.
 *
 * Un token d'installation parle au nom de l'App (`minddy-app[bot]`) ; un token
 * user-to-server parle au nom de la PERSONNE, avec l'intersection de ses droits
 * et de ceux de l'installation. C'est ce qu'il faut pour qu'approuver une PR
 * depuis minddy coche vraiment la case verte de GitHub.
 *
 * On réutilise l'App DÉJÀ INSTALLÉE — on lui ajoute seulement un client id /
 * secret et une *User authorization callback URL*. On n'active PAS « Request
 * user authorization (OAuth) during installation » : elle n'autoriserait que la
 * personne qui installe (or chaque membre doit autoriser SON compte, donc le
 * bouton explicite reste nécessaire de toute façon) et elle changerait la
 * redirection post-installation, donc `/api/git/github/setup` — le seul chemin
 * de liaison de dépôt qui marche.
 *
 * Piège : le refresh à 8 h n'existe QUE si l'App a « Expire user authorization
 * tokens » activé. Sinon l'échange ne renvoie ni `expires_in` ni
 * `refresh_token`, et le token est PERMANENT — `expiresAt` et `refreshToken`
 * valent alors null, ce qui n'est pas un état dégradé.
 */

const GITHUB_OAUTH_BASE = "https://github.com";

function getClientId(): string {
  const value = process.env.GITHUB_APP_CLIENT_ID;
  if (!value) throw new Error("Missing GITHUB_APP_CLIENT_ID");
  return value;
}

function getClientSecret(): string {
  const value = process.env.GITHUB_APP_CLIENT_SECRET;
  if (!value) throw new Error("Missing GITHUB_APP_CLIENT_SECRET");
  return value;
}

/**
 * L'autorisation utilisateur est-elle déployée ? Distinct de
 * `isGithubAppConfigured()` : une installation peut très bien marcher (liaison
 * de dépôt, agent) sans que l'App porte de client id — c'est même l'état d'avant
 * MIN-144. L'UI s'en sert pour ne pas offrir un bouton qui répondrait 400.
 */
export function isGithubUserAuthConfigured(): boolean {
  return !!(
    capability("github").configured &&
    process.env.GITHUB_APP_CLIENT_ID &&
    process.env.GITHUB_APP_CLIENT_SECRET &&
    isForgeTokenCryptoConfigured()
  );
}

/**
 * URL d'autorisation vers laquelle minddy envoie l'utilisateur. SANS `scope` :
 * les permissions d'une GitHub App viennent de l'App elle-même, pas de la
 * requête — en demander un déclencherait le flux OAuth classique.
 */
export function getGithubUserAuthorizeUrl(opts: {
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: opts.redirectUri,
    state: opts.state,
  });
  return `${GITHUB_OAUTH_BASE}/login/oauth/authorize?${params.toString()}`;
}

export interface GithubUserTokenSet {
  accessToken: string;
  /** Expiry absolu (ISO), ou null quand l'App n'expire pas ses tokens. */
  expiresAt: string | null;
  /** Absent (null) quand l'App n'expire pas ses tokens. */
  refreshToken: string | null;
  scope: string | null;
}

interface RawTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

/**
 * POST github.com/login/oauth/access_token (form-encoded). Partagé par l'échange
 * et le refresh. GitHub répond en `application/x-www-form-urlencoded` par
 * défaut, y compris pour les erreurs : d'où le `Accept: application/json`.
 */
async function requestUserToken(
  params: Record<string, string>,
  nowMs: number,
): Promise<GithubUserTokenSet> {
  const body = new URLSearchParams({
    client_id: getClientId(),
    client_secret: getClientSecret(),
    ...params,
  }).toString();
  const response = await fetch(`${GITHUB_OAUTH_BASE}/login/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const data = (await response.json().catch(() => ({}))) as RawTokenResponse;
  // GitHub répond 200 avec un corps `{ error }` sur un code périmé : le status
  // ne suffit pas à décider, la présence du token si.
  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error_description ||
        data.error ||
        `GitHub user token request failed (${response.status})`,
    );
  }
  return {
    accessToken: data.access_token,
    expiresAt:
      typeof data.expires_in === "number"
        ? new Date(nowMs + data.expires_in * 1000).toISOString()
        : null,
    refreshToken: data.refresh_token ?? null,
    scope: data.scope || null,
  };
}

/** Échange le `code` du callback contre un jeu de tokens utilisateur. */
export async function exchangeGithubUserCode(opts: {
  code: string;
  redirectUri: string;
}): Promise<GithubUserTokenSet> {
  return requestUserToken(
    { code: opts.code, redirect_uri: opts.redirectUri },
    Date.now(),
  );
}

/** Rafraîchit un token user-to-server (durée de vie 8 h chez GitHub). */
export async function refreshGithubUserToken(
  refreshToken: string,
): Promise<GithubUserTokenSet> {
  return requestUserToken(
    { refresh_token: refreshToken, grant_type: "refresh_token" },
    Date.now(),
  );
}

export interface GithubUserAccount {
  id: number;
  login: string;
  avatarUrl: string | null;
}

/** Identifie le compte autorisé (`GET /user` avec le token utilisateur). */
export async function getGithubUserAccount(
  token: string,
): Promise<GithubUserAccount> {
  const response = await fetch(`${GITHUB_API_BASE}/user`, {
    headers: githubHeaders(token),
  });
  const data = (await response.json().catch(() => ({}))) as {
    id?: number;
    login?: string;
    avatar_url?: string | null;
    message?: string;
  };
  if (!response.ok || typeof data.id !== "number") {
    throw new Error(data.message || `GitHub /user failed (${response.status})`);
  }
  return {
    id: data.id,
    login: data.login ?? "",
    avatarUrl: data.avatar_url ?? null,
  };
}
