import { after, NextResponse, type NextRequest } from "next/server";
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
  getIssuesPermission,
  isGithubAppConfigured,
} from "@/lib/server/git/github-app";
import {
  ensureGitlabIssuesHook,
  getGitlabAccessToken,
  getGitlabAuthorizeUrl,
  isGitlabConfigured,
} from "@/lib/server/git/gitlab-app";
import { ensureRepoWebhookSecret } from "@/lib/server/git/webhook-secret";
import {
  backfillRemoteIssues,
  getIssueSyncLink,
  setIssueSyncEnabled,
} from "@/lib/server/git/issue-sync";
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
import { resolveRepoCloneTarget } from "@/lib/server/agent/repo-access";
import { syncRepoPullRequests } from "@/lib/server/agent/pull-requests";
import type { ProjectGitLink } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };

// Le backfill d'activation enchaîne une RPC de numérotation par ticket (jusqu'à
// 500) après la réponse — même budget que la route d'import CSV.
export const maxDuration = 120;

function isProviderConfigured(provider: RepoProviderId): boolean {
  return provider === "github" ? isGithubAppConfigured() : isGitlabConfigured();
}

/**
 * Balaye les pull requests du dépôt qu'on vient de lier (MIN-143). Best-effort :
 * la liaison, elle, a réussi — et le rattrapage paresseux de
 * `/api/pull-requests` repassera de toute façon.
 */
async function backfillRepoPullRequests(projectId: string): Promise<void> {
  try {
    const target = await resolveRepoCloneTarget(projectId);
    if (!target) return;
    const { count, truncated } = await syncRepoPullRequests({
      provider: target.provider,
      repoFullName: target.repoFullName,
      token: target.token,
    });
    if (truncated) {
      console.warn(
        `[git-link] ${target.repoFullName}: ${count} PR ingérées, pagination coupée`,
      );
    }
  } catch (err) {
    console.error("[git-link] pull request backfill failed:", (err as Error).message);
  }
}

/** La page GitHub où accorder une permission à une installation. */
const permissionsUrlFor = (installationId: number | null): string | null =>
  installationId != null
    ? `https://github.com/settings/installations/${installationId}/permissions/update`
    : null;

/**
 * L'URL où accorder « Issues (Write) », ou `null` si rien n'est à signaler.
 *
 * Interrogé à CHAQUE lecture plutôt que mémorisé à l'activation, pour les deux
 * sens : l'avertissement survit à un rechargement (sans quoi celui qui n'a
 * accordé que la lecture ne le revoit jamais, et le retour de statut échoue en
 * silence dans les logs), et il DISPARAÎT tout seul dès que la permission est
 * accordée sur GitHub, sans rien à rebasculer ici.
 *
 * Coût : un appel GitHub, et seulement dans le cas étroit qui l'exige — owner,
 * GitHub, synchro active. Un panneau de réglages n'est pas un chemin chaud.
 */
async function issueSyncWriteMissingUrl(
  projectId: string,
  link: ProjectGitLink | null,
  isOwner: boolean,
): Promise<string | null> {
  if (!isOwner || link?.provider !== "github" || !link.issue_sync_enabled) {
    return null;
  }
  try {
    const sync = await getIssueSyncLink(projectId);
    if (sync?.installationId == null) return null;
    const level = await getIssuesPermission(sync.installationId);
    // `none` est un autre problème (aucun event ne serait livré) et il a déjà
    // été dit à l'activation : ici on ne parle que du RETOUR, qui exige `write`.
    return level === "write" ? null : permissionsUrlFor(sync.installationId);
  } catch (err) {
    // Un avertissement consultatif ne fait pas tomber la page de réglages — et
    // comme la promesse est lancée AVANT d'être attendue, une rejection nue
    // ressortirait en `unhandledRejection` plutôt qu'en 500 lisible.
    console.error("[git-link] issues permission probe failed:", (err as Error).message);
    return null;
  }
}

/**
 * GET /api/projects/[id]/git-link
 *  - défaut : { link, isOwner, providers[], issueSyncWriteMissingUrl }.
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
  // En parallèle des providers : c'est un appel GitHub, il n'a aucune raison
  // d'attendre la fin des lookups de connexion.
  const writeMissing = issueSyncWriteMissingUrl(id, link, access.isOwner);

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

  return NextResponse.json({
    link,
    isOwner: access.isOwner,
    providers,
    writeMissingUrl: await writeMissing,
  });
}

/**
 * POST /api/projects/[id]/git-link — owner uniquement.
 *  - { action:'start', provider } → { mode:'reuse'|'install'|'oauth', url?, connectionId? }
 *  - { action:'bind', connection_id, external_repo_id } → { link }
 *  - { action:'issue_sync', enabled } → { link } (synchro issues dépôt → minddy)
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

    // Toujours depuis les paramètres d'un projet : le wizard de création, lui,
    // se connecte au niveau compte (/api/account/git-connections), parce qu'il
    // n'a pas encore de projet à qui rattacher l'install.
    const state = signGitLinkState({
      projectId: id,
      userId: auth.user.id,
      provider,
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
    // Bornes larges : un uuid de connexion et un id de dépôt de forge tiennent
    // très en deçà — au-delà, ce ne sont pas des ids.
    if (
      typeof connectionId !== "string" ||
      connectionId.length > 64 ||
      typeof externalRepoId !== "string" ||
      externalRepoId.length > 200
    ) {
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
      // Rattrapage des pull requests du dépôt (MIN-143) : il faut bien un point
      // de départ — le webhook n'annonce que ce qui bouge APRÈS la liaison, et
      // sans ce balayage la page Pull Requests s'ouvrirait vide sur un dépôt qui
      // en a des dizaines. Hors du chemin critique : la réponse part tout de
      // suite, et la liste se remplit derrière.
      after(() => backfillRepoPullRequests(id));
      return NextResponse.json({ link: result.link });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 502 });
    }
  }

  // Synchro unidirectionnelle des issues du dépôt → minddy (MIN-97). Le toggle
  // ne touche PAS aux tickets déjà importés : le couper arrête l'arrivée des
  // nouveaux, il ne supprime rien.
  if (action === "issue_sync") {
    const enabled = (body as { enabled?: unknown }).enabled;
    if (typeof enabled !== "boolean") {
      return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
    }
    const link = await getIssueSyncLink(id);
    if (!link) {
      return NextResponse.json({ error: t("gitRepoNotFound") }, { status: 404 });
    }

    let hookId: string | null | undefined;
    /** L'installation permet-elle d'ÉCRIRE chez la forge ? Renseigné pour
        GitHub seulement : côté GitLab, le token OAuth de la connexion porte
        déjà les droits de son propriétaire sur le dépôt. */
    let permissionsUrl: string | null = null;
    let canWrite = true;
    if (link.provider === "github") {
      // Une App qui gagne une permission ne l'obtient pas rétroactivement :
      // l'installation doit accepter `Issues (Read)`. Sans ça, aucun event
      // `issues` ne serait livré — on le dit AVANT d'activer.
      if (enabled) {
        permissionsUrl = permissionsUrlFor(link.installationId);
        const level =
          link.installationId != null
            ? await getIssuesPermission(link.installationId)
            : "none";
        if (level === "none") {
          return NextResponse.json(
            { error: t("gitIssuesPermissionMissing"), url: permissionsUrl },
            { status: 400 },
          );
        }
        // `read` n'est PAS refusé : le sens descendant marche parfaitement avec,
        // et durcir la porte couperait les liaisons qui tournent déjà. C'est le
        // RETOUR (refermer l'issue distante) qui a besoin de `write` — on le dit
        // sans l'imposer, plutôt que de le laisser échouer en 403 silencieux.
        canWrite = level === "write";
      }
    } else {
      // GitLab : le hook vit sur le dépôt, on le provisionne/bascule ici. Son
      // secret est propre à CE dépôt (MIN-333) et minté avant l'appel : le
      // récepteur ne reconnaîtra le hook qu'à ce secret-là.
      try {
        const secret = await ensureRepoWebhookSecret({
          provider: "gitlab",
          externalRepoId: link.externalRepoId,
        });
        const token = await getGitlabAccessToken(link.connectionId);
        hookId = await ensureGitlabIssuesHook(token, link.externalRepoId, {
          enabled,
          secret,
        });
      } catch (err) {
        console.error("[git-link] gitlab hook failed:", (err as Error).message);
        // À la désactivation on continue quand même : couper la synchro ne doit
        // pas dépendre d'un appel GitLab. Le flag à false suffit — le récepteur
        // ne trouvera plus de cible.
        if (enabled) {
          return NextResponse.json({ error: t("gitHookFailed") }, { status: 502 });
        }
      }
    }

    try {
      await setIssueSyncEnabled({ linkId: link.linkId, enabled, hookId });
    } catch (err) {
      console.error("[git-link] issue_sync toggle failed:", (err as Error).message);
      return NextResponse.json({ error: t("databaseError") }, { status: 500 });
    }

    // Backfill des issues ouvertes hors du chemin critique : la réponse part
    // tout de suite, les tickets arrivent ensuite par le realtime.
    if (enabled) {
      after(() =>
        backfillRemoteIssues(link).catch((err) =>
          console.error("[git-link] backfill failed:", (err as Error).message),
        ),
      );
    }

    return NextResponse.json({
      link: await getProjectLink(id),
      // Le panneau s'en sert pour inviter à accepter « Issues (Write) » quand
      // seule la lecture est accordée. Absent à la désactivation.
      ...(enabled && !canWrite ? { writeMissingUrl: permissionsUrl } : {}),
    });
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
