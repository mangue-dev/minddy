import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import {
  ACTIVE_PROVIDERS,
  isRepoProviderId,
  type RepoProviderId,
} from "@/lib/repo-providers";
import { signGitLinkState } from "@/lib/server/git/link-state";
import {
  getGithubAppSlug,
  isGithubAppConfigured,
} from "@/lib/server/git/github-app";
import {
  getGitlabAuthorizeUrl,
  isGitlabConfigured,
} from "@/lib/server/git/gitlab-app";
import {
  findReusableConnection,
  getUserConnection,
} from "@/lib/server/git/connections";
import {
  bindRepo,
  getProjectLink,
  listCandidateRepos,
  unlinkProject,
} from "@/lib/server/git/repo-links";

type RouteContext = { params: Promise<{ id: string }> };

function isProviderConfigured(provider: RepoProviderId): boolean {
  return provider === "github" ? isGithubAppConfigured() : isGitlabConfigured();
}

/**
 * GET /api/projects/[id]/git-link
 *  - défaut : { link, isOwner, providers[] } (état de liaison + providers dispo).
 *  - ?candidates=<connectionId> : { candidates } (dépôts de la connexion, owner).
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const access = await getProjectAccess(auth.user.id, id);
  if (!access) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }

  // Sous-requête : dépôts candidats d'une connexion (sélecteur de dépôt).
  const candidatesFor = request.nextUrl.searchParams.get("candidates");
  if (candidatesFor) {
    if (!access.isOwner) {
      return NextResponse.json({ error: t("ownerOnly") }, { status: 403 });
    }
    const connection = await getUserConnection(auth.user.id, candidatesFor);
    if (!connection) {
      return NextResponse.json(
        { error: t("gitConnectionNotFound") },
        { status: 404 },
      );
    }
    try {
      const candidates = await listCandidateRepos(connection);
      return NextResponse.json({ candidates });
    } catch (err) {
      return NextResponse.json(
        { error: (err as Error).message },
        { status: 502 },
      );
    }
  }

  const link = await getProjectLink(id);

  // Providers configurés + éventuelle connexion réutilisable (owner uniquement).
  const providers = await Promise.all(
    ACTIVE_PROVIDERS.map(async (p) => {
      const configured = isProviderConfigured(p.id);
      const connection =
        access.isOwner && configured
          ? await findReusableConnection(auth.user.id, p.id)
          : null;
      return { id: p.id, configured, connection };
    }),
  );

  return NextResponse.json({ link, isOwner: access.isOwner, providers });
}

/**
 * POST /api/projects/[id]/git-link — owner uniquement.
 *  - { action:'start', provider } → { mode:'reuse'|'install'|'oauth', url?, connectionId? }
 *  - { action:'bind', connection_id, external_repo_id } → { link }
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const access = await getProjectAccess(auth.user.id, id);
  if (!access) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }
  if (!access.isOwner) {
    return NextResponse.json({ error: t("ownerOnly") }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const action = (body as { action?: unknown })?.action;

  if (action === "start") {
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

    // Déjà connecté → reuse (pas de round-trip provider), l'UI liste les dépôts.
    const existing = await findReusableConnection(auth.user.id, provider);
    if (existing) {
      return NextResponse.json({ mode: "reuse", connectionId: existing.id });
    }

    // `origin: 'wizard'` → le callback reprend le wizard de création (MIN-62).
    const requestOrigin = (body as { origin?: unknown }).origin;
    const state = signGitLinkState({
      projectId: id,
      userId: auth.user.id,
      provider,
      ...(requestOrigin === "wizard" ? { origin: "wizard" } : {}),
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

  if (action === "bind") {
    const connectionId = (body as { connection_id?: unknown }).connection_id;
    const externalRepoId = (body as { external_repo_id?: unknown }).external_repo_id;
    if (typeof connectionId !== "string" || typeof externalRepoId !== "string") {
      return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
    }
    try {
      const result = await bindRepo({
        projectId: id,
        userId: auth.user.id,
        connectionId,
        externalRepoId,
      });
      if (!result.ok) {
        const key =
          result.errorKey === "connectionNotFound"
            ? "gitConnectionNotFound"
            : "gitRepoNotFound";
        return NextResponse.json({ error: t(key) }, { status: result.status });
      }
      return NextResponse.json({ link: result.link });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 502 });
    }
  }

  return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
}

/** DELETE /api/projects/[id]/git-link — owner délie le dépôt du projet. */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const access = await getProjectAccess(auth.user.id, id);
  if (!access) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }
  if (!access.isOwner) {
    return NextResponse.json({ error: t("ownerOnly") }, { status: 403 });
  }

  await unlinkProject(id);
  return NextResponse.json({ ok: true });
}
