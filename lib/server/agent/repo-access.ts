import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { forgeProviderForConnection } from "@/lib/server/git/forge-provider";
import { GITLAB_API_BASE, GITLAB_HOST, gitlabHeaders } from "@/lib/server/git/gitlab-rest";
import { decodeRepositoryName, repositoryNameToken,
  shouldProtectRepositoryNames } from
  "@/lib/server/git/repository-name-content";
import { decodeDefaultBranch } from "@/lib/server/git/default-branch-content";

/**
 * Resolve access to the repository linked to a project (MIN-46 + MIN-69).
 * The result carries both a credential-free remote and an authenticated URL.
 * The latter remains in trusted function/runner infrastructure for sandbox
 * execution; desktop-local execution may use it on the user's own machine.
 *
 * Read `project_git_links` with its bound connection rather than getProjectLink(),
 * which does not return the installation ID required to mint the token. Older
 * links may omit that denormalized ID even when the connection still has it.
 * Call again before a later network operation when the credential may have expired.
 *
 * Since MIN-327, GitHub tokens are scoped to the linked repository and their
 * permission level depends on the operation; see `RepoTokenAccess` below.
 */

export type RepoProvider = "github" | "gitlab";

/**
 * Forge authority profiles (MIN-327, MIN-421):
 *
 * - `full` remains in the function for forge API operations.
 * - `repo-write` grants GitHub `contents: write` for clone/fetch/push through
 *   trusted network infrastructure.
 * - `repo-read` grants GitHub `contents: read` for pull-request review clones.
 * - `github-cli` grants `contents: read` and `pull_requests: write` to the
 *   server-side CLI relay. The sandbox never receives this token.
 *
 * GitLab `repo-read` and `repo-write` profiles mint a short-lived project access
 * token. Only `full`, used by trusted server-side forge API operations, retains
 * the connection's account OAuth token.
 */
export type RepoTokenAccess = "full" | "repo-write" | "repo-read" | "github-cli";

/** GitHub permissions requested from mint, per profile. `full` doesn't narrow anything
 * (the token keeps those of the installation) — the restriction that matters to it
 * is the scope per deposit, posed in all cases. */
const GITHUB_PERMISSIONS_BY_ACCESS: Record<
  RepoTokenAccess,
  Record<string, "read" | "write"> | undefined
> = {
  full: undefined,
  "repo-write": { contents: "write" },
  "repo-read": { contents: "read" },
  "github-cli": { contents: "read", pull_requests: "write" },
};

const GITLAB_PROJECT_ACCESS_BY_PROFILE = {
  "repo-read": { scopes: ["read_repository"], accessLevel: 20 },
  "repo-write": { scopes: ["write_repository"], accessLevel: 30 },
} as const;

function gitlabTokenExpiry(now = new Date()): string {
  const expiry = new Date(now);
  expiry.setUTCDate(expiry.getUTCDate() + 1);
  return expiry.toISOString().slice(0, 10);
}

interface GitlabProjectTokenResponse {
  token?: unknown;
}

/**
 * Exchange an account credential inside trusted server code for a repository-
 * scoped GitLab token. The account token is never returned on failure.
 */
export async function mintGitlabProjectToken(input: {
  accountToken: string;
  projectId: string;
  access: "repo-read" | "repo-write";
  now?: Date;
  fetcher?: typeof fetch;
}): Promise<string> {
  if (!/^[1-9]\d*$/.test(input.projectId)) {
    throw new Error("GitLab link is missing a stable repository id");
  }
  const authority = GITLAB_PROJECT_ACCESS_BY_PROFILE[input.access];
  const response = await (input.fetcher ?? fetch)(
    `${GITLAB_API_BASE}/projects/${encodeURIComponent(input.projectId)}/access_tokens`,
    {
      method: "POST",
      headers: {
        ...gitlabHeaders(input.accountToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `minddy-agent-${input.access}`,
        description: "Short-lived repository credential for a Minddy agent sandbox",
        scopes: authority.scopes,
        access_level: authority.accessLevel,
        expires_at: gitlabTokenExpiry(input.now),
      }),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(`GitLab project token mint failed (${response.status})`);
  }
  const data = (await response.json()) as GitlabProjectTokenResponse;
  if (typeof data.token !== "string" || !data.token.trim()) {
    throw new Error("GitLab project token mint returned no token");
  }
  return data.token;
}

export interface RepoCloneTarget {
  provider: RepoProvider;
  /** `owner/name`. */
  repoFullName: string;
  /** Base branch (fallback "main" if the repository does not expose it). */
  defaultBranch: string;
  /** Credential-free HTTPS URL safe to persist inside an untrusted sandbox. */
  remoteUrl: string;
  /** Credential-bearing HTTPS URL for trusted function/desktop operations only. */
  authUrl: string;
  /** Raw token (for possible REST calls: PR, etc.). */
  token: string;
  linkId: string;
  connectionId: string;
  /** Stable forge repository identity; unlike owner/name, it survives renames. */
  externalRepoId: string;
}

interface LinkConnection {
  provider: string;
  source: string | null;
  installation_id: number | null;
}

interface GitLinkRow {
  id: string;
  provider: string;
  connection_id: string;
  installation_id: number | null;
  external_repo_id: string;
  repo_full_name: string | null;
  default_branch: string | null;
  project_id?: string;
  /** Embedded from git_connections; PostgREST types it as an array, the
   * runtime serves a to-one object. */
  git_connections?: LinkConnection | LinkConnection[] | null;
}

function linkConnection(row: GitLinkRow): LinkConnection | null {
  const embedded = row.git_connections;
  if (!embedded) return null;
  return Array.isArray(embedded) ? (embedded[0] ?? null) : embedded;
}

function githubInstallationId(row: GitLinkRow): number | null {
  const connection = linkConnection(row);
  // Recover only from the connection bound by this link's foreign key. Never
  // search another account or installation by repository name.
  const id = row.installation_id ?? (connection?.provider === "github"
    ? connection.installation_id : null);
  return id != null && Number.isSafeInteger(id) && id > 0 ? id : null;
}

const GIT_LINK_COLUMNS =
  "id, project_id, provider, connection_id, installation_id, external_repo_id, repo_full_name, default_branch, git_connections(source, provider, installation_id)";

/**
 * Clone target of the project, or null if no repository is linked or its GitHub
 * installation is unavailable. Other malformed links and unknown providers raise.
 */
export async function resolveRepoCloneTarget(
  projectId: string,
  access: RepoTokenAccess = "full",
): Promise<RepoCloneTarget | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("project_git_links")
    .select(GIT_LINK_COLUMNS)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!data) return null;
  return targetFromLink(data as GitLinkRow, access);
}

/**
 * Clone target of a DEPOSIT, for a given user (MIN-143).
 *
 * A pull request does not belong to a project: it belongs to a repository,
 * that several projects can link. You must therefore choose a link — and not
 * any: a link whose project is ACCESSIBLE TO THIS USER.
 * Without this filter, we would mint a token in the name of a project that it cannot
 * see: the member of a project would be enough to act on a repository linked elsewhere.
 *
 * Returns null when no accessible project has a usable link to this repository;
 * callers respond with the same 404 used for an inaccessible repository.
 */
export async function resolveRepoCloneTargetForRepo(opts: {
  userId: string;
  provider: RepoProvider;
  repoFullName: string;
}): Promise<RepoCloneTarget | null> {
  const link = await resolveProjectLinkForRepo(opts);
  return link ? targetFromLink(link.row) : null;
}

/** Project↔deposit link retained for a user, WITHOUT token mint. */
export interface ResolvedRepoLink {
  linkId: string;
  connectionId: string;
  externalRepoId: string;
  projectId: string;
  provider: RepoProvider;
  repoFullName: string;
  defaultBranch: string;
  /** Raw line, for `targetFromLink` — avoids a second query. */
  row: GitLinkRow;
}

/**
 * The project↔repository link by which THIS user reaches this repository, without
 * token minter (MIN-168): launching a review requires the PROJECT
 * bearer of the run - it is him that the RLS of runs questions - well before having
 * need to speak to the forge.
 *
 * Same choice rule as `resolveRepoCloneTargetForRepo`, which is now
 * the first half: the first link whose project is ACCESSIBLE. Without this
 * filter, a member of any project would act on a repository linked elsewhere.
 */
export async function resolveProjectLinkForRepo(opts: {
  userId: string;
  provider: RepoProvider;
  repoFullName: string;
}): Promise<ResolvedRepoLink | null> {
  const supabase = getServiceClient();
  const storedName = await shouldProtectRepositoryNames(supabase)
    ? await repositoryNameToken(opts.provider,opts.repoFullName)
    : opts.repoFullName;
  const { data } = await supabase
    .from("project_git_links")
    .select(`${GIT_LINK_COLUMNS}, project_id`)
    .eq("provider", opts.provider)
    .eq("repo_full_name", storedName);

  const rows = (data ?? []) as GitLinkRow[];
  for (const row of rows) {
    if (!row.project_id || !row.repo_full_name) continue;
    const access = await getProjectAccess(opts.userId, row.project_id);
    if (!access) continue;
    // An incomplete link must not hide a usable link in another accessible
    // project, or turn every PR read into an unhandled server exception.
    if (row.provider === "github" && githubInstallationId(row) == null) continue;
    return {
      linkId: row.id,
      connectionId: row.connection_id,
      externalRepoId: row.external_repo_id,
      projectId: row.project_id,
      provider: opts.provider,
      repoFullName: (await decodeRepositoryName(opts.provider,
        row.repo_full_name,opts.userId))!,
      defaultBranch: await decodeDefaultBranch(row.project_id!,row.default_branch) ?? "main",
      row,
    };
  }
  return null;
}

/**
 * Mint of the token + clone URL for an already resolved `project_git_links` line.
 *
 * **This is where the decision is made WHO acts on the forge** — and there are only two
 * possible carriers in minddy:
 *
 * - **The agent is minddy.** What Numo does (open the MR, push the
 * branch, post comments on your review, clean the branches)
 * must be named Minddy, never that of a human. This is the minted token
 * here. On GitHub, the installation token gives `minddy-app[bot]`: correct.
 * - **A human gesture bears the name of the human** (MIN-144): approve,
 * comment, react, merger go through `resolveForgeActor`
 * ([lib/server/git/forge-actor.ts](lib/server/git/forge-actor.ts)) and the token
 * of the git account of who clicks. Never by the token from here.
 *
 * GitLab `full` operations still act as the linked account because its REST API
 * calls need the connection OAuth token. Sandbox Git transport is different:
 * it receives a project access token whose bot identity and repository scope
 * are created by GitLab for this linked project.
 */
async function targetFromLink(
  row: GitLinkRow,
  access: RepoTokenAccess = "full",
): Promise<RepoCloneTarget | null> {
  const installationId = githubInstallationId(row);
  // Inert fixtures and disconnected installations carry no forge authority.
  // Treat them as unavailable instead of minting a token or throwing a 500.
  if (row.provider === "github" && installationId == null) return null;
  if (access === "github-cli" && row.provider !== "github") return null;
  if (!row.repo_full_name) {
    throw new Error("Project git link is missing repo_full_name");
  }
  const repoFullName = (await decodeRepositoryName(row.provider,
    row.repo_full_name))!;

  // Token source behind the ForgeProvider seam (docs/managed-forge-relay-plan.md):
  // the connection's `source` marker decides — "relay" connections mint their
  // GitHub tokens through the Cloud control plane, everything else stays local.
  const provider = forgeProviderForConnection(linkConnection(row)?.source ?? null);

  if (row.provider === "github") {
    const repositoryId = Number(row.external_repo_id);
    if (!Number.isSafeInteger(repositoryId) || repositoryId <= 0) {
      throw new Error("GitHub link is missing a stable repository id");
    }
    /**
     * Every token is repository-scoped (MIN-327), including the profile. The
     * provider id survives renames and cannot authorize a different repository
     * if an old owner/name is reused.
     */
    const { token } = await provider.getInstallationToken({
      installationId: installationId!,
      scope: {
        repositoryIds: [repositoryId],
        permissions: GITHUB_PERMISSIONS_BY_ACCESS[access],
      },
    });
    return {
      provider: "github",
      repoFullName,
      defaultBranch: await decodeDefaultBranch(row.project_id!,row.default_branch) ?? "main",
      remoteUrl: `https://github.com/${repoFullName}.git`,
      authUrl: `https://x-access-token:${token}@github.com/${repoFullName}.git`,
      token,
      linkId: row.id,
      connectionId: row.connection_id,
      externalRepoId: row.external_repo_id,
    };
  }

  if (row.provider === "gitlab") {
    if (access === "github-cli") return null;
    const accountToken = await provider.getGitlabAccessToken(row.connection_id);
    const token =
      access === "full"
        ? accountToken
        : await mintGitlabProjectToken({
            accountToken,
            projectId: row.external_repo_id,
            access,
          });
    // GitLab accepts any non-empty username for access-token Git over HTTPS;
    // `oauth2` keeps the credential URL stable across OAuth and project tokens.
    const host = new URL(GITLAB_HOST).host;
    return {
      provider: "gitlab",
      repoFullName,
      defaultBranch: await decodeDefaultBranch(row.project_id!,row.default_branch) ?? "main",
      remoteUrl: `${GITLAB_HOST.replace(/\/+$/, "")}/${repoFullName}.git`,
      authUrl: `https://oauth2:${encodeURIComponent(token)}@${host}/${repoFullName}.git`,
      token,
      linkId: row.id,
      connectionId: row.connection_id,
      externalRepoId: row.external_repo_id,
    };
  }

  throw new Error(`Unknown repo provider '${row.provider}'`);
}
