import "server-only";

import crypto from "node:crypto";

import {
  GITHUB_API_BASE,
  githubHeaders,
  parseNextLink,
} from "./github-rest";

/**
 * Client GitHub App (MIN-47), porté d'AutoKap (github-app.ts) et réduit au flux
 * de liaison inerte : mint du JWT d'app, échange en token d'installation,
 * énumération des dépôts, métadonnées du compte installé. PAS de client
 * repo-scoped ni de webhooks (ceux-ci viendront avec l'agent de code, MIN-46).
 *
 * Modèle d'auth : l'app s'authentifie comme elle-même via un JWT RS256 court
 * (`mintAppJwt`), l'échange contre un token d'installation (`getInstallationToken`),
 * puis appelle l'API REST scopée aux dépôts de l'installation.
 */

// --- Environment -----------------------------------------------------------

function getGithubAppId(): string {
  const value = process.env.GITHUB_APP_ID;
  if (!value) throw new Error("Missing GITHUB_APP_ID");
  return value;
}

function getGithubAppPrivateKey(): string {
  const value = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!value) throw new Error("Missing GITHUB_APP_PRIVATE_KEY");
  // Les env mono-ligne stockent le PEM avec des \n échappés ; on les restaure.
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

export function getGithubAppSlug(): string {
  const value = process.env.GITHUB_APP_SLUG;
  if (!value) throw new Error("Missing GITHUB_APP_SLUG");
  return value;
}

export function isGithubAppConfigured(): boolean {
  return !!(
    process.env.GITHUB_APP_ID &&
    process.env.GITHUB_APP_PRIVATE_KEY &&
    process.env.GITHUB_APP_SLUG
  );
}

// --- Authentification de l'app ---------------------------------------------

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * Mint un JWT RS256 court qui authentifie l'app GitHub elle-même. `iat` reculé de
 * 60s pour tolérer la dérive d'horloge ; `exp` à 8 min (sous le plafond GitHub de
 * 10 min). node:crypto accepte les clés PKCS#1 (`BEGIN RSA PRIVATE KEY`, défaut de
 * GitHub) et PKCS#8 (`BEGIN PRIVATE KEY`).
 */
export function mintAppJwt(): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: nowSeconds - 60,
    exp: nowSeconds + 8 * 60,
    iss: getGithubAppId(),
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(payload),
  )}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(
    crypto.createPrivateKey(getGithubAppPrivateKey()),
  );

  return `${signingInput}.${base64url(signature)}`;
}

export interface InstallationToken {
  token: string;
  expiresAt: string;
}

// Cache in-process des tokens d'installation, par installationId. Les tokens
// GitHub valent ~1h ; réutilisés jusqu'à SAFETY_WINDOW_MS avant expiry. Best-effort.
const SAFETY_WINDOW_MS = 5 * 60_000;
const installationTokenCache = new Map<string, InstallationToken>();

/**
 * Échange le JWT d'app contre un token d'installation scopé aux dépôts de
 * l'installation. Réutilise un token encore valide depuis le cache in-process.
 */
export async function getInstallationToken(
  installationId: number | string,
): Promise<InstallationToken> {
  const key = String(installationId);
  const cached = installationTokenCache.get(key);
  if (cached && Date.parse(cached.expiresAt) - Date.now() > SAFETY_WINDOW_MS) {
    return cached;
  }

  const response = await fetch(
    `${GITHUB_API_BASE}/app/installations/${installationId}/access_tokens`,
    { method: "POST", headers: githubHeaders(mintAppJwt()) },
  );

  const data = (await response.json()) as {
    token?: string;
    expires_at?: string;
    message?: string;
  };

  if (!response.ok || !data.token) {
    throw new Error(
      data.message || `Failed to mint installation token (${response.status})`,
    );
  }

  const minted = { token: data.token, expiresAt: data.expires_at ?? "" };
  if (minted.expiresAt && !Number.isNaN(Date.parse(minted.expiresAt))) {
    installationTokenCache.set(key, minted);
  }
  return minted;
}

export interface InstallationRepo {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string | null;
}

const INSTALLATION_REPOS_PER_PAGE = 100;

/**
 * Liste tous les dépôts qu'une installation peut atteindre (paginé via l'en-tête
 * Link). Alimente le sélecteur de dépôt du flux de liaison. Lève sur une réponse
 * non-OK pour que l'appelant surface l'échec.
 */
export async function listInstallationRepositories(
  installationId: number | string,
): Promise<InstallationRepo[]> {
  const { token } = await getInstallationToken(installationId);
  const repos: InstallationRepo[] = [];
  let url: string | null = `${GITHUB_API_BASE}/installation/repositories?per_page=${INSTALLATION_REPOS_PER_PAGE}`;
  while (url) {
    const response = await fetch(url, { headers: githubHeaders(token) });
    const data = (await response.json()) as {
      repositories?: Array<{
        id: number;
        name: string;
        full_name?: string;
        owner?: { login?: string } | null;
        default_branch?: string | null;
      }>;
      message?: string;
    };
    if (!response.ok) {
      throw new Error(
        data.message || `listInstallationRepositories failed (${response.status})`,
      );
    }
    for (const repo of data.repositories ?? []) {
      const owner = repo.owner?.login ?? "";
      repos.push({
        id: repo.id,
        owner,
        name: repo.name,
        fullName: repo.full_name ?? `${owner}/${repo.name}`,
        defaultBranch: repo.default_branch ?? null,
      });
    }
    url = parseNextLink(response.headers.get("link"));
  }
  return repos;
}

export interface InstallationAccount {
  login: string | null;
  type: string | null;
  repositorySelection: string | null;
}

/**
 * Métadonnées du compte d'une installation (login, type, sélection de dépôts).
 * Renvoie null sur échec pour que l'appelant retombe proprement.
 */
export async function getInstallationAccount(
  installationId: number | string,
): Promise<InstallationAccount | null> {
  try {
    const response = await fetch(
      `${GITHUB_API_BASE}/app/installations/${installationId}`,
      { headers: githubHeaders(mintAppJwt()) },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      account?: { login?: string; type?: string } | null;
      repository_selection?: string | null;
    };
    return {
      login: data.account?.login ?? null,
      type: data.account?.type ?? null,
      repositorySelection: data.repository_selection ?? null,
    };
  } catch {
    return null;
  }
}
