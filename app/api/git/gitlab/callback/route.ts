import { type NextRequest, NextResponse } from "next/server";
import { verifyGitLinkState, ACCOUNT_CONNECT_PROJECT } from "@/lib/server/git/link-state";
import {
  readForgeCallbackSession,
  sessionMatchesState,
} from "@/lib/server/git/callback-session";
import {
  exchangeGitlabCode,
  getGitlabUser,
} from "@/lib/server/git/gitlab-app";
import { upsertGitlabConnection } from "@/lib/server/git/connections";
import { canonicalAppOrigin } from "@/lib/server/app-origin";

/**
 * GET /api/git/gitlab/callback — callback OAuth GitLab (MIN-47).
 *
 * GitLab redirects here with `code` + our signed `state`. We exchange the code
 * against a set of tokens (access+refresh), we identify the account, we save
 * the connection (encrypted tokens) at the account level, then we return the user
 * Go to the project settings to choose a repository.
 *
 * Like on the GitHub side, the `state` tells where to return and the SESSION says who returns
 * (MIN-324 — cf. callback-session.ts): without it, a `state` sent by link
 * would deposit the victim's GitLab token into the attacker's account.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = canonicalAppOrigin();
  const { userId: sessionUserId, applyCookies } =
    await readForgeCallbackSession(request);
  const state = verifyGitLinkState(searchParams.get("state"));
  const code = searchParams.get("code");

  if (!state) {
    return applyCookies(
      NextResponse.redirect(new URL("/settings?tab=git&git=error", origin)),
    );
  }

  const isAccount = state.projectId === ACCOUNT_CONNECT_PROJECT;
  // An authorization initiated from the creation wizard (MIN-62) returns to
  // /home: at this stage the project does not yet exist, it is the draft in
  // session which reopens the wizard where it left off. From the panel of a PR
  // (MIN-144), return to the Pull requests page. Otherwise, project git settings
  // (or the account).
  const isWizard = isAccount && state.origin === "wizard";
  const base = isWizard
    ? "/home?setup=git"
    : isAccount && state.origin === "pr"
      ? "/pull-requests?connected=git"
      : isAccount
        ? "/settings?tab=git"
        : `/projects/${state.projectId}/settings?tab=git`;

  // Before exchanging the `code`: no need to burn the victim's.
  if (!sessionMatchesState(sessionUserId, state.userId)) {
    return applyCookies(
      NextResponse.redirect(new URL(`${base}&git=error`, origin)),
    );
  }

  if (!code) {
    return applyCookies(
      NextResponse.redirect(new URL(`${base}&git=error`, origin)),
    );
  }

  try {
    const tokens = await exchangeGitlabCode({
      code,
      redirectUri: `${origin}/api/git/gitlab/callback`,
    });
    const user = await getGitlabUser(tokens.accessToken);
    const connectionId = await upsertGitlabConnection({
      // Equal to `sessionUserId` by the guard above, and typed `string`.
      userId: state.userId,
      providerAccountId: String(user.id),
      accountLogin: user.username || null,
      tokens,
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
    console.error("[git/gitlab/callback] failed:", err);
    return applyCookies(
      NextResponse.redirect(new URL(`${base}&git=error`, origin)),
    );
  }
}
