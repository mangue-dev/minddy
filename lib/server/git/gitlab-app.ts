import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decryptGitlabToken, encryptGitlabToken } from "./gitlab-credentials";
import {
  GITLAB_API_BASE,
  GITLAB_HOST,
  gitlabHeaders,
  gitlabNextPage,
} from "./gitlab-rest";

/**
 * App OAuth GitLab + plomberie des tokens (MIN-47), portée d'AutoKap
 * (gitlab-app.ts) : l'utilisateur autorise une fois (connect), minddy stocke les
 * tokens access+refresh (chiffrés) et réutilise le compte sur tous ses projets.
 * Les access tokens expirent (~2h) et sont rafraîchis paresseusement au moment
 * du mint. gitlab.com SaaS uniquement. L'agent de code (MIN-69) consomme ces
 * tokens via `getGitlabAccessToken` (clone + module MR `lib/server/agent/mr.ts`) ;
 * le webhook `/api/webhooks/gitlab` se crée À LA MAIN sur le dépôt (cf. .env.example).
 */

// `api` est le seul scope nécessaire — et le seul qui marche. Il donne l'accès
// complet read+write à l'API (fichiers/arbre/compare, commits, merge requests,
// webhooks), l'équivalent GitLab de Contents R/W + Pull-requests R/W du GitHub App.
export const GITLAB_OAUTH_SCOPES = "api";

// Rafraîchir quand l'access token est dans cette fenêtre d'expiry.
const REFRESH_SKEW_MS = 5 * 60 * 1000;
// Maintainer = 40 (créer webhooks + merger MRs). Le futur agent ouvre un webhook
// ET merge, donc le sélecteur ne surface que les projets à Maintainer+.
const MIN_ACCESS_LEVEL_MAINTAINER = 40;
const PROJECTS_PER_PAGE = 100;

// --- Environment -----------------------------------------------------------

function getGitlabClientId(): string {
  const value = process.env.GITLAB_OAUTH_CLIENT_ID;
  if (!value) throw new Error("Missing GITLAB_OAUTH_CLIENT_ID");
  return value;
}

function getGitlabClientSecret(): string {
  const value = process.env.GITLAB_OAUTH_CLIENT_SECRET;
  if (!value) throw new Error("Missing GITLAB_OAUTH_CLIENT_SECRET");
  return value;
}

export function isGitlabConfigured(): boolean {
  return !!(
    process.env.GITLAB_OAUTH_CLIENT_ID &&
    process.env.GITLAB_OAUTH_CLIENT_SECRET &&
    process.env.GITLAB_TOKEN_ENCRYPTION_SECRET
  );
}

// --- OAuth authorize + échange de token ------------------------------------

/** Construit l'URL authorize GitLab vers laquelle la route connect redirige. */
export function getGitlabAuthorizeUrl(opts: {
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: getGitlabClientId(),
    redirect_uri: opts.redirectUri,
    response_type: "code",
    state: opts.state,
    scope: GITLAB_OAUTH_SCOPES,
  });
  return `${GITLAB_HOST}/oauth/authorize?${params.toString()}`;
}

export interface GitlabTokenSet {
  accessToken: string;
  refreshToken: string;
  /** Expiry absolu (ISO) calculé depuis `expires_in`. */
  expiresAt: string;
  scope: string;
}

interface RawTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

/** POST gitlab.com/oauth/token (form-encoded). Partagé par échange + refresh. */
async function requestGitlabToken(
  params: Record<string, string>,
  nowMs: number,
): Promise<GitlabTokenSet> {
  const body = new URLSearchParams({
    client_id: getGitlabClientId(),
    client_secret: getGitlabClientSecret(),
    ...params,
  }).toString();
  const response = await fetch(`${GITLAB_HOST}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const data = (await response.json().catch(() => ({}))) as RawTokenResponse;
  if (!response.ok || !data.access_token || !data.refresh_token) {
    throw new Error(
      data.error_description ||
        data.error ||
        `GitLab token request failed (${response.status})`,
    );
  }
  const expiresInMs = (data.expires_in ?? 7200) * 1000;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(nowMs + expiresInMs).toISOString(),
    scope: data.scope ?? GITLAB_OAUTH_SCOPES,
  };
}

/** Échange un code d'autorisation contre un jeu de tokens (callback connect). */
export async function exchangeGitlabCode(opts: {
  code: string;
  redirectUri: string;
}): Promise<GitlabTokenSet> {
  return requestGitlabToken(
    {
      code: opts.code,
      grant_type: "authorization_code",
      redirect_uri: opts.redirectUri,
    },
    Date.now(),
  );
}

export interface GitlabUser {
  id: number;
  username: string;
}

/** Identifie le compte connecté (git_connections.provider_account_id + affichage). */
export async function getGitlabUser(accessToken: string): Promise<GitlabUser> {
  const response = await fetch(`${GITLAB_API_BASE}/user`, {
    headers: gitlabHeaders(accessToken),
  });
  const data = (await response.json().catch(() => ({}))) as {
    id?: number;
    username?: string;
    message?: string;
  };
  if (!response.ok || data.id == null) {
    throw new Error(data.message || `GitLab /user failed (${response.status})`);
  }
  return { id: data.id, username: data.username ?? "" };
}

// --- Mint de token avec refresh paresseux ----------------------------------

interface AccountTokenRow {
  id: string;
  provider: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
}

async function loadAccountTokenRow(
  connectionId: string,
): Promise<AccountTokenRow | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("git_connections")
    .select(
      "id, provider, access_token_encrypted, refresh_token_encrypted, token_expires_at",
    )
    .eq("id", connectionId)
    .maybeSingle();
  return (data as AccountTokenRow | null) ?? null;
}

/**
 * Renvoie un access token GitLab valide pour une connexion (git_connections.id),
 * en rafraîchissant paresseusement quand on est dans la fenêtre d'expiry.
 *
 * Les refresh tokens GitLab sont SINGLE-USE rotatifs : deux appels concurrents
 * peuvent courir pour rafraîchir la même ligne. On récupère au lieu de verrouiller :
 * le perdant relit la ligne (le gagnant a stocké un token frais) et l'utilise.
 */
export async function getGitlabAccessToken(connectionId: string): Promise<string> {
  const row = await loadAccountTokenRow(connectionId);
  if (!row || row.provider !== "gitlab") {
    throw new Error(
      `GitLab connection ${connectionId} not found or not a gitlab account`,
    );
  }
  const nowMs = Date.now();
  const expiresAtMs = row.token_expires_at ? Date.parse(row.token_expires_at) : 0;
  if (expiresAtMs - nowMs > REFRESH_SKEW_MS) {
    const token = decryptGitlabToken(row.access_token_encrypted);
    if (token) return token;
    // Déchiffrement échoué (secret tourné / corruption) → on tombe sur un refresh.
  }

  const refreshToken = decryptGitlabToken(row.refresh_token_encrypted);
  if (!refreshToken) {
    throw new Error(
      `GitLab connection ${connectionId} has no refresh token; reconnect required`,
    );
  }

  let refreshed: GitlabTokenSet;
  try {
    refreshed = await requestGitlabToken(
      { refresh_token: refreshToken, grant_type: "refresh_token" },
      nowMs,
    );
  } catch (err) {
    // Course de rotation single-use : un autre worker a rafraîchi en premier.
    // On relit ; si le gagnant a AVANCÉ l'expiry stockée au-delà de ce qu'on a lu,
    // son token est frais — on le réutilise.
    const recovered = await loadAccountTokenRow(connectionId);
    if (
      recovered &&
      recovered.token_expires_at != null &&
      recovered.token_expires_at !== row.token_expires_at
    ) {
      const token = decryptGitlabToken(recovered.access_token_encrypted);
      if (token) return token;
    }
    throw err;
  }

  // Persiste avec un compare-and-set sur l'expiry qu'on a lu. Si on perd, le token
  // du gagnant est aussi valide — on ne l'écrase pas. Notre access token frais est
  // valide jusqu'à sa propre expiry de toute façon.
  const supabase = getServiceClient();
  const persist = supabase
    .from("git_connections")
    .update({
      access_token_encrypted: encryptGitlabToken(refreshed.accessToken),
      refresh_token_encrypted: encryptGitlabToken(refreshed.refreshToken),
      token_expires_at: refreshed.expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId);
  await (row.token_expires_at == null
    ? persist.is("token_expires_at", null)
    : persist.eq("token_expires_at", row.token_expires_at));
  return refreshed.accessToken;
}

// --- Listing des projets (sélecteur de dépôt) ------------------------------

export interface GitlabProject {
  /** Id numérique du projet (stocké en `external_repo_id`). */
  id: string;
  /** Chemin complet "group/subgroup/project". */
  pathWithNamespace: string;
  name: string;
  defaultBranch: string | null;
}

/**
 * Liste les projets sur lesquels le compte connecté peut agir (Maintainer+, pour
 * que le futur agent puisse créer le webhook et merger les MRs). Paginé via
 * l'en-tête X-Next-Page.
 */
export async function listGitlabProjects(
  accessToken: string,
): Promise<GitlabProject[]> {
  const projects: GitlabProject[] = [];
  let page: number | null = 1;
  while (page) {
    const url =
      `${GITLAB_API_BASE}/projects?membership=true&simple=true` +
      `&min_access_level=${MIN_ACCESS_LEVEL_MAINTAINER}&per_page=${PROJECTS_PER_PAGE}&page=${page}`;
    const response: Response = await fetch(url, {
      headers: gitlabHeaders(accessToken),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      throw new Error(data.message || `listGitlabProjects failed (${response.status})`);
    }
    const rows = (await response.json()) as Array<{
      id: number;
      name?: string;
      path_with_namespace?: string;
      default_branch?: string | null;
    }>;
    for (const r of rows) {
      projects.push({
        id: String(r.id),
        pathWithNamespace: r.path_with_namespace ?? "",
        name: r.name ?? "",
        defaultBranch: r.default_branch ?? null,
      });
    }
    page = gitlabNextPage(response);
  }
  return projects;
}
