import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import {
  findReusableConnection,
  getUserConnection,
  listUserConnections,
} from "@/lib/server/git/connections";
import {
  ACTIVE_PROVIDERS,
  isRepoProviderId,
  type RepoProviderId,
} from "@/lib/repo-providers";
import {
  getGithubAppSlug,
  isGithubAppConfigured,
} from "@/lib/server/git/github-app";
import {
  getGitlabAuthorizeUrl,
  isGitlabConfigured,
} from "@/lib/server/git/gitlab-app";
import {
  ACCOUNT_CONNECT_PROJECT,
  signGitLinkState,
} from "@/lib/server/git/link-state";
import { listCandidateRepos } from "@/lib/server/git/repo-links";
import { refreshForgeAccountNames } from "@/lib/server/git/account-refresh";

function isProviderConfigured(provider: RepoProviderId): boolean {
  return provider === "github" ? isGithubAppConfigured() : isGitlabConfigured();
}

/**
 * GET /api/account/git-connections
 *  - défaut : { connections, providers } (connexions git du compte, sanitisées).
 *  - ?candidates=<connectionId> : { candidates } (dépôts de la connexion).
 *
 * Le variant `candidates` double celui de `/api/projects/[id]/git-link` sans le
 * projet : le wizard de création choisit un dépôt AVANT que le projet existe
 * (MIN-62), la liaison se fait à la création. Rien de projet ici — la connexion
 * appartient au compte, `getUserConnection` en est la seule garde.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const candidatesFor = request.nextUrl.searchParams.get("candidates");
  if (candidatesFor) {
    const connection = await getUserConnection(auth.user.id, candidatesFor);
    if (!connection) {
      return NextResponse.json(
        { error: t("gitConnectionNotFound") },
        { status: 404 },
      );
    }
    try {
      return NextResponse.json({ candidates: await listCandidateRepos(connection) });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 502 });
    }
  }

  // Le login stocké est un instantané de la connexion du compte : on le recale
  // avant de le lire, sinon un renommage chez la forge s'affiche à vie (MIN-154).
  // Pas dans la branche `candidates` : elle liste des dépôts, pas des comptes.
  await refreshForgeAccountNames(auth.user.id);
  const connections = await listUserConnections(auth.user.id);
  if (!connections) {
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  const providers = ACTIVE_PROVIDERS.map((p) => ({
    id: p.id,
    configured: isProviderConfigured(p.id),
  }));
  return NextResponse.json({ connections, providers });
}

/**
 * POST /api/account/git-connections — { action:'start', provider }
 *  → { mode:'reuse', connectionId } | { mode:'install'|'oauth', url }
 *
 * Connexion au niveau COMPTE : le `state` porte le projet sentinelle
 * `__account__` et `origin:'wizard'`, ce qui fait revenir les callbacks sur
 * `/home?setup=git` — le wizard de création s'y rouvre depuis son brouillon
 * (lib/project-draft.ts), puisqu'à ce stade il n'y a pas encore de projet.
 */
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
      { status: 400 },
    );
  }

  // Déjà connecté → reuse : pas de round-trip provider, donc pas de redirect
  // plein écran, donc pas de brouillon à sauver.
  const existing = await findReusableConnection(auth.user.id, provider);
  if (existing) {
    return NextResponse.json({ mode: "reuse", connectionId: existing.id });
  }

  const state = signGitLinkState({
    projectId: ACCOUNT_CONNECT_PROJECT,
    userId: auth.user.id,
    provider,
    origin: "wizard",
  });
  if (provider === "github") {
    const url = `https://github.com/apps/${getGithubAppSlug()}/installations/new?state=${encodeURIComponent(state)}`;
    return NextResponse.json({ mode: "install", url });
  }
  const url = getGitlabAuthorizeUrl({
    redirectUri: `${request.nextUrl.origin}/api/git/gitlab/callback`,
    state,
  });
  return NextResponse.json({ mode: "oauth", url });
}
