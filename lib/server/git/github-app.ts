import "server-only";

import crypto from "node:crypto";
import { capability, requireCapability } from "@/lib/server/capabilities";

import {
  GITHUB_API_BASE,
  githubHeaders,
  parseNextLink,
} from "./github-rest";
import type { GithubIssueMetadata } from "./issue-sync-core";

/**
 * GitHub App client (MIN-47), ported from AutoKap (github-app.ts) and reduced to the flow
 * inert binding: mint of the app JWT, exchange in installation token,
 * enumeration of repositories, metadata of the installed account. NO client
 * repo-scoped or webhooks (these will come with the code agent, MIN-46).
 *
 * Auth model: the app authenticates as itself via a short RS256 JWT
 * (`mintAppJwt`), exchange it for an installation token (`getInstallationToken`),
 * then calls the REST API scoped to the installation repositories.
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
  // Single-line envs store the PEM with \n escapes; we restore them.
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

export function getGithubAppSlug(): string {
  const value = process.env.GITHUB_APP_SLUG;
  if (!value) throw new Error("Missing GITHUB_APP_SLUG");
  return value;
}

export function isGithubAppConfigured(): boolean {
  return capability("github").configured;
}

export function isGithubWebhookConfigured(): boolean {
  return !!process.env.GITHUB_WEBHOOK_SECRET;
}

/**
 * Checks the HMAC signature of a GitHub webhook (`X-Hub-Signature-256: sha256=<hex>`)
 * in constant time. Returns false — never an exception — on missing/malformed
 * header or any discrepancy (fail closed). The webhook receiver is INERT
 * for the moment (it acknowledges without processing); MIN-46 will hook up the logic.
 */
export function verifyGithubSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean {
  if (!signatureHeader) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    const provided = Buffer.from(signatureHeader);
    const computed = Buffer.from(expected);
    if (provided.length !== computed.length) return false;
    return crypto.timingSafeEqual(provided, computed);
  } catch {
    return false;
  }
}

// --- Authentification de l'app ---------------------------------------------

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * Mint a short RS256 JWT that authenticates the GitHub app itself. `iat` moved back by
 * 60s to tolerate clock drift; `exp` to 8 min (under the GitHub cap of
 * 10 min). node:crypto accepts PKCS#1 (`BEGIN RSA PRIVATE KEY`, default of
 * GitHub) and PKCS#8 (`BEGIN PRIVATE KEY`).
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

/**
 * HOW TO RESTRICT THE TOKEN WE MINTE (MIN-327).
 *
 * Without these two fields, `POST /access_tokens` makes the MAXIMUM token of
 * the installation: **all** its repositories, **all** its permissions. It is this
 * token that went into the `.git/config` of the agent's microVM — therefore
 * readable by the model, therefore exfiltrable by an injection, therefore a key on
 * all the private deposits of the account for a project which has only linked one.
 *
 * The two fields are independent and cumulative:
 *
 * - `repositories` reduces the SCOPE. These are the SHORT names (`minddy`), never
 * `owner/name` — GitHub responds 422 on a slash. This is the restriction that
 * matters: it turns "all repositories" into "the ones the project has linked to."
 * - `permissions` reduces POWER, and it is only ever a subset of
 * what the installation has already accepted. Asking for permission that it doesn't have is a 422 — hence the rule: only narrow with `contents`, the only
 * that the App has declared since its first day (see `.env.example`). A
 * permission added later is not retroactive, and a mint asking for it would break existing installations.
 */
export interface InstallationTokenScope {
  /** SHORT repository names (`name`), never `owner/name`. */
  repositories?: string[];
  /** Sous-ensemble des permissions de l'installation (voir ci-dessus). */
  permissions?: Record<string, "read" | "write">;
}

// In-process cache of installation tokens, by installationId AND BY SCOPE.
// GitHub tokens are worth ~1h; reused until SAFETY_WINDOW_MS before expiry.
// Best-effort.
//
// The scope is part of the key, and it's structural: without it, the first
// mint large of a process would reserve its token to a caller who requested a
// restricted token — the restriction would be true on the wire and false in memory,
// exactly the kind of guard that looks calm and isn't.
//
// ON THE LIFESPAN (MIN-327): GitHub sets it at 1 hour and does not accept any
// parameter to shorten it. What we can reduce is therefore not the
// TIME the token is worth is what it OPENS — the scope and
// permissions above. A microVM token in turn survives in the worst case
// one hour, on a single repository, with `contents` for only permission.
const SAFETY_WINDOW_MS = 5 * 60_000;
const installationTokenCache = new Map<string, InstallationToken>();

/** STABLE cache key for a pair (installation, scope): the lists are
 * sorted, so two equivalent calls in a different order share
 * the same token. */
function installationTokenCacheKey(
  installationId: number | string,
  scope: InstallationTokenScope | undefined,
): string {
  const repos = [...(scope?.repositories ?? [])].sort().join(",");
  const perms = Object.entries(scope?.permissions ?? {})
    .map(([name, level]) => `${name}:${level}`)
    .sort()
    .join(",");
  return `${installationId}|${repos}|${perms}`;
}

/**
 * Exchanges the app JWT for an installation token, restricted to `scope` when
 * is given one (see `InstallationTokenScope`: WITHOUT it, the token is worth
 * on all installation repositories). Reuses a still valid token from
 * the in-process cache, with equal scope.
 */
export async function getInstallationToken(
  installationId: number | string,
  scope?: InstallationTokenScope,
): Promise<InstallationToken> {
  requireCapability("github");
  const key = installationTokenCacheKey(installationId, scope);
  const cached = installationTokenCache.get(key);
  if (cached && Date.parse(cached.expiresAt) - Date.now() > SAFETY_WINDOW_MS) {
    return cached;
  }

  const payload: Record<string, unknown> = {};
  if (scope?.repositories?.length) payload.repositories = scope.repositories;
  if (scope?.permissions && Object.keys(scope.permissions).length > 0) {
    payload.permissions = scope.permissions;
  }

  const response = await fetch(
    `${GITHUB_API_BASE}/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        ...githubHeaders(mintAppJwt()),
        ...(Object.keys(payload).length > 0
          ? { "Content-Type": "application/json" }
          : {}),
      },
      ...(Object.keys(payload).length > 0 ? { body: JSON.stringify(payload) } : {}),
    },
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

/** Clears the installation token cache. Reserved for testing — a token that
 * survives from one case to the next would hide the scope requested by the second. */
export function __clearInstallationTokenCacheForTests(): void {
  installationTokenCache.clear();
}

/**
 * Token source of the listing helpers below (forge-provider seam,
 * docs/managed-forge-relay-plan.md): defaults to the local App mint, and a
 * RELAYED connection passes `ForgeProvider.getInstallationToken` so the token
 * is minted by the Cloud control plane instead. Same shape as
 * `ForgeProvider.getInstallationToken` — the object-method form keeps the
 * call sites free of any `this` binding.
 */
export type InstallationTokenMinter = (input: {
  installationId: number | string;
  scope?: InstallationTokenScope;
}) => Promise<InstallationToken>;

/** The default minter: the local App, unchanged behavior. */
const localInstallationTokenMinter: InstallationTokenMinter = ({
  installationId,
  scope,
}) => getInstallationToken(installationId, scope);

export interface InstallationRepo {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string | null;
}

const INSTALLATION_REPOS_PER_PAGE = 100;

/**
 * Lists all repositories that an installation can reach (paginated via the
 * Link header). Feeds the link feed drop selector. Raise on a non-OK response
 * so that the caller surfaces the failure.
 */
export async function listInstallationRepositories(
  installationId: number | string,
  mint: InstallationTokenMinter = localInstallationTokenMinter,
): Promise<InstallationRepo[]> {
  const { token } = await mint({ installationId });
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

export interface CommitIdentity {
  name: string;
  email: string;
}

// Stored Git identity of the App bot (login `<slug>[bot]`). The numeric id of
// bot is stable per app; solved once then reused for the entire process.
let cachedBotIdentity: CommitIdentity | null = null;

/**
 * GitHub App bot commit identity (`<slug>[bot]` + its email noreply
 * GitHub `<id>+<slug>[bot]@users.noreply.github.com`). Committing under THIS
 * identity — not a fancy email like `agent@minddy.app` — allows GitHub,
 * and therefore Vercel's commit author control, to attach each commit from
 * the agent to a real account (exactly like dependabot[bot] / github-actions[bot]) ;
 * otherwise Vercel blocks the deployment (“commit email could not be matched to a
 * GitHub account”). The numeric id comes from `GET /users/<slug>[bot]` (public
 * data, readable with the installation token) and never changes: memorized.
 */
export async function getGithubBotCommitIdentity(
  installationToken: string,
): Promise<CommitIdentity> {
  requireCapability("github");
  if (cachedBotIdentity) return cachedBotIdentity;

  const login = `${getGithubAppSlug()}[bot]`;
  const response = await fetch(
    `${GITHUB_API_BASE}/users/${encodeURIComponent(login)}`,
    { headers: githubHeaders(installationToken) },
  );
  const data = (await response.json()) as { id?: number; message?: string };
  if (!response.ok || typeof data.id !== "number") {
    throw new Error(
      data.message || `Failed to resolve GitHub App bot user id (${response.status})`,
    );
  }

  cachedBotIdentity = {
    name: login,
    email: `${data.id}+${login}@users.noreply.github.com`,
  };
  return cachedBotIdentity;
}

export interface RemoteRepoIssue {
  number: number;
  title: string;
  body: string | null;
  htmlUrl: string | null;
  /** Label names — priority, effort and categories come out (MIN-97 continued). */
  labels: string[];
  /** Logins of assignees, in GitHub order. */
  assigneeLogins: string[];
  /** The due date carried by the assigned milestone, if any. */
  dueDate: string | null;
  createdAt: string | null;
  closedAt: string | null;
  updatedAt: string | null;
  githubMetadata: GithubIssueMetadata;
}

/** A regular issue comment returned by GitHub's paginated REST endpoint. */
export interface RemoteGithubIssueComment {
  id: string;
  body: string;
  authorLogin: string | null;
  authorAssociation: string | null;
  htmlUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

const REPO_ISSUES_PER_PAGE = 100;

/**
 * Lists the OPEN issues of a repository (sync backfill, MIN-97), paginated
 * via the Link header. `/issues` ALSO returns pull requests — any
 * entry with a `pull_request` field is discarded. Lifts on a non-OK response.
 */
export async function listRepoOpenIssues(
  installationId: number | string,
  repoFullName: string,
  /** Hard ceiling: we stop as soon as it is reached (bounded backfill). */
  limit = Number.POSITIVE_INFINITY,
  mint: InstallationTokenMinter = localInstallationTokenMinter,
): Promise<RemoteRepoIssue[]> {
  const { token } = await mint({ installationId });
  const issues: RemoteRepoIssue[] = [];
  let url: string | null =
    `${GITHUB_API_BASE}/repos/${repoFullName}/issues?state=open&per_page=${REPO_ISSUES_PER_PAGE}`;
  while (url && issues.length < limit) {
    const response = await fetch(url, { headers: githubHeaders(token) });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(
        data.message || `listRepoOpenIssues failed (${response.status})`,
      );
    }
    const rows = (await response.json()) as Array<{
      number?: number;
      title?: string;
      body?: string | null;
      html_url?: string | null;
      labels?: Array<{ name?: string } | string> | null;
      assignees?: Array<{ login?: string }> | null;
      milestone?: { due_on?: string | null } | null;
      created_at?: string | null;
      updated_at?: string | null;
      closed_at?: string | null;
      node_id?: string | null;
      state_reason?: string | null;
      locked?: boolean | null;
      active_lock_reason?: string | null;
      user?: { login?: string | null } | null;
      author_association?: string | null;
      closed_by?: { login?: string | null } | null;
      type?: Record<string, unknown> | null;
      pull_request?: unknown;
    }>;
    for (const row of rows) {
      if (row.pull_request || typeof row.number !== "number") continue;
      issues.push({
        number: row.number,
        title: row.title ?? "",
        body: row.body ?? null,
        htmlUrl: row.html_url ?? null,
        labels: (row.labels ?? [])
          .map((l) => (typeof l === "string" ? l : (l?.name ?? "")).trim())
          .filter(Boolean),
        assigneeLogins: (row.assignees ?? [])
          .map((a) => a?.login?.trim() ?? "")
          .filter(Boolean),
        dueDate: row.milestone?.due_on ?? null,
        createdAt: row.created_at ?? null,
        closedAt: row.closed_at ?? null,
        updatedAt: row.updated_at ?? null,
        githubMetadata: {
          nodeId: row.node_id ?? null,
          authorLogin: row.user?.login ?? null,
          authorAssociation: row.author_association ?? null,
          stateReason: row.state_reason ?? null,
          locked: row.locked === true,
          activeLockReason: row.active_lock_reason ?? null,
          milestone: row.milestone ?? null,
          createdAt: row.created_at ?? null,
          closedAt: row.closed_at ?? null,
          closedByLogin: row.closed_by?.login ?? null,
          issueType: row.type ?? null,
        },
      });
      if (issues.length >= limit) break;
    }
    url = parseNextLink(response.headers.get("link"));
  }
  return issues;
}

/**
 * Lists every comment of one issue, including comments created before the
 * repository link was enabled. Pull-request comments never reach this helper.
 */
export async function listGithubIssueComments(
  installationId: number | string,
  repoFullName: string,
  issueNumber: number,
  mint: InstallationTokenMinter = localInstallationTokenMinter,
): Promise<RemoteGithubIssueComment[]> {
  const { token } = await mint({ installationId });
  const comments: RemoteGithubIssueComment[] = [];
  let url: string | null =
    `${GITHUB_API_BASE}/repos/${repoFullName}/issues/${issueNumber}/comments?per_page=${REPO_ISSUES_PER_PAGE}`;
  while (url) {
    const response = await fetch(url, { headers: githubHeaders(token) });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(
        data.message || `listGithubIssueComments failed (${response.status})`,
      );
    }
    const rows = (await response.json()) as Array<{
      id?: number;
      body?: string | null;
      html_url?: string | null;
      user?: { login?: string } | null;
      author_association?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
    }>;
    for (const row of rows) {
      if (typeof row.id !== "number") continue;
      comments.push({
        id: String(row.id),
        body: row.body ?? "",
        authorLogin: row.user?.login ?? null,
        authorAssociation: row.author_association ?? null,
        htmlUrl: row.html_url ?? null,
        createdAt: row.created_at ?? null,
        updatedAt: row.updated_at ?? row.created_at ?? null,
      });
    }
    url = parseNextLink(response.headers.get("link"));
  }
  return comments;
}

/**
 * The level of permission `Issues` accepted by THIS installation.
 *
 * An App that gains a permission does NOT obtain it retroactively: each existing
 * installation must accept it. The level matters because the two
 * directions of the sync do not require the same one — `read` is enough to import the
 * from the repository, but closing an issue from minddy requests `write`.
 *
 * Returns `"none"` if the call fails: activating sync should then
 * guide the user, not crash.
 */
export async function getIssuesPermission(
  installationId: number | string,
): Promise<"none" | "read" | "write"> {
  try {
    requireCapability("github");
    const response = await fetch(
      `${GITHUB_API_BASE}/app/installations/${installationId}`,
      { headers: githubHeaders(mintAppJwt()) },
    );
    if (!response.ok) return "none";
    const data = (await response.json()) as {
      permissions?: Record<string, string> | null;
    };
    const issues = data.permissions?.issues;
    return issues === "write" ? "write" : issues === "read" ? "read" : "none";
  } catch {
    return "none";
  }
}

export interface InstallationAccount {
  login: string | null;
  type: string | null;
  repositorySelection: string | null;
}

/**
 * Installation account metadata (login, type, repository selection).
 * Returns null on failure so that the caller fails cleanly.
 */
export async function getInstallationAccount(
  installationId: number | string,
): Promise<InstallationAccount | null> {
  try {
    requireCapability("github");
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
