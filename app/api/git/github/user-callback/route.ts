import { type NextRequest, NextResponse } from "next/server";
import { verifyGitLinkState } from "@/lib/server/git/link-state";
import {
  exchangeGithubUserCode,
  getGithubUserAccount,
} from "@/lib/server/git/github-user-auth";
import { upsertUserIdentity } from "@/lib/server/git/user-identities";

/**
 * GET /api/git/github/user-callback — *User authorization callback URL* de la
 * GitHub App (MIN-144).
 *
 * À ne pas confondre avec `/api/git/github/setup`, qui est la Setup URL de
 * l'INSTALLATION : ici l'utilisateur n'installe rien, il autorise minddy à
 * parler EN SON NOM. GitHub redirige avec `code` + notre `state` signé, seule
 * preuve de contexte (qui a initié, et d'où).
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
  const { searchParams, origin } = request.nextUrl;
  const state = verifyGitLinkState(searchParams.get("state"));
  const code = searchParams.get("code");

  // Sans state valide on ne sait pas où revenir : retour aux paramètres du compte.
  if (!state || state.provider !== "github") {
    return redirectTo(DEFAULT_RETURN, origin, "error");
  }

  const base = (state.origin && RETURN_TO[state.origin]) || DEFAULT_RETURN;
  if (!code) return redirectTo(base, origin, "error");

  try {
    const tokens = await exchangeGithubUserCode({
      code,
      redirectUri: `${origin}/api/git/github/user-callback`,
    });
    const account = await getGithubUserAccount(tokens.accessToken);
    await upsertUserIdentity({
      userId: state.userId,
      provider: "github",
      providerAccountId: String(account.id),
      accountLogin: account.login || null,
      accountAvatarUrl: account.avatarUrl,
      tokens,
    });
    return redirectTo(base, origin, "connected");
  } catch (err) {
    console.error("[git/github/user-callback] failed:", err);
    return redirectTo(base, origin, "error");
  }
}
