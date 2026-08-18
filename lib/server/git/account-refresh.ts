import "server-only";

import {
  findReusableConnection,
  listUserInstallations,
  updateConnectionAccount,
} from "./connections";
import { getInstallationAccount } from "./github-app";
import { getGithubUserAccount } from "./github-user-auth";
import { getGitlabAccessToken, getGitlabUser } from "./gitlab-app";
import { getGithubUserToken, updateIdentityAccount } from "./user-identities";

/**
 * Maintain NAME of forge accounts (MIN-154).
 *
 * Since the identity joins on `provider_account_id`, the login is no longer
 * a key — but it remains what the user reads in their settings, and il
 * was written once and for all at account login. After renaming
 * at GitHub or GitLab, minddy displayed a name that was no longer that of
 * anyone.
 *
 * We refresh it WHERE IT IS DISPLAYED — the two GET settings routes — and
 * nowhere else. Not on the hot path of PR routes: `resolveForgeActor`
 * already probes the repository capability, and this probe does not say who carries the
 * token; adding the refresh would cost one `GET /user` more for each
 * request. Also not on token refresh: a GitHub App token can be
 * non-expiring, and this path is then never executed.
 */

/**
 * In-process anti-burst, modeled on `capabilityCache` of `forge-actor.ts`:
 * opening its settings, changing tabs and coming back should not replay three
 * forge calls. Ten minutes is a long time limit for a name that moves once
 * per year, and short of the lifetime of a process.
 *
 * In memory, not in base: `updated_at` cannot be used as a marker (it moves
 * with each token rotation, and never for a permanent token), and this keeps does
 * does not deserve a column. The worst case of a new process is one more call.
 *
 * We keep the PASS, not just its date: the settings page brings up the two
 * requests together (`useGitIdentitiesQuery` + `useGitConnectionsQuery` in
 * `account-git-identity-section.tsx`), and a guard who could not say that
 * "someone takes care of it" would let the second read the lines of BEFORE
 * the writing - the expired name would appear on the very load which was supposed to correct it. Waiting for a pass that has already completed costs nothing: the promise is
 * resolved.
 */
const REFRESH_TTL_MS = 10 * 60_000;
const refreshByUser = new Map<string, { at: number; done: Promise<void> }>();

/** The personal GitHub account: the token is authoritative on id, login and avatar. */
async function refreshGithubIdentity(userId: string): Promise<void> {
  const credentials = await getGithubUserToken(userId);
  if (!credentials) return;
  const account = await getGithubUserAccount(credentials.token);
  await updateIdentityAccount(userId, "github", {
    // Rewritten as is: this catches a null `provider_account_id`.
    providerAccountId: String(account.id),
    accountLogin: account.login || null,
    accountAvatarUrl: account.avatarUrl,
  });
}

/** On the GitLab side, the OAuth connection IS the person's identity. */
async function refreshGitlabConnection(userId: string): Promise<void> {
  const connection = await findReusableConnection(userId, "gitlab");
  if (!connection) return;
  const token = await getGitlabAccessToken(connection.id);
  const user = await getGitlabUser(token);
  await updateConnectionAccount(connection.id, {
    providerAccountId: String(user.id),
    accountLogin: user.username || null,
  });
}

/**
 * App installations — the account ON which it is installed, not
 * that of the user: nothing to note, the App JWT is enough.
 *
 * `getInstallationAccount` returns null when the call fails (installation
 * revoked, App not configured): we don't touch anything rather than deleting the
 * name displayed.
 */
async function refreshGithubInstallations(userId: string): Promise<void> {
  const connections = await listUserInstallations(userId);
  for (const connection of connections) {
    const account = await getInstallationAccount(connection.installation_id);
    if (!account?.login) continue;
    await updateConnectionAccount(connection.id, {
      accountLogin: account.login,
      accountType: account.type,
      repositorySelection: account.repositorySelection,
    });
  }
}

/**
 * The three branches, in parallel. Each is caught separately: a mute forge
 * leaves yesterday's name on the screen, it does not take the other two — and
 * this promise therefore NEVER rejects, which is what its sharing below depends on.
 */
async function runRefresh(userId: string): Promise<void> {
  const branches: [string, Promise<void>][] = [
    ["github identity", refreshGithubIdentity(userId)],
    ["gitlab connection", refreshGitlabConnection(userId)],
    ["github installations", refreshGithubInstallations(userId)],
  ];
  await Promise.all(
    branches.map(([label, task]) =>
      task.catch((err: unknown) => {
        console.warn(
          `[account-refresh] ${label} refresh failed: ${(err as Error).message}`,
        );
      }),
    ),
  );
}

/**
 * Restores the names of all forge accounts of this user, best-effort
 * from start to finish: a silent forge leaves yesterday's name on the screen, it never
 * never causes the settings page to fail. So NEVER raise.
 *
 * Returns control when the lines are up to date — not before. This is what the caller
 * expects: it READS right after.
 */
export async function refreshForgeAccountNames(userId: string): Promise<void> {
  const now = Date.now();
  const pending = refreshByUser.get(userId);
  // A window pass is not replayed; if she still runs, we wait for her
  // instead of overtaking her — or reading over her shoulder.
  if (pending && now - pending.at < REFRESH_TTL_MS) {
    await pending.done;
    return;
  }
  // Asked BEFORE waiting: two competing loads only trigger one,
  // and the second expects THE SAME. A pass that fails keeps its place in the
  // window: we don't bludgeon a broken down forge every time we reload.
  const done = runRefresh(userId);
  refreshByUser.set(userId, { at: now, done });
  await done;
}
