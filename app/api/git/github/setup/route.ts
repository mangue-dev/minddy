import { type NextRequest, NextResponse } from "next/server";
import { verifyGitLinkState, ACCOUNT_CONNECT_PROJECT } from "@/lib/server/git/link-state";
import {
  readForgeCallbackSession,
  sessionMatchesState,
} from "@/lib/server/git/callback-session";
import { getInstallationAccount } from "@/lib/server/git/github-app";
import { upsertGithubConnection } from "@/lib/server/git/connections";
import { canonicalAppOrigin } from "@/lib/server/app-origin";

/**
 * GET /api/git/github/setup — Setup URL de l'app GitHub (MIN-47).
 *
 * After the user installs the minddy app on an account/repository, GitHub
 * redirects here with `installation_id`, `setup_action` and our signed `state`. THE
 * `state` says which project to return to; it is the SESSION which says under what
 * compte enregistrer l'installation (MIN-324 — cf. callback-session.ts). On
 * checks both, we save the connection at account level, then we return
 * the user to the project settings to choose a repository.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = canonicalAppOrigin();
  const { userId: sessionUserId, applyCookies } =
    await readForgeCallbackSession(request);
  const state = verifyGitLinkState(searchParams.get("state"));
  const installationIdRaw = searchParams.get("installation_id");

  // Without a valid state we don't know where to return: return to account settings.
  if (!state) {
    return applyCookies(
      NextResponse.redirect(new URL("/settings?tab=git&git=error", origin)),
    );
  }

  const isAccount = state.projectId === ACCOUNT_CONNECT_PROJECT;
  // An install initiated from the creation wizard (MIN-62) returns to
  // /home: at this stage the project does not yet exist, it is the draft in
  // session which reopens the wizard where it left off. Otherwise, return to
  // git settings of the project (or account).
  const isWizard = isAccount && state.origin === "wizard";
  const base = isWizard
    ? "/home?setup=git"
    : isAccount
      ? "/settings?tab=git"
      : `/projects/${state.projectId}/settings?tab=git`;

  // A valid `state` is not an identity: its bearer may have minted it
  // from another account. Without a corresponding session, nothing is written.
  if (!sessionMatchesState(sessionUserId, state.userId)) {
    return applyCookies(
      NextResponse.redirect(new URL(`${base}&git=error`, origin)),
    );
  }

  const installationId = installationIdRaw ? Number(installationIdRaw) : NaN;
  if (!Number.isFinite(installationId) || installationId <= 0) {
    // setup_action === 'request' (org approval pending) or install canceled.
    return applyCookies(
      NextResponse.redirect(new URL(`${base}&git=error`, origin)),
    );
  }

  try {
    const account = await getInstallationAccount(installationId);
    const connectionId = await upsertGithubConnection({
      // `state.userId` rather than `sessionUserId`: the guard above has them
      // made equal, and this is typed `string`.
      userId: state.userId,
      installationId,
      accountLogin: account?.login ?? null,
      accountType: account?.type ?? null,
      repositorySelection: account?.repositorySelection ?? null,
    });
    // The wizard needs the login id to open the repository selector
    // on the return; the account settings don't do anything about it.
    const suffix =
      isAccount && !isWizard
        ? "&git=connected"
        : `&git=connected&connection=${encodeURIComponent(connectionId)}`;
    return applyCookies(
      NextResponse.redirect(new URL(`${base}${suffix}`, origin)),
    );
  } catch (err) {
    // Including `GithubInstallationOwnedByAnotherUserError`: the screen says
    // “error”, and nothing more — especially not who owns the installation.
    console.error("[git/github/setup] failed:", err);
    return applyCookies(
      NextResponse.redirect(new URL(`${base}&git=error`, origin)),
    );
  }
}
