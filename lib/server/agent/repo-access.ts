import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { forgeProviderForConnection } from "@/lib/server/git/forge-provider";
import { GITLAB_HOST } from "@/lib/server/git/gitlab-rest";

/**
 * Solves how to clone the repository linked to a project in the Agent Sandbox
 * (MIN-46 + MIN-69). We mint an EPHEMERAL token — GitHub installation token
 * (getInstallationToken, MIN-47) ou access token OAuth GitLab (refresh paresseux
 * via getGitlabAccessToken) — and we build an HTTPS clone URL
 * token-authenticated — never persisted outside the microVM.
 *
 * We read directly `project_git_links` (which denormalizes `installation_id`)
 * rather than getProjectLink(), because the latter does not return the installation_id
 * necessary for the mint of the token. To be called again to obtain a fresh token before
 * each network operation (clone/push) of a long run.
 *
 * SINCE MIN-327, the token is no longer “that of the installation”: it is scoped
 * AT THE DEPOSIT of the bond, and its power depends on who will hold it — see
 * `RepoTokenAccess` below. It's the same appeal, with one more argument,
 * because the question “what can this token do?” » must not land far from
 * the place that makes it.
 */

export type RepoProvider = "github" | "gitlab";

/**
 * WHAT THE TOKEN HAS THE RIGHT TO DO (MIN-327), and who will hold it.
 *
 * Three profiles, and the line that counts passes between the first and the two
 * others: `full` remains in the FUNCTION, `repo-write` and `repo-read` go down
 * in the MICROVM, where `git clone` writes them in `.git/config` and where the model
 * lance du shell.
 *
 * - `full` — the maximum token of the installation ON THE LINKED REPOSITORY. Open a PR,
 * comment, reread, merge, close an issue: everything that speaks to the API of
 * the forge from our roads. It never leaves the process.
 * - `repo-write` — `contents: write`, nothing else. That's all `git`
 * needs (clone, fetch, ls-remote, push) and that's all the microVM
 * of a ticket or notebook run receives: the token it carries can no longer
 * merge a PR, neither approve, nor comment — these gestures go through the
 * control plane, which replays them on the function side under the run anchor.
 * - `repo-read` — `contents: read`. REREADING, the only anchor whose
 * content comes from an unknown fork. She doesn't write anything in the repository
 * (`writesToRepo` in execute.ts): giving it something to grow was a
 * contradiction, and an injection from the fork was enough to harvest it.
 *
 * **GitLab does not know this distinction, and this is assumed.** The token is
 * the OAuth access token of the connection, with scope `api` on the entire account
 * (see `GITLAB_OAUTH_SCOPES`): GitLab does not offer any down-scoping of a token
 * OAuth at the time of use, and project access tokens — the only mechanism
 * reduced scope — are PERSISTENT tokens to create, track and revoke,
 * for a minimum duration of one day. The profile is therefore WITHOUT EFFECT on the GitLab side,
 * and a GitLab replay runs with a token that can write. It says here,
 * in SECURITY.md and binding UI — such as no bot identity
 * (MIN-146), this is a constraint of the platform, not an oversight.
 */
export type RepoTokenAccess = "full" | "repo-write" | "repo-read";

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
};

export interface RepoCloneTarget {
  provider: RepoProvider;
  /** `owner/name`. */
  repoFullName: string;
  /** Base branch (fallback "main" if the repository does not expose it). */
  defaultBranch: string;
  /** Clone/push HTTPS URL with embedded ephemeral token (never stored). */
  authUrl: string;
  /** Raw token (for possible REST calls: PR, etc.). */
  token: string;
  linkId: string;
  connectionId: string;
}

interface GitLinkRow {
  id: string;
  provider: string;
  connection_id: string;
  installation_id: number | null;
  repo_full_name: string | null;
  default_branch: string | null;
  project_id?: string;
  /** Embedded from git_connections; PostgREST types it as an array, the
   * runtime serves a to-one object. */
  git_connections?: { source: string } | { source: string }[] | null;
}

function linkConnectionSource(row: GitLinkRow): string | null {
  const embedded = row.git_connections;
  if (!embedded) return null;
  return Array.isArray(embedded) ? (embedded[0]?.source ?? null) : embedded.source;
}

const GIT_LINK_COLUMNS =
  "id, provider, connection_id, installation_id, repo_full_name, default_branch, git_connections(source)";

/**
 * Clone target of the project, or null if it has no repository linked to it. Raise if the link
 * is incomplete (installation_id GitHub missing) or if the provider is unknown.
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
 * Returns null when no accessible project links this repository — calling it
 * fait un 404, comme partout ailleurs.
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
  const { data } = await supabase
    .from("project_git_links")
    .select(`${GIT_LINK_COLUMNS}, project_id`)
    .eq("provider", opts.provider)
    .eq("repo_full_name", opts.repoFullName);

  const rows = (data ?? []) as GitLinkRow[];
  for (const row of rows) {
    if (!row.project_id || !row.repo_full_name) continue;
    const access = await getProjectAccess(opts.userId, row.project_id);
    if (!access) continue;
    return {
      linkId: row.id,
      connectionId: row.connection_id,
      projectId: row.project_id,
      provider: opts.provider,
      repoFullName: row.repo_full_name,
      defaultBranch: row.default_branch ?? "main",
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
 * **The known transgression (MIN-146).** GitLab has no bot identity: the
 * token below is the OAuth access token of the connection carried by the LINK,
 * that is, from the account of the person who linked the deposit. On the forge, it is
 * so she who opens Numo's MR and posts her comments - a gesture
 * automated under a human name, the exact mirror of the bug fixed by MIN-144.
 * The COMMITS are correct (`resolveCommitterIdentity` in execute.ts
 * configure `minddy agent <agent@minddy.app>`): this is the author at the level of
 * the API which is wrong. While waiting for a GitLab service identity, binding
 * says it in the UI (`gitAgentActsAs`) rather than keeping it quiet.
 */
async function targetFromLink(
  row: GitLinkRow,
  access: RepoTokenAccess = "full",
): Promise<RepoCloneTarget> {
  if (!row.repo_full_name) {
    throw new Error("Project git link is missing repo_full_name");
  }

  // Token source behind the ForgeProvider seam (docs/managed-forge-relay-plan.md):
  // the connection's `source` marker decides — "relay" connections mint their
  // GitHub tokens through the Cloud control plane, everything else stays local.
  const provider = forgeProviderForConnection(linkConnectionSource(row));

  if (row.provider === "github") {
    if (row.installation_id == null) {
      throw new Error("GitHub link is missing its installation id");
    }
    /**
     * THE SCOPE BY DEPOSIT IS ASKED IN ALL CASES (MIN-327), profile included.
     *
     * The SHORT name, not `owner/name`: that's what `repositories` expects, and a
     * slash y is 422. We get it from the link itself — the project linked a repository,
     * there is nothing to guess.
     */
    const repoName = row.repo_full_name.split("/").pop() ?? row.repo_full_name;
    const { token } = await provider.getInstallationToken({
      installationId: row.installation_id,
      scope: {
        repositories: [repoName],
        permissions: GITHUB_PERMISSIONS_BY_ACCESS[access],
      },
    });
    return {
      provider: "github",
      repoFullName: row.repo_full_name,
      defaultBranch: row.default_branch ?? "main",
      authUrl: `https://x-access-token:${token}@github.com/${row.repo_full_name}.git`,
      token,
      linkId: row.id,
      connectionId: row.connection_id,
    };
  }

  if (row.provider === "gitlab") {
    const token = await provider.getGitlabAccessToken(row.connection_id);
    // Clone OAuth : user `oauth2`, mot de passe = l'access token (doc GitLab).
    const host = new URL(GITLAB_HOST).host;
    return {
      provider: "gitlab",
      repoFullName: row.repo_full_name,
      defaultBranch: row.default_branch ?? "main",
      authUrl: `https://oauth2:${token}@${host}/${row.repo_full_name}.git`,
      token,
      linkId: row.id,
      connectionId: row.connection_id,
    };
  }

  throw new Error(`Unknown repo provider '${row.provider}'`);
}
