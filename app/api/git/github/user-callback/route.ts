import { type NextRequest, NextResponse } from "next/server";
import { verifyGitLinkState } from "@/lib/server/git/link-state";
import {
  readForgeCallbackSession,
  sessionMatchesState,
} from "@/lib/server/git/callback-session";
import {
  exchangeGithubUserCode,
  getGithubUserAccount,
} from "@/lib/server/git/github-user-auth";
import { upsertUserIdentity } from "@/lib/server/git/user-identities";
import { canonicalAppOrigin } from "@/lib/server/app-origin";

/**
 * GET /api/git/github/user-callback — *User authorization callback URL* of the
 * GitHub App (MIN-144).
 *
 * Not to be confused with `/api/git/github/setup`, which is the Setup URL of
 * INSTALLATION: here the user does not install anything, he authorizes minddy to
 * speak IN HIS NAME. GitHub redirects with `code` + our signed `state`, which says
 * where we started from. Under which Minddy account to store the token, on the other hand,
 * it is the SESSION which says it (MIN-324 — cf. callback-session.ts).
 */

/**
 * Known returns, indexed by `state.origin`. We NEVER follow the raw `origin`
 * : it's a free string from the payload, and paste it in a redirect URL
 * would make it an open redirect.
 */
const RETURN_TO: Record<string, string> = {
  settings: "/settings?tab=git",
  pr: "/pull-requests",
};
const DEFAULT_RETURN = "/settings?tab=git";

/** Appends `git=<outcome>` to the chosen return, regardless of its query state. */
function redirectTo(base: string, origin: string, outcome: "connected" | "error") {
  const url = new URL(base, origin);
  url.searchParams.set("git", outcome);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = canonicalAppOrigin();
  const { userId: sessionUserId, applyCookies } =
    await readForgeCallbackSession(request);
  const state = verifyGitLinkState(searchParams.get("state"));
  const code = searchParams.get("code");

  // Without a valid state we don't know where to return: return to account settings.
  if (!state || state.provider !== "github") {
    return applyCookies(redirectTo(DEFAULT_RETURN, origin, "error"));
  }

  const base = (state.origin && RETURN_TO[state.origin]) || DEFAULT_RETURN;

  // BEFORE the exchange of the `code`: a `state` that we were sent designates the attacker,
  // and burning the victim's authorization code wouldn't help anyone.
  if (!sessionMatchesState(sessionUserId, state.userId)) {
    return applyCookies(redirectTo(base, origin, "error"));
  }
  if (!code) return applyCookies(redirectTo(base, origin, "error"));

  try {
    const tokens = await exchangeGithubUserCode({
      code,
      redirectUri: `${origin}/api/git/github/user-callback`,
    });
    const account = await getGithubUserAccount(tokens.accessToken);
    await upsertUserIdentity({
      // Equal to `sessionUserId` by the guard above, and typed `string`.
      userId: state.userId,
      provider: "github",
      providerAccountId: String(account.id),
      accountLogin: account.login || null,
      accountAvatarUrl: account.avatarUrl,
      tokens,
    });
    return applyCookies(redirectTo(base, origin, "connected"));
  } catch (err) {
    console.error("[git/github/user-callback] failed:", err);
    return applyCookies(redirectTo(base, origin, "error"));
  }
}
