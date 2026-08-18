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
import { canonicalAppOrigin } from "@/lib/server/app-origin";

function isProviderConfigured(provider: RepoProviderId): boolean {
  return provider === "github" ? isGithubAppConfigured() : isGitlabConfigured();
}

/**
 * GET /api/account/git-connections
 * - default: { connections, providers } (account git connections, sanitized).
 * - ?candidates=<connectionId>: { candidates } (connection deposits).
 *
 * The `candidates` variant doubles that of `/api/projects/[id]/git-link` without the
 * project: the creation wizard chooses a repository BEFORE the project exists
 * (MIN-62), the connection is made at creation. Nothing planned here — the connection
 * belongs to the account, `getUserConnection` is the sole guardian.
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

  // The stored login is a snapshot of the account connection: we reset it
  // before reading it, otherwise a rename at the forge is displayed for life (MIN-154).
  // Not in the `candidates` branch: it lists deposits, not accounts.
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

/** Where the connection starts from — that's what decides where the callback leads back to. */
const ORIGINS = new Set(["wizard", "settings"]);

/**
 * POST /api/account/git-connections — { action:'start', provider, origin? }
 *  → { mode:'reuse', connectionId } | { mode:'install'|'oauth', url }
 *
 * Connection at the ACCOUNT level: the `state` carries the sentinel project
 * `__account__`, and its `origin` the return destination.
 * - `wizard` → `/home?setup=git`: the creation wizard reopens there from
 * his draft (lib/project-draft.ts), since at this stage there is no
 * still a project.
 * - `settings` → `/settings?tab=git`: the account settings, from where we
 * connect a git account without going through a project.
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
      { status: 503 },
    );
  }

  // Already connected → reuse: no round-trip provider, therefore no redirect
  // full screen, so no draft to save.
  const existing = await findReusableConnection(auth.user.id, provider);
  if (existing) {
    return NextResponse.json({ mode: "reuse", connectionId: existing.id });
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
  if (provider === "github") {
    const url = `https://github.com/apps/${getGithubAppSlug()}/installations/new?state=${encodeURIComponent(state)}`;
    return NextResponse.json({ mode: "install", url });
  }
  const url = getGitlabAuthorizeUrl({
    redirectUri: `${canonicalAppOrigin()}/api/git/gitlab/callback`,
    state,
  });
  return NextResponse.json({ mode: "oauth", url });
}
