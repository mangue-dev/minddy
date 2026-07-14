import { type NextRequest, NextResponse } from "next/server";
import { verifyGitLinkState, ACCOUNT_CONNECT_PROJECT } from "@/lib/server/git/link-state";
import { getInstallationAccount } from "@/lib/server/git/github-app";
import { upsertGithubConnection } from "@/lib/server/git/connections";

/**
 * GET /api/git/github/setup — Setup URL de l'app GitHub (MIN-47).
 *
 * Après que l'utilisateur a installé l'app minddy sur un compte/dépôt, GitHub
 * redirige ici avec `installation_id`, `setup_action` et notre `state` signé. Le
 * `state` est la seule preuve de contexte (projet + utilisateur) : on le vérifie,
 * on enregistre la connexion au niveau compte, puis on renvoie l'utilisateur vers
 * les paramètres du projet pour choisir un dépôt.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const state = verifyGitLinkState(searchParams.get("state"));
  const installationIdRaw = searchParams.get("installation_id");

  // Sans state valide on ne sait pas où revenir : retour aux paramètres du compte.
  if (!state) {
    return NextResponse.redirect(new URL("/settings?tab=git&git=error", origin));
  }

  const isAccount = state.projectId === ACCOUNT_CONNECT_PROJECT;
  const base = isAccount
    ? "/settings?tab=git"
    : `/projects/${state.projectId}/settings?tab=git`;

  const installationId = installationIdRaw ? Number(installationIdRaw) : NaN;
  if (!Number.isFinite(installationId) || installationId <= 0) {
    // setup_action === 'request' (approbation org en attente) ou install annulée.
    return NextResponse.redirect(new URL(`${base}&git=error`, origin));
  }

  try {
    const account = await getInstallationAccount(installationId);
    const connectionId = await upsertGithubConnection({
      userId: state.userId,
      installationId,
      accountLogin: account?.login ?? null,
      accountType: account?.type ?? null,
      repositorySelection: account?.repositorySelection ?? null,
    });
    const suffix = isAccount
      ? "&git=connected"
      : `&git=connected&connection=${encodeURIComponent(connectionId)}`;
    return NextResponse.redirect(new URL(`${base}${suffix}`, origin));
  } catch (err) {
    console.error("[git/github/setup] failed:", err);
    return NextResponse.redirect(new URL(`${base}&git=error`, origin));
  }
}
