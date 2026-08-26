import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type { RepoProviderId } from "@/lib/repo-providers";
import type { GitConnection } from "@/lib/types";
import { encryptForgeToken } from "./token-crypto";
import type { GitlabTokenSet } from "./gitlab-app";

/**
 * Access to account-level git connections (git_connections) — MIN-47. Service
 * client (RLS bypassed), user verification is done here in TS (pattern
 * api_keys). Token columns are NEVER returned: public
 * functions select explicit columns, without secrets.
 */

/** Non-secret columns exposed to the UI. */
const PUBLIC_COLS =
  "id, provider, account_login, account_type, installation_id, created_at, updated_at";

interface PublicRow {
  id: string;
  provider: string;
  account_login: string | null;
  account_type: string | null;
  installation_id: number | null;
  created_at: string;
  updated_at: string;
}

function toPublic(
  row: PublicRow,
  projects: GitConnection["projects"],
): GitConnection {
  return {
    id: row.id,
    provider: row.provider as RepoProviderId,
    account_login: row.account_login,
    account_type: row.account_type,
    installation_id: row.installation_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    projects,
  };
}

/**
 * Lists the user's git connections (sanitized), with projects that
 * reuse them. Returns [] if none, null on error DB.
 */
export async function listUserConnections(
  userId: string,
): Promise<GitConnection[] | null> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("git_connections")
    .select(PUBLIC_COLS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) return null;
  const rows = (data ?? []) as PublicRow[];
  if (rows.length === 0) return [];

  // Projects linked by connection (for disconnection warning).
  const { data: links, error: linksError } = await supabase
    .from("project_git_links")
    .select("connection_id, projects(id, name)")
    .in(
      "connection_id",
      rows.map((r) => r.id),
    );
  if (linksError) {
    console.error("[git-connections] linked-project lookup failed:", linksError.message);
    return null;
  }
  const byConnection = new Map<string, GitConnection["projects"]>();
  // Supabase infers the embedded to-one relation like a table; at execution
  // it's an object (FK many-to-one). We cast via unknown to reflect the runtime.
  for (const link of (links ?? []) as unknown as Array<{
    connection_id: string;
    projects: { id: string; name: string } | null;
  }>) {
    if (!link.projects) continue;
    const list = byConnection.get(link.connection_id) ?? [];
    list.push({ id: link.projects.id, name: link.projects.name });
    byConnection.set(link.connection_id, list);
  }

  return rows.map((r) => toPublic(r, byConnection.get(r.id) ?? []));
}

/**
 * Finds a reusable user connection for a provider (the most recent
 *). Used for the “reuse” flow: do not redo the install/authorize if a
 * connection already exists. Returns null if none.
 */
export async function findReusableConnection(
  userId: string,
  provider: RepoProviderId,
): Promise<{ id: string; account_login: string | null } | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("git_connections")
    .select("id, account_login")
    .eq("user_id", userId)
    .eq("provider", provider)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string; account_login: string | null } | null) ?? null;
}

/**
 * The user's GitHub installations (connections carrying a
 * `installation_id`). Used to refresh the displayed name (MIN-154): the
 * account of an installation is renamed like another, and the App knows how to say it
 * without a user token.
 */
export async function listUserInstallations(
  userId: string,
): Promise<{ id: string; installation_id: number }[]> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("git_connections")
    .select("id, installation_id")
    .eq("user_id", userId)
    .eq("provider", "github")
    .not("installation_id", "is", null);
  return (data ?? []) as { id: string; installation_id: number }[];
}

/**
 * Reset the displayed count of a connection to what the forge says
 * today (MIN-154): `account_login` is a DISPLAY name, written at the
 * connection and never refreshed afterwards.
 *
 * Only the fields provided move, and only if they differ: the
 * settings page often reloads, and a `updated_at` that advances for no reason is
 * the marker of nothing.
 */
export async function updateConnectionAccount(
  connectionId: string,
  account: {
    providerAccountId?: string | null;
    accountLogin?: string | null;
    accountType?: string | null;
    repositorySelection?: string | null;
  },
): Promise<void> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("git_connections")
    .select("provider_account_id, account_login, account_type, repository_selection")
    .eq("id", connectionId)
    .maybeSingle();
  const row = data as Record<string, string | null> | null;
  if (!row) return;

  const patch: Record<string, string | null> = {};
  const put = (column: string, value: string | null | undefined) => {
    if (value !== undefined && row[column] !== value) patch[column] = value;
  };
  put("provider_account_id", account.providerAccountId);
  put("account_login", account.accountLogin);
  put("account_type", account.accountType);
  put("repository_selection", account.repositorySelection);
  if (Object.keys(patch).length === 0) return;

  await supabase
    .from("git_connections")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", connectionId);
}

/**
 * Loads a connection belonging to the user (public columns), or null.
 * Used to validate that a connection referenced in a bind really belongs to
 * the project owner.
 */
export async function getUserConnection(
  userId: string,
  connectionId: string,
): Promise<
  {
    id: string;
    provider: RepoProviderId;
    installation_id: number | null;
    /** "relay" when the connection was established through the managed forge relay. */
    source: string | null;
  } | null
> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("git_connections")
    .select("id, provider, installation_id, source")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    provider: data.provider as RepoProviderId,
    installation_id: data.installation_id,
    source: data.source ?? null,
  };
}

/**
 * The targeted installation is already connected to ANOTHER minddy account (MIN-324).
 *
 * The message does not name anyone: the caller does not have to learn who owns
 * an installation that he does not own. The setup route translates it to `git=error`.
 */
export class GithubInstallationOwnedByAnotherUserError extends Error {
  constructor() {
    super("GitHub installation is already linked to another account");
    this.name = "GithubInstallationOwnedByAnotherUserError";
  }
}

/**
 * Upsert a GitHub App connection (callback setup). installation_id is unique
 * globally: we update the existing line or we insert. Returns the id.
 *
 * **An existing row never changes hands** (MIN-324). The conflict key
 * is the only `installation_id`, and the `update` rewrote `user_id`: called
 * with an `installation_id` listed, the function reassigned the installation
 * from another tenant to the appellant — therefore his private deposits. A different owner
 * now raises, and to resume an installation it is first necessary for its holder to disconnect it (the line disappears, the insert becomes
 * again possible).
 */
export async function upsertGithubConnection(params: {
  userId: string;
  installationId: number;
  accountLogin: string | null;
  accountType: string | null;
  repositorySelection: string | null;
  /** "relay" when the installation was claimed through the managed forge relay. */
  source?: "local" | "relay";
}): Promise<string> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("upsert_github_connection_atomic", {
    p_user_id: params.userId,
    p_installation_id: params.installationId,
    p_account_login: params.accountLogin,
    p_account_type: params.accountType,
    p_repository_selection: params.repositorySelection,
    p_source: params.source ?? "local",
  });
  if (error) throw new Error(error.message || "Failed to store GitHub connection");
  const result = data as { state?: unknown; id?: unknown } | null;
  if (result?.state === "owned_by_another") {
    throw new GithubInstallationOwnedByAnotherUserError();
  }
  if (result?.state !== "stored" || typeof result.id !== "string") {
    throw new Error("Invalid atomic GitHub connection response");
  }
  return result.id;
}

/**
 * Upsert of a GitLab OAuth connection (callback). De-duplicate by
 * (user_id, provider, provider_account_id): reconnection of the same account → update
 * tokens. Returns id.
 *
 * Conflict key has `user_id`, so no reassignment theft here
 * (MIN-324): Two users linking the same GitLab account get two separate
 * rows, each with their own tokens. Same for
 * `upsertUserIdentity`, unique on `(user_id, provider)`.
 */
export async function upsertGitlabConnection(params: {
  userId: string;
  providerAccountId: string;
  accountLogin: string | null;
  tokens: GitlabTokenSet;
  /** "relay" when the OAuth dance was brokered by the managed forge relay —
   * the token pair belongs to the managed app's client, so its refresh grant
   * must run Cloud-side (see `getGitlabAccessToken`). */
  source?: "local" | "relay";
}): Promise<string> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("upsert_gitlab_connection_atomic", {
    p_user_id: params.userId,
    p_provider_account_id: params.providerAccountId,
    p_account_login: params.accountLogin,
    p_source: params.source ?? "local",
    p_access_token_encrypted: encryptForgeToken(params.tokens.accessToken),
    p_refresh_token_encrypted: encryptForgeToken(params.tokens.refreshToken),
    p_token_expires_at: params.tokens.expiresAt,
    p_oauth_scopes: params.tokens.scope,
  });
  if (error || typeof data !== "string") {
    throw new Error(error?.message || "Failed to store GitLab connection");
  }
  return data;
}

/**
 * Deletes a user login (account level logout). The
 * project_git_links pointing to it cascade (ON DELETE CASCADE).
 * Returns false if the connection does not exist / does not belong to the user.
 */
export async function deleteConnection(
  userId: string,
  connectionId: string,
): Promise<boolean> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("git_connections")
    .delete()
    .eq("id", connectionId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  return !!data;
}
