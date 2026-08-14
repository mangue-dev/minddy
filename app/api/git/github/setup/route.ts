import { type NextRequest, NextResponse } from "next/server";
import { verifyGitLinkState, ACCOUNT_CONNECT_PROJECT } from "@/lib/server/git/link-state";
import {
  readForgeCallbackSession,
  sessionMatchesState,
} from "@/lib/server/git/callback-session";
import { getInstallationAccount } from "@/lib/server/git/github-app";
import { upsertGithubConnection } from "@/lib/server/git/connections";

/**
 * GET /api/git/github/setup — Setup URL de l'app GitHub (MIN-47).
 *
 * Après que l'utilisateur a installé l'app minddy sur un compte/dépôt, GitHub
 * redirige ici avec `installation_id`, `setup_action` et notre `state` signé. Le
 * `state` dit vers quel projet revenir ; c'est la SESSION qui dit sous quel
 * compte enregistrer l'installation (MIN-324 — cf. callback-session.ts). On
 * vérifie les deux, on enregistre la connexion au niveau compte, puis on renvoie
 * l'utilisateur vers les paramètres du projet pour choisir un dépôt.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const { userId: sessionUserId, applyCookies } =
    await readForgeCallbackSession(request);
  const state = verifyGitLinkState(searchParams.get("state"));
  const installationIdRaw = searchParams.get("installation_id");

  // Sans state valide on ne sait pas où revenir : retour aux paramètres du compte.
  if (!state) {
    return applyCookies(
      NextResponse.redirect(new URL("/settings?tab=git&git=error", origin)),
    );
  }

  const isAccount = state.projectId === ACCOUNT_CONNECT_PROJECT;
  // Une install initiée depuis le wizard de création (MIN-62) revient sur
  // /home : à ce stade le projet n'existe pas encore, c'est le brouillon en
  // session qui rouvre le wizard là où il en était. Sinon, retour aux
  // paramètres git du projet (ou du compte).
  const isWizard = isAccount && state.origin === "wizard";
  const base = isWizard
    ? "/home?setup=git"
    : isAccount
      ? "/settings?tab=git"
      : `/projects/${state.projectId}/settings?tab=git`;

  // Un `state` valide n'est pas une identité : son porteur l'a peut-être minté
  // depuis un autre compte. Sans session correspondante, on n'écrit rien.
  if (!sessionMatchesState(sessionUserId, state.userId)) {
    return applyCookies(
      NextResponse.redirect(new URL(`${base}&git=error`, origin)),
    );
  }

  const installationId = installationIdRaw ? Number(installationIdRaw) : NaN;
  if (!Number.isFinite(installationId) || installationId <= 0) {
    // setup_action === 'request' (approbation org en attente) ou install annulée.
    return applyCookies(
      NextResponse.redirect(new URL(`${base}&git=error`, origin)),
    );
  }

  try {
    const account = await getInstallationAccount(installationId);
    const connectionId = await upsertGithubConnection({
      // `state.userId` plutôt que `sessionUserId` : la garde ci-dessus les a
      // rendus égaux, et celui-ci est typé `string`.
      userId: state.userId,
      installationId,
      accountLogin: account?.login ?? null,
      accountType: account?.type ?? null,
      repositorySelection: account?.repositorySelection ?? null,
    });
    // Le wizard a besoin de l'id de connexion pour ouvrir le sélecteur de dépôt
    // au retour ; les paramètres du compte, eux, n'en font rien.
    const suffix =
      isAccount && !isWizard
        ? "&git=connected"
        : `&git=connected&connection=${encodeURIComponent(connectionId)}`;
    return applyCookies(
      NextResponse.redirect(new URL(`${base}${suffix}`, origin)),
    );
  } catch (err) {
    // Y compris `GithubInstallationOwnedByAnotherUserError` : l'écran dit
    // « erreur », et rien de plus — surtout pas à qui l'installation appartient.
    console.error("[git/github/setup] failed:", err);
    return applyCookies(
      NextResponse.redirect(new URL(`${base}&git=error`, origin)),
    );
  }
}
