import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import {
  decryptForgeToken,
  encryptForgeToken,
  isForgeTokenCryptoConfigured,
} from "./token-crypto";
import { SITE_URL } from "@/lib/site";
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
 * le webhook `/api/webhooks/gitlab` est provisionné sur le dépôt par
 * `ensureGitlabIssuesHook` à l'activation de la synchro d'issues (MIN-97), et
 * reste à créer à la main pour les dépôts qui n'utilisent que l'agent.
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
    // Le secret de chiffrement accepte ses DEUX noms (MIN-144) : une prod qui ne
    // pose que `GITLAB_TOKEN_ENCRYPTION_SECRET` reste configurée à l'identique.
    isForgeTokenCryptoConfigured()
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
 * Une rotation à la fois par connexion, DANS ce process — même raison que le
 * partage de promesse de `user-identities.ts` : le panneau d'une merge request
 * tire plusieurs requêtes en parallèle, chacune mint ce token, et deux rotations
 * concurrentes laissent en base un token que l'autre vient d'invalider.
 */
const inFlight = new Map<string, Promise<string>>();

/**
 * Renvoie un access token GitLab valide pour une connexion (git_connections.id),
 * en rafraîchissant paresseusement quand on est dans la fenêtre d'expiry.
 *
 * Les refresh tokens GitLab sont SINGLE-USE rotatifs : deux appels concurrents
 * peuvent courir pour rafraîchir la même ligne. On récupère au lieu de verrouiller :
 * le perdant relit la ligne (le gagnant a stocké un token frais) et l'utilise.
 *
 * `force` saute le raccourci « pas encore expiré » : c'est ce que fait un
 * appelant à qui GitLab vient de répondre 401 sur ce token-là.
 */
export async function getGitlabAccessToken(
  connectionId: string,
  opts: { force?: boolean } = {},
): Promise<string> {
  const shared = opts.force ? null : inFlight.get(connectionId);
  if (shared) return shared;
  const task = mintGitlabAccessToken(connectionId, !!opts.force).finally(() => {
    if (inFlight.get(connectionId) === task) inFlight.delete(connectionId);
  });
  inFlight.set(connectionId, task);
  return task;
}

async function mintGitlabAccessToken(
  connectionId: string,
  force: boolean,
): Promise<string> {
  const row = await loadAccountTokenRow(connectionId);
  if (!row || row.provider !== "gitlab") {
    throw new Error(
      `GitLab connection ${connectionId} not found or not a gitlab account`,
    );
  }
  const nowMs = Date.now();
  const expiresAtMs = row.token_expires_at ? Date.parse(row.token_expires_at) : 0;
  if (!force && expiresAtMs - nowMs > REFRESH_SKEW_MS) {
    const token = decryptForgeToken(row.access_token_encrypted);
    if (token) return token;
    // Déchiffrement échoué (secret tourné / corruption) → on tombe sur un refresh.
  }

  const refreshToken = decryptForgeToken(row.refresh_token_encrypted);
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
      const token = decryptForgeToken(recovered.access_token_encrypted);
      if (token) return token;
    }
    throw err;
  }

  // Persiste avec un compare-and-set sur l'expiry qu'on a lu. Perdre ce CAS n'est
  // PAS anodin : la ligne garde le token du gagnant, que notre propre rotation
  // vient peut-être d'invalider chez GitLab. On le dit — c'est la seule trace qui
  // nomme cette course, et le probe 401 de `forge-actor.ts` la rattrape.
  // Sur une rotation FORCÉE, le CAS saute : elle part justement d'une expiry
  // stockée que la forge a démentie, et c'est notre token qui fait foi.
  const supabase = getServiceClient();
  const persist = supabase
    .from("git_connections")
    .update({
      access_token_encrypted: encryptForgeToken(refreshed.accessToken),
      refresh_token_encrypted: encryptForgeToken(refreshed.refreshToken),
      token_expires_at: refreshed.expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId);
  const guarded = force
    ? persist
    : row.token_expires_at == null
      ? persist.is("token_expires_at", null)
      : persist.eq("token_expires_at", row.token_expires_at);
  const { data: written } = await guarded.select("id");
  if (!force && !written?.length) {
    console.warn(
      "[gitlab-app] concurrent GitLab token rotation: our refresh was not persisted",
    );
  }
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

// --- Issues + webhook du dépôt (synchro unidirectionnelle, MIN-97) ---------

export interface GitlabIssue {
  /** Numéro visible dans l'URL (propre au projet), à ne pas confondre avec `id`. */
  iid: number;
  title: string;
  description: string | null;
  webUrl: string | null;
}

const ISSUES_PER_PAGE = 100;

/**
 * Liste les issues OUVERTES d'un projet GitLab (backfill de la synchro), paginé
 * via X-Next-Page. Contrairement à GitHub, `/issues` ne mélange pas les merge
 * requests — rien à filtrer. Lève sur une réponse non-OK.
 */
export async function listGitlabOpenIssues(
  accessToken: string,
  projectId: string,
  /** Plafond dur : on s'arrête dès qu'il est atteint (backfill borné). */
  limit = Number.POSITIVE_INFINITY,
): Promise<GitlabIssue[]> {
  const issues: GitlabIssue[] = [];
  let page: number | null = 1;
  while (page && issues.length < limit) {
    const url =
      `${GITLAB_API_BASE}/projects/${encodeURIComponent(projectId)}/issues` +
      `?state=opened&per_page=${ISSUES_PER_PAGE}&page=${page}`;
    const response: Response = await fetch(url, {
      headers: gitlabHeaders(accessToken),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(
        data.message || `listGitlabOpenIssues failed (${response.status})`,
      );
    }
    const rows = (await response.json()) as Array<{
      iid?: number;
      title?: string;
      description?: string | null;
      web_url?: string | null;
    }>;
    for (const r of rows) {
      if (typeof r.iid !== "number") continue;
      issues.push({
        iid: r.iid,
        title: r.title ?? "",
        description: r.description ?? null,
        webUrl: r.web_url ?? null,
      });
      if (issues.length >= limit) break;
    }
    page = gitlabNextPage(response);
  }
  return issues;
}

interface GitlabHook {
  id: number;
  url?: string;
  issues_events?: boolean;
  merge_requests_events?: boolean;
  note_events?: boolean;
  emoji_events?: boolean;
  pipeline_events?: boolean;
}

/**
 * Aligne le webhook minddy du projet GitLab sur l'état voulu de la synchro
 * d'issues. GitLab n'a pas d'endpoint global comme la GitHub App : le hook vit
 * SUR LE DÉPÔT, donc on le provisionne à l'activation.
 *
 * Absent → création (issues + merge requests + notes + réactions + pipelines,
 * jamais les pushs). Présent → un PUT qui ne bascule QUE `issues_events`. Jamais
 * de DELETE : le même hook porte la synchro des MR de l'agent (MIN-69), les
 * commentaires de MR du journal d'activité et le direct des PR (MIN-161) — le
 * désactiver, c'est remettre `issues_events: false`, pas supprimer la ligne.
 *
 * Renvoie l'id du hook (stocké en `issue_sync_hook_id`), ou null si aucun
 * secret n'est déployé — sans secret le récepteur est fail-closed, un hook
 * serait ignoré de toute façon. Lève sur échec d'appel API.
 */
export async function ensureGitlabIssuesHook(
  accessToken: string,
  projectId: string,
  opts: { enabled: boolean },
): Promise<string | null> {
  const webhookUrl = `${SITE_URL}/api/webhooks/gitlab`;
  const secret = process.env.GITLAB_WEBHOOK_SECRET;
  if (!secret) {
    console.warn(
      "[gitlab-app] GITLAB_WEBHOOK_SECRET is not set — hook not provisioned",
    );
    return null;
  }

  const base = `${GITLAB_API_BASE}/projects/${encodeURIComponent(projectId)}/hooks`;
  const listResponse = await fetch(base, { headers: gitlabHeaders(accessToken) });
  if (!listResponse.ok) {
    const data = (await listResponse.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message || `list hooks failed (${listResponse.status})`);
  }
  const hooks = (await listResponse.json()) as GitlabHook[];
  const existing = hooks.find((h) => h.url === webhookUrl);

  const write = async (url: string, method: "POST" | "PUT", body: object) => {
    const response = await fetch(url, {
      method,
      headers: { ...gitlabHeaders(accessToken), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as {
      id?: number;
      message?: string;
    };
    if (!response.ok) {
      throw new Error(data.message || `${method} hook failed (${response.status})`);
    }
    return data.id != null ? String(data.id) : null;
  };

  if (!existing) {
    // Rien à créer pour une simple désactivation.
    if (!opts.enabled) return null;
    return write(base, "POST", {
      url: webhookUrl,
      token: secret,
      issues_events: true,
      merge_requests_events: true,
      // Les commentaires de MR (message de fil, remarque de ligne) entrent dans
      // le journal d'activité du ticket — GitLab ne les livre que sous ce
      // drapeau, une MR commentée ne produit AUCUN `merge_request` event.
      note_events: true,
      // Les RÉACTIONS (MIN-161). GitLab est la seule des deux forges à les
      // livrer — GitHub n'a pas d'événement de réaction du tout —, et c'est ce
      // drapeau qui les ouvre. Sans lui, réagir sur gitlab.com n'atteint le
      // panneau ouvert qu'au prochain rafraîchissement.
      emoji_events: true,
      // La CI, pour le bandeau de checks en direct.
      pipeline_events: true,
      push_events: false,
      enable_ssl_verification: true,
    });
  }

  await write(`${base}/${existing.id}`, "PUT", {
    url: webhookUrl,
    token: secret,
    issues_events: opts.enabled,
    // Le hook est partagé avec la synchro des MR : on le préserve tel quel.
    merge_requests_events: existing.merge_requests_events ?? true,
    // Les notes, elles, s'ALIGNENT plutôt que se préserver : c'est ce passage
    // qui rattrape les dépôts liés avant l'arrivée des commentaires au journal.
    note_events: true,
    // Même raisonnement pour les réactions et la CI (MIN-161) : c'est ce PUT qui
    // rattrape les dépôts liés avant le direct, comme il l'a fait pour les notes.
    emoji_events: true,
    pipeline_events: true,
    push_events: false,
    enable_ssl_verification: true,
  });
  return String(existing.id);
}
