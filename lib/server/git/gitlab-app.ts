import "server-only";
import { capability, requireCapability } from "@/lib/server/capabilities";

import { getServiceClient } from "@/lib/supabase-service";
import {
  decryptForgeToken,
  encryptForgeToken,
} from "./token-crypto";
import { SITE_URL } from "@/lib/site";
import {
  GITLAB_API_BASE,
  GITLAB_HOST,
  gitlabHeaders,
  gitlabNextPage,
} from "./gitlab-rest";
import { ensureRepoWebhookSecret } from "./webhook-secret";
import {
  forgeRelayConfig,
  isForgeRelayClientConfigured,
} from "@/lib/server/forge-relay/client";
import { refreshGitlabTokensViaRelay } from "@/lib/server/forge-relay/token-refresh";
import { pushGitlabHookSecret } from "@/lib/server/forge-relay/gitlab-hook-sync";

/** Stable hook identity (docs/managed-forge-relay-plan.md): set as the
 * description at creation and on every update, so the hook is found by MARKER
 * even when its URL changes between local and relay modes. */
export const GITLAB_HOOK_MARKER = "minddy-forge-webhook";

/**
 * OAuth GitLab app + token plumbing (MIN-47), AutoKap scope
 * (gitlab-app.ts): user authorizes once (connect), minddy stores the
 * access+refresh tokens (encrypted) and reuses the account on all its projects.
 * The access tokens expire (~2h) and are lazily refreshed at mint time. gitlab.com SaaS only. The code agent (MIN-69) consumes these
 * tokens via `getGitlabAccessToken` (clone + MR module `lib/server/agent/mr.ts`);
 * webhook `/api/webhooks/gitlab` is provisioned on the repository by
 * `ensureGitlabIssuesHook` at activation of issue synchronization (MIN-97), and
 * remains to be created by hand for repositories that only use the agent.
 */

// `api` is the only scope needed — and the only one that works. It gives access
// complete read+write to the API (files/tree/compare, commits, merge requests,
// webhooks), the GitLab equivalent of Contents R/W + Pull-requests R/W from the GitHub App.
//
// AND IT IS A SCOPE THAT WE CANNOT REDUCE (MIN-327), to be said rather than
// leave guessing. The token that is given to the agent's microVM is CET access
// token: `api`, on the ENTIRE ACCOUNT of the person who linked the deposit — not on
// the only repository of the project. On the GitHub side, the mint accepts `repositories` and
// `permissions` and the agent receives a token scoped at the deposit, in writing or in
// lecture selon son ancrage (`RepoTokenAccess`, lib/server/agent/repo-access.ts) ;
// GitLab has **no** equivalent:
//
// - an OAuth token is not down-scoped at the time of use — the scope is
// frozen at authorization, and `read_repository` alone would not suffice for the rest
//     du travail de l'agent (MR, discussions, compare) ;
// - the only mechanism with reduced scope, the *project access token*, is a token
// PERSISTENT to create, store, track and revoke, with a minimum duration of one
//     day. We would exchange a token of one hour too large for a token of one
// well-scored day, plus a whole life cycle to keep up.
//
// Assumed consequence, of the same kind as the absence of bot identity (MIN-146):
// a GitLab REVIEW session runs with a token that can write, where its
// GitHub equivalent only has `contents: read`. It's written here, in SECURITY.md,
// and the binding UI already says under which account the agent is acting.
export const GITLAB_OAUTH_SCOPES = "api";

// Refresh when the access token is in this expiry window.
const REFRESH_SKEW_MS = 5 * 60 * 1000;
// Maintainer = 40 (create webhooks + merger MRs). The future agent opens a webhook
// AND merge, so the selector only surfaces projects to Maintainer+.
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
  return capability("gitlab").configured;
}

/**
 * LOCAL OAuth app credentials only — distinct from `isGitlabConfigured()`,
 * which also counts the managed forge relay as deployed. The connect route
 * uses this to hold the documented precedence
 * (docs/managed-forge-relay-plan.md): with a local app configured, new
 * connections stay local even when the relay is also available. Mirrors the
 * local branch of the `gitlab` capability (client id/secret, git state
 * signing secret, token encryption secret).
 */
export function isLocalGitlabOAuthConfigured(): boolean {
  const tokenEncryption =
    process.env.GIT_TOKEN_ENCRYPTION_SECRET ||
    process.env.GITLAB_TOKEN_ENCRYPTION_SECRET;
  return Boolean(
    process.env.GITLAB_OAUTH_CLIENT_ID?.trim() &&
      process.env.GITLAB_OAUTH_CLIENT_SECRET?.trim() &&
      process.env.GIT_STATE_SECRET?.trim() &&
      tokenEncryption?.trim(),
  );
}

// --- OAuth authorize + token exchange ------------------------------------

/** Constructs the authorize GitLab URL that the connect route redirects to. */
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
  /** Absolute Expiry (ISO) calculated from `expires_in`. */
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

/** POST gitlab.com/oauth/token (form-encoded). Shared by exchange + refresh. */
async function requestGitlabToken(
  params: Record<string, string>,
  nowMs: number,
): Promise<GitlabTokenSet> {
  requireCapability("gitlab");
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

/** Exchanges an authorization code for a set of tokens (callback connect). */
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

/** Identifies the connected account (git_connections.provider_account_id + display). */
export async function getGitlabUser(accessToken: string): Promise<GitlabUser> {
  requireCapability("gitlab");
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

// --- Token mint with lazy refresh ----------------------------------

interface AccountTokenRow {
  id: string;
  provider: string | null;
  /** "relay" when the connection was established through the managed forge
   * relay — its tokens belong to the MANAGED app's client, so their refresh
   * grant must run Cloud-side, not here (no local client credentials). */
  source: string | null;
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
      "id, provider, source, access_token_encrypted, refresh_token_encrypted, token_expires_at",
    )
    .eq("id", connectionId)
    .maybeSingle();
  return (data as AccountTokenRow | null) ?? null;
}

/**
 * One rotation at a time per connection, IN this process — same reason as
 * promise sharing of `user-identities.ts`: the panel of a merge request
 * fires several requests in parallel, each mint this token, and two concurrent rotations
 * leave in base a token that the other comes from to invalidate.
 */
const inFlight = new Map<string, Promise<string>>();

/**
 * Refresh grant for a RELAYED connection (docs/managed-forge-relay-plan.md).
 * The token belongs to the managed app's client — a local grant would fail
 * (no local client credentials) and a local app's credentials would fail the
 * other way (grant issued by another app). Cloud runs the refresh; same
 * single-use rotation semantics as the direct grant.
 */
async function relayedGitlabRefresh(refreshToken: string): Promise<GitlabTokenSet> {
  const refreshed = await refreshGitlabTokensViaRelay(refreshToken);
  return {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresAt: refreshed.expiresAt ?? new Date(Date.now() + 7200_000).toISOString(),
    scope: refreshed.scope ?? GITLAB_OAUTH_SCOPES,
  };
}

/**
 * Returns a valid GitLab access token for a connection (git_connections.id),
 * refreshing lazily when in the expiry window.
 *
 * GitLab refresh tokens are SINGLE-USE rotating: two concurrent calls
 * can run for refresh the same line. We recover instead of locking:
 * the loser rereads the line (the winner stored a fresh token) and uses it.
 *
 * `force` skips the "not yet expired" shortcut: this is what a
 * caller to whom GitLab just responded 401 on this token-there.
 */
export async function getGitlabAccessToken(
  connectionId: string,
  opts: { force?: boolean } = {},
): Promise<string> {
  requireCapability("gitlab");
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
    // Decryption failed (secret twisted / corruption) → we come across a refresh.
  }

  const refreshToken = decryptForgeToken(row.refresh_token_encrypted);
  if (!refreshToken) {
    throw new Error(
      `GitLab connection ${connectionId} has no refresh token; reconnect required`,
    );
  }

  let refreshed: GitlabTokenSet;
  try {
    refreshed =
      row.source === "relay"
        ? await relayedGitlabRefresh(refreshToken)
        : await requestGitlabToken(
            { refresh_token: refreshToken, grant_type: "refresh_token" },
            nowMs,
          );
  } catch (err) {
    // Single-use rotation race: another worker refreshed first.
    // We reread; if the winner has ADVANCED the stored expiry beyond what was read,
    // its token is fresh — we reuse it.
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

  // Persist with a compare-and-set on the expiry we read. Losing this CAS is not
  // NOT trivial: the line keeps the winner's token, only our own rotation
  // may have just been invalidated at GitLab. They say it — it’s the only trace that
  // name this race, and probe 401 of `forge-actor.ts` catches it.
  // On a FORCED rotation, the CAS jumps: it starts from an expiry
  // stored that the forge has denied, and it is our token which is authentic.
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

// --- Listing of projects (repository selector) ------------------------------

export interface GitlabProject {
  /** Numerical id of the project (stored in `external_repo_id`). */
  id: string;
  /** Chemin complet "group/subgroup/project". */
  pathWithNamespace: string;
  name: string;
  defaultBranch: string | null;
}

/**
 * Lists the projects on which the connected account can act (Maintainer+, so
 * that the future agent can create the webhook and merge the MRs). Paged via
 * the X-Next-Page.
 */
export async function listGitlabProjects(
  accessToken: string,
): Promise<GitlabProject[]> {
  requireCapability("gitlab");
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

// --- Issues + repository webhook (one-way sync, MIN-97) ---------

export interface GitlabIssue {
  /** Number visible in the URL (specific to the project), not to be confused with `id`. */
  iid: number;
  title: string;
  description: string | null;
  webUrl: string | null;
  /** Label names — priority, effort and categories come out (MIN-97 continued).
 * GitLab's REST API renders them as bare strings, where the webhook wraps them in
 * objects. */
  labels: string[];
  /** Logins of assignees, in GitLab order. */
  assigneeLogins: string[];
}

const ISSUES_PER_PAGE = 100;

/**
 * Lists OPEN issues of a GitLab project (sync backfill), paginated
 * via X-Next-Page. Unlike GitHub, `/issues` does not mix merge
 * requests — nothing to filter. Lifts on a non-OK response.
 */
export async function listGitlabOpenIssues(
  accessToken: string,
  projectId: string,
  /** Hard ceiling: we stop as soon as it is reached (bounded backfill). */
  limit = Number.POSITIVE_INFINITY,
): Promise<GitlabIssue[]> {
  requireCapability("gitlab");
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
      labels?: string[] | null;
      assignees?: Array<{ username?: string }> | null;
    }>;
    for (const r of rows) {
      if (typeof r.iid !== "number") continue;
      issues.push({
        iid: r.iid,
        title: r.title ?? "",
        description: r.description ?? null,
        webUrl: r.web_url ?? null,
        labels: (r.labels ?? []).map((l) => l?.trim() ?? "").filter(Boolean),
        assigneeLogins: (r.assignees ?? [])
          .map((a) => a?.username?.trim() ?? "")
          .filter(Boolean),
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
  /** Stable marker set at creation — identifies the hook even when its URL
   * changes (relay mode points it at Cloud instead of the instance). */
  description?: string;
  issues_events?: boolean;
  merge_requests_events?: boolean;
  note_events?: boolean;
  emoji_events?: boolean;
  pipeline_events?: boolean;
}

/**
 * The body of a POST/PUT hook — the WRITE counterpart of `GitlabHook`, including
 * all flags are required: GitLab treats a missing flag as
 * `false`, so "forget" `note_events` unsubscribes the hook by silence. Name
 * form fails compilation rather than webhook.
 */
interface GitlabHookWrite {
  url: string;
  token: string;
  description?: string;
  issues_events: boolean;
  merge_requests_events: boolean;
  note_events: boolean;
  emoji_events: boolean;
  pipeline_events: boolean;
  push_events: boolean;
  enable_ssl_verification: boolean;
}

/**
 * Aligns the GitLab project's minddy webhook with the desired state of the issue sync. GitLab does not have a global endpoint like the GitHub App: the hook lives
 * ON THE REPOSITORY, so we provision it upon activation.
 *
 * Absent → creation (issues + merge requests + notes + reactions + pipelines,
 * never pushes). Present → a PUT which ONLY toggles `issues_events`. Never
 * DELETE: the same hook carries the agent's MR sync (MIN-69), the
 * MR comments from the activity log and the direct PR (MIN-161) — the
 * deactivating is putting back `issues_events: false`, not deleting the line.
 *
 * `opts.secret` is the secret SPECIFIC TO THIS DEPOSIT (MIN-333), minted by
 * `ensureRepoWebhookSecret`: it is the caller who provides it, because it is
 * he who knows in what order to write it (in base first, then at GitLab).
 *
 * `opts.enabled` OMITTED = we preserve `issues_events` as is and we do not create
 * anything: this is the form used by secret rotation, which must not not
 * decide the project setting instead.
 *
 * Returns the hook id (stored in `issue_sync_hook_id`), or null when there
 * was nothing to do. Raises on API call failure.
 */
export async function ensureGitlabIssuesHook(
  accessToken: string,
  projectId: string,
  opts: { enabled?: boolean; secret: string; source?: string | null },
): Promise<string | null> {
  requireCapability("gitlab");
  // RELAY mode (docs/managed-forge-relay-plan.md): the hook points at Cloud's
  // relay receiver instead of the instance origin — Cloud re-signs and fans
  // deliveries out with the SAME per-repo secret, so the receiver is
  // unchanged. Hook identification switches from exact URL to the stable
  // description marker: without it, flipping between local and relay would
  // create a DUPLICATE hook (and duplicate deliveries, one of which fails
  // signature verification at the instance).
  //
  // Relay-ness is a property of the CONNECTION (its `source` marker), not of
  // the instance configuration: on an instance that also serves local GitLab
  // apps, local repositories must keep their instance-pointed hook and never
  // leak their name or hook secret to Cloud.
  const relayed = opts.source === "relay" && isForgeRelayClientConfigured();
  const relayConfig = relayed ? forgeRelayConfig() : null;
  const webhookUrl = relayConfig
    ? `${relayConfig.url.replace(/\/$/, "")}/api/relay/gitlab/webhook`
    : `${SITE_URL}/api/webhooks/gitlab`;
  const secret = opts.secret;

  const base = `${GITLAB_API_BASE}/projects/${encodeURIComponent(projectId)}/hooks`;
  const listResponse = await fetch(base, { headers: gitlabHeaders(accessToken) });
  if (!listResponse.ok) {
    const data = (await listResponse.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message || `list hooks failed (${listResponse.status})`);
  }
  const hooks = (await listResponse.json()) as GitlabHook[];
  const existing = hooks.find(
    (h) => h.description === GITLAB_HOOK_MARKER || h.url === webhookUrl,
  );

  const write = async (url: string, method: "POST" | "PUT", body: GitlabHookWrite) => {
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

  const finish = async (hookId: string | null): Promise<string | null> => {
    // The per-repo secret is shared with Cloud at registration time AND on
    // every rotation — this function IS both paths.
    if (relayConfig) await pushGitlabHookSecret(projectId, secret);
    return hookId;
  };

  if (!existing) {
    // Nothing to create for a simple deactivation — nor for a rotation, which
    // only makes sense on an already installed hook.
    if (opts.enabled !== true) return null;
    return finish(
      await write(base, "POST", {
        url: webhookUrl,
        token: secret,
        description: GITLAB_HOOK_MARKER,
        issues_events: true,
      merge_requests_events: true,
      // MR comments (thread message, line remark) go into
      // the ticket activity log — GitLab only delivers them under this
      // flag, a commented MR produces NO `merge_request` event.
      note_events: true,
      // REACTIONS (MIN-161). GitLab is the only one of the two forges to
      // commit — GitHub doesn't have a react event at all — and that's what
      // flag that opens them. Without it, react on gitlab.com does not reach the
      // panel open only at the next refresh.
      emoji_events: true,
      // The CI, for the live check banner.
      pipeline_events: true,
      push_events: false,
      enable_ssl_verification: true,
    }),
    );
  }

  await write(`${base}/${existing.id}`, "PUT", {
    url: webhookUrl,
    token: secret,
    description: GITLAB_HOOK_MARKER,
    // Omitted = secret rotation: project setting is not the issue,
    // we put back what the hook already carried.
    issues_events: opts.enabled ?? existing.issues_events ?? false,
    // The hook is shared with the MR sync: we preserve it as is.
    merge_requests_events: existing.merge_requests_events ?? true,
    // The notes ALIGN rather than preserve themselves: this is the passage
    // which catches up with related repositories before comments arrive at the journal.
    note_events: true,
    // Same reasoning for reactions and CI (MIN-161): it is this PUT which
    // catch up related repositories before live, as it did for notes.
    emoji_events: true,
    pipeline_events: true,
    push_events: false,
    enable_ssl_verification: true,
  });
  return finish(String(existing.id));
}

/**
 * Migrates a hook that still uses the historical global secret.
 *
 * The receiver schedules this after the first authenticated legacy delivery.
 * Persisting the repository-specific secret happens before rewriting the hook
 * and immediately revokes the old credential for this repository (MIN-435).
 * Deliveries signed with the old token during that short update window are
 * rejected rather than keeping the stale credential valid.
 *
 * The operation is best-effort. A failed GitLab update leaves the dedicated
 * secret stored, so a later provisioning attempt reuses the same value instead
 * of generating a credential that the receiver and hook disagree about.
 */
export async function rotateGitlabWebhookSecret(params: {
  externalRepoId: string;
  connectionId: string;
}): Promise<void> {
  try {
    const secret = await ensureRepoWebhookSecret({
      provider: "gitlab",
      externalRepoId: params.externalRepoId,
    });
    const token = await getGitlabAccessToken(params.connectionId);
    // The rotation must preserve the hook's relay-ness: the source marker of
    // the connection decides where the hook points and whether the secret is
    // shared with Cloud.
    const supabase = getServiceClient();
    const { data: connection } = await supabase
      .from("git_connections")
      .select("source")
      .eq("id", params.connectionId)
      .maybeSingle();
    const source = (connection as { source: string | null } | null)?.source ?? null;
    await ensureGitlabIssuesHook(token, params.externalRepoId, { secret, source });
    console.info(
      `[gitlab-app] webhook secret rotated for project ${params.externalRepoId}`,
    );
  } catch (err) {
    console.error(
      `[gitlab-app] webhook secret rotation failed for project ${params.externalRepoId}:`,
      (err as Error).message,
    );
  }
}
