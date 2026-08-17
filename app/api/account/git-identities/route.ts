import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import {
  ACTIVE_PROVIDERS,
  isRepoProviderId,
  type RepoProviderId,
} from "@/lib/repo-providers";
import {
  getGithubUserAuthorizeUrl,
  isGithubUserAuthConfigured,
} from "@/lib/server/git/github-user-auth";
import {
  getGitlabAuthorizeUrl,
  isGitlabConfigured,
} from "@/lib/server/git/gitlab-app";
import {
  ACCOUNT_CONNECT_PROJECT,
  signGitLinkState,
} from "@/lib/server/git/link-state";
import { listUserIdentities } from "@/lib/server/git/user-identities";
import { refreshForgeAccountNames } from "@/lib/server/git/account-refresh";
import { canonicalAppOrigin } from "@/lib/server/app-origin";

/**
 * Le compte git PERSONNEL de l'utilisateur (MIN-144) — celui sous lequel partent
 * ses gestes humains sur une pull request.
 *
 *  GET  → { identities, providers } (comptes autorisés + providers déployés).
 *  POST → { action:'start', provider, origin? } → { url } (page d'autorisation).
 *
 * À ne pas confondre avec `/api/account/git-connections`, qui parle de
 * l'INSTALLATION de la GitHub App (réutilisée par les projets pour lier un
 * dépôt). Les deux coexistent : installer l'App ne dit rien de qui agit.
 *
 * Côté GitLab, la connexion OAuth de `git_connections` EST déjà l'identité de la
 * personne : rien de nouveau à stocker, le GET la remonte telle quelle et le
 * POST renvoie vers le callback existant.
 */

/** Origines d'où l'on peut lancer une autorisation (table close, cf. callback). */
const ORIGINS = new Set(["settings", "pr"]);

function isProviderConfigured(provider: RepoProviderId): boolean {
  return provider === "github"
    ? isGithubUserAuthConfigured()
    : isGitlabConfigured();
}

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  // Le login stocké est un instantané de la connexion du compte : on le recale
  // avant de le lire, sinon un renommage chez la forge s'affiche à vie (MIN-154).
  await refreshForgeAccountNames(auth.user.id);
  const identities = await listUserIdentities(auth.user.id);
  if (!identities) {
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  const providers = ACTIVE_PROVIDERS.map((p) => ({
    id: p.id,
    // Sans ça, le bandeau offrirait un bouton qui répond 400 en self-host.
    configured: isProviderConfigured(p.id),
  }));
  return NextResponse.json({ identities, providers });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  if ((body as { action?: unknown })?.action !== "start") {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  const provider = (body as { provider?: unknown }).provider;
  if (!isRepoProviderId(provider)) {
    return NextResponse.json({ error: t("gitInvalidProvider") }, { status: 400 });
  }
  if (!isProviderConfigured(provider)) {
    return NextResponse.json(
      { error: t("gitProviderNotConfigured") },
      { status: 503 },
    );
  }

  const rawOrigin = (body as { origin?: unknown }).origin;
  const origin =
    typeof rawOrigin === "string" && ORIGINS.has(rawOrigin) ? rawOrigin : "settings";

  const state = signGitLinkState({
    projectId: ACCOUNT_CONNECT_PROJECT,
    userId: auth.user.id,
    provider,
    origin,
  });
  const url =
    provider === "github"
      ? getGithubUserAuthorizeUrl({
          redirectUri: `${canonicalAppOrigin()}/api/git/github/user-callback`,
          state,
        })
      : getGitlabAuthorizeUrl({
          redirectUri: `${canonicalAppOrigin()}/api/git/gitlab/callback`,
          state,
        });
  return NextResponse.json({ url });
}
