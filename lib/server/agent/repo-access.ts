import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { forgeProviderForConnection } from "@/lib/server/git/forge-provider";
import { mintLinkedRepositoryToken } from "@/lib/server/git/linked-repository-token";
import type { RepoProviderId } from "@/lib/repo-providers";
import { decodeRepositoryName, repositoryNameToken,
  shouldProtectRepositoryNames } from
  "@/lib/server/git/repository-name-content";
import { decodeDefaultBranch } from "@/lib/server/git/default-branch-content";

/**
 * Forge credential of the repository linked to a project (MIN-46, MIN-69):
 * the token server code uses for forge API calls in minddy's name.
 *
 * Read `project_git_links` with its bound connection rather than getProjectLink(),
 * which does not return the installation ID required to mint the token. Older
 * links may omit that denormalized ID even when the connection still has it.
 * Call again before a later network operation when the credential may have expired.
 */

export interface RepoCloneTarget {
  provider: RepoProviderId;
  /** `owner/name`. */
  repoFullName: string;
  /** Base branch (fallback "main" if the repository does not expose it). */
  defaultBranch: string;
  /** Forge API token: a repository-scoped installation token on GitHub, the
      linking account's OAuth token on GitLab. */
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
 * Forge target of the project, or null if no repository is linked or its GitHub
 * installation is unavailable. Other malformed links and unknown providers raise.
 */
export async function resolveRepoCloneTarget(
  projectId: string,
): Promise<RepoCloneTarget | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("project_git_links")
    .select(GIT_LINK_COLUMNS)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!data) return null;
  return targetFromLink(data as GitLinkRow);
}

/**
 * Forge target of a REPOSITORY, for a given user (MIN-143).
 *
 * A pull request belongs to a repository, which several projects can link, so
 * the link must be one whose project this user can access. Without this
 * filter, a member of any project could act on a repository linked elsewhere.
 *
 * Returns null when no accessible project has a usable link to this repository;
 * callers respond with the same 404 used for an inaccessible repository.
 */
export async function resolveRepoCloneTargetForRepo(opts: {
  userId: string;
  provider: RepoProviderId;
  repoFullName: string;
}): Promise<RepoCloneTarget | null> {
  const target = await resolveRepoCloneTargetWithAccess(opts);
  return target ? target.target : null;
}

/**
 * The same choice, plus whether this user may WRITE through it (MIN-693): a
 * link in a project where they are owner or member is preferred, so a reader
 * in one project and member in another acts through the second. Read-only
 * access still resolves (reads stay open), with `canWrite: false`.
 */
export async function resolveRepoCloneTargetWithAccess(opts: {
  userId: string;
  provider: RepoProviderId;
  repoFullName: string;
}): Promise<{ target: RepoCloneTarget; canWrite: boolean } | null> {
  const link = await resolveProjectLinkForRepo(opts);
  if (!link) return null;
  const target = await targetFromLink(link.row);
  return target ? { target, canWrite: link.canWrite } : null;
}

/**
 * The project↔repository link by which this user reaches this repository: a
 * link whose project they can access, a writable one first.
 */
async function resolveProjectLinkForRepo(opts: {
  userId: string;
  provider: RepoProviderId;
  repoFullName: string;
}): Promise<{ row: GitLinkRow; canWrite: boolean } | null> {
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
  // A writable link wins; the first read-only one is the fallback (MIN-693).
  let readOnly: GitLinkRow | null = null;
  for (const row of rows) {
    if (!row.project_id || !row.repo_full_name) continue;
    const access = await getProjectAccess(opts.userId, row.project_id);
    if (!access) continue;
    // An incomplete link must not hide a usable link in another accessible
    // project, or turn every PR read into an unhandled server exception.
    if (row.provider === "github" && githubInstallationId(row) == null) continue;
    if (!access.canWrite) {
      readOnly ??= row;
      continue;
    }
    return { row, canWrite: true };
  }
  return readOnly ? { row: readOnly, canWrite: false } : null;
}

/**
 * The minddy token for an already resolved `project_git_links` row.
 *
 * This token always acts in minddy's name: on GitHub the installation token
 * writes as `minddy-app[bot]`. A human gesture (approve, comment, react,
 * merge) goes through `resolveForgeActor` (`lib/server/git/forge-actor.ts`)
 * and the clicking person's own git account instead (MIN-144). GitLab API
 * calls still act as the linked account, the only identity GitLab offers
 * (MIN-146).
 */
async function targetFromLink(row: GitLinkRow): Promise<RepoCloneTarget | null> {
  const installationId = githubInstallationId(row);
  // Inert fixtures and disconnected installations carry no forge authority.
  // Treat them as unavailable instead of minting a token or throwing a 500.
  if (row.provider === "github" && installationId == null) return null;
  if (!row.repo_full_name) {
    throw new Error("Project git link is missing repo_full_name");
  }
  if (row.provider !== "github" && row.provider !== "gitlab") {
    throw new Error(`Unknown repo provider '${row.provider}'`);
  }
  const repoFullName = (await decodeRepositoryName(row.provider,
    row.repo_full_name))!;
  const connectionSource = linkConnection(row)?.source ?? null;
  const token = row.provider === "github"
    ? (await mintLinkedRepositoryToken({
        installationId: installationId!,
        externalRepoId: row.external_repo_id,
        connectionSource,
      })).token
    : await forgeProviderForConnection(connectionSource).getGitlabAccessToken(row.connection_id);
  return {
    provider: row.provider,
    repoFullName,
    defaultBranch: await decodeDefaultBranch(row.project_id!, row.default_branch) ?? "main",
    token,
    linkId: row.id,
    connectionId: row.connection_id,
    externalRepoId: row.external_repo_id,
  };
}
