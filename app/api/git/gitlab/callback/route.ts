import { type NextRequest, NextResponse } from "next/server";
import { verifyGitLinkState, ACCOUNT_CONNECT_PROJECT } from "@/lib/server/git/link-state";
import {
  exchangeGitlabCode,
  getGitlabUser,
} from "@/lib/server/git/gitlab-app";
import { upsertGitlabConnection } from "@/lib/server/git/connections";

/**
 * GET /api/git/gitlab/callback — callback OAuth GitLab (MIN-47).
 *
 * GitLab redirige ici avec `code` + notre `state` signé. On échange le code
 * contre un jeu de tokens (access+refresh), on identifie le compte, on enregistre
 * la connexion (tokens chiffrés) au niveau compte, puis on renvoie l'utilisateur
 * vers les paramètres du projet pour choisir un dépôt.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const state = verifyGitLinkState(searchParams.get("state"));
  const code = searchParams.get("code");

  if (!state) {
    return NextResponse.redirect(new URL("/settings?tab=git&git=error", origin));
  }

  const isAccount = state.projectId === ACCOUNT_CONNECT_PROJECT;
  // Une autorisation initiée depuis le wizard de création (MIN-62) revient sur
  // /home : à ce stade le projet n'existe pas encore, c'est le brouillon en
  // session qui rouvre le wizard là où il en était. Depuis le panneau d'une PR
  // (MIN-144), retour à la page Pull requests. Sinon, paramètres git du projet
  // (ou du compte).
  const isWizard = isAccount && state.origin === "wizard";
  const base = isWizard
    ? "/home?setup=git"
    : isAccount && state.origin === "pr"
      ? "/pull-requests?connected=git"
      : isAccount
        ? "/settings?tab=git"
        : `/projects/${state.projectId}/settings?tab=git`;

  if (!code) {
    return NextResponse.redirect(new URL(`${base}&git=error`, origin));
  }

  try {
    const tokens = await exchangeGitlabCode({
      code,
      redirectUri: `${origin}/api/git/gitlab/callback`,
    });
    const user = await getGitlabUser(tokens.accessToken);
    const connectionId = await upsertGitlabConnection({
      userId: state.userId,
      providerAccountId: String(user.id),
      accountLogin: user.username || null,
      tokens,
    });
    // Le wizard a besoin de l'id de connexion pour ouvrir le sélecteur de dépôt
    // au retour ; les paramètres du compte, eux, n'en font rien.
    const suffix =
      isAccount && !isWizard
        ? "&git=connected"
        : `&git=connected&connection=${encodeURIComponent(connectionId)}`;
    return NextResponse.redirect(new URL(`${base}${suffix}`, origin));
  } catch (err) {
    console.error("[git/gitlab/callback] failed:", err);
    return NextResponse.redirect(new URL(`${base}&git=error`, origin));
  }
}
