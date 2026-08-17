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
 * GET /api/git/github/user-callback — *User authorization callback URL* de la
 * GitHub App (MIN-144).
 *
 * À ne pas confondre avec `/api/git/github/setup`, qui est la Setup URL de
 * l'INSTALLATION : ici l'utilisateur n'installe rien, il autorise minddy à
 * parler EN SON NOM. GitHub redirige avec `code` + notre `state` signé, qui dit
 * d'où l'on est parti. Sous quel compte minddy ranger le jeton, en revanche,
 * c'est la SESSION qui le dit (MIN-324 — cf. callback-session.ts).
 */

/**
 * Retours connus, indexés par `state.origin`. On ne suit JAMAIS l'`origin` brut
 * : c'est une chaîne libre du payload, et la coller dans une URL de redirection
 * en ferait une redirection ouverte.
 */
const RETURN_TO: Record<string, string> = {
  settings: "/settings?tab=git",
  pr: "/pull-requests",
};
const DEFAULT_RETURN = "/settings?tab=git";

/** Ajoute `git=<outcome>` au retour choisi, quel que soit son état de requête. */
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

  // Sans state valide on ne sait pas où revenir : retour aux paramètres du compte.
  if (!state || state.provider !== "github") {
    return applyCookies(redirectTo(DEFAULT_RETURN, origin, "error"));
  }

  const base = (state.origin && RETURN_TO[state.origin]) || DEFAULT_RETURN;

  // AVANT l'échange du `code` : un `state` qu'on nous a envoyé désigne l'attaquant,
  // et brûler le code d'autorisation de la victime ne servirait à personne.
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
      // Égal à `sessionUserId` par la garde ci-dessus, et typé `string`.
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
