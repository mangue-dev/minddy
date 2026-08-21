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
  isLocalGitlabOAuthConfigured,
} from "@/lib/server/git/gitlab-app";
import { isLocalGithubAppConfigured } from "@/lib/server/git/github-app";
import { forgeRelayConfig } from "@/lib/server/forge-relay/client";
import { ensureForgeRelayProvisioned } from "@/lib/server/forge-relay/provisioning";
import { signRelayGitlabState } from "@/lib/server/forge-relay/gitlab-broker";
import { generateClaimCode } from "@/lib/server/forge-relay/claims";
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
import { canonicalAppOrigin } from "@/lib/server/app-origin";

type RouteContext = { params: Promise<{ id: string }> };

// The activation backfill chains one dialing RPC per ticket (up to
// 500) after the response — same budget as the CSV import route.
export const maxDuration = 120;

function isProviderConfigured(provider: RepoProviderId): boolean {
  return provider === "github" ? isGithubAppConfigured() : isGitlabConfigured();
}

/**
 * Scans the pull requests from the repository we just linked (MIN-143). Best effort:
 * the connection was successful - and the lazy catching up of
 * `/api/pull-requests` will come back anyway.
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

/** The GitHub page where to grant permission to an installation. */
const permissionsUrlFor = (installationId: number | null): string | null =>
  installationId != null
    ? `https://github.com/settings/installations/${installationId}/permissions/update`
    : null;

/**
 * The URL to grant “Issues (Write)”, or `null` if nothing is to be reported.
 *
 * Queried on EACH reading rather than memorized on activation, for both
 * meaning: the warning survives a reload (otherwise anyone who has not
 * granted that reading never sees it again, and the status return fails in
 * silence in the logs), and it DISAPPEARS on its own as soon as permission is granted.
 * granted on GitHub, without anything to re-upload here.
 *
 * Cost: a GitHub call, and only in the narrow case that requires it — owner,
 * GitHub, active sync. A settings panel is not a hot path.
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
    // `none` is another problem (no event would be delivered) and it already has
    // been said upon activation: here we are only talking about RETURN, which requires `write`.
    return level === "write" ? null : permissionsUrlFor(sync.installationId);
  } catch (err) {
    // An advisory warning does not bring down the settings page — and
    // as the promise is launched BEFORE being expected, a naked rejection
    // would come out as `unhandledRejection` rather than readable 500.
    console.error("[git-link] issues permission probe failed:", (err as Error).message);
    return null;
  }
}

/**
 * GET /api/projects/[id]/git-link
 * - default: { link, isOwner, providers[], issueSyncWriteMissingUrl }.
 * - ?candidates=<connectionId>: { candidates } (connection repositories, owner).
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

  // Subquery: candidate repositories of a connection (repository selector).
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
  // In parallel with providers: it's a GitHub call, it has no reason
  // to wait for the connection lookups to complete.
  const writeMissing = issueSyncWriteMissingUrl(id, link, access.isOwner);

  // Providers configured + possible reusable connection (owner only).
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
 * - { action:'issue_sync', enabled } → { link } (sync issues depot → minddy)
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
    // The managed forge relay is a DEFAULT capability of the self-hosted
    // edition: without a local app, the first connect provisions the relay
    // identity automatically (docs/managed-forge-relay-plan.md).
    let providerConfigured = isProviderConfigured(provider);
    if (!providerConfigured) {
      providerConfigured = await ensureForgeRelayProvisioned();
    }
    if (!providerConfigured) {
      return NextResponse.json(
        { error: t("gitProviderNotConfigured") },
        { status: 503 },
      );
    }

    // Already connected → reuse (no round-trip provider), the UI lists the repositories.
    const existing = await findReusableConnection(auth.user.id, provider);
    if (existing) {
      return NextResponse.json({ mode: "reuse", connectionId: existing.id });
    }

    // Always from the project settings: the creation wizard,
    // se connecte au niveau compte (/api/account/git-connections), parce qu'il
    // does not yet have a project to attach the install to.
    if (provider === "github") {
      // RELAY-ONLY instance: claim the official minddy App through the relay
      // instead of an operator-owned app (same contract as the account route).
      if (!isLocalGithubAppConfigured()) {
        const config = (await ensureForgeRelayProvisioned())
          ? forgeRelayConfig()
          : null;
        if (!config) {
          return NextResponse.json(
            { error: t("gitProviderNotConfigured") },
            { status: 503 },
          );
        }
        const code = generateClaimCode();
        const url = `${config.url.replace(/\/$/, "")}/api/relay/github/claim?instance=${encodeURIComponent(config.instanceId)}&code=${code}`;
        return NextResponse.json({ mode: "claim", url, code });
      }
      const state = signGitLinkState({
        projectId: id,
        userId: auth.user.id,
        provider,
      });
      const url = `https://github.com/apps/${getGithubAppSlug()}/installations/new?state=${encodeURIComponent(state)}`;
      return NextResponse.json({ mode: "install", url });
    }
    if (!isLocalGitlabOAuthConfigured()) {
      const config = (await ensureForgeRelayProvisioned())
        ? forgeRelayConfig()
        : null;
      if (!config) {
        return NextResponse.json(
          { error: t("gitProviderNotConfigured") },
          { status: 503 },
        );
      }
      const state = signRelayGitlabState({
        userId: auth.user.id,
        callbackOrigin: canonicalAppOrigin(),
        returnPath: `/projects/${id}/settings?tab=git`,
        privateKey: config.secret,
      });
      const url = `${config.url.replace(/\/$/, "")}/api/relay/gitlab/authorize?instance=${encodeURIComponent(config.instanceId)}&state=${encodeURIComponent(state)}`;
      return NextResponse.json({ mode: "oauth", url });
    }
    const url = getGitlabAuthorizeUrl({
      redirectUri: `${canonicalAppOrigin()}/api/git/gitlab/callback`,
      state: signGitLinkState({
        projectId: id,
        userId: auth.user.id,
        provider,
      }),
    });
    return NextResponse.json({ mode: "oauth", url });
  }

  if (action === "bind") {
    const connectionId = (body as { connection_id?: unknown }).connection_id;
    const externalRepoId = (body as { external_repo_id?: unknown }).external_repo_id;
    // Wide bounds: a connection uuid and a forge depot id fit
    // far below — beyond, these are not ids.
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
      // Catching up pull requests from the repository (MIN-143): there needs to be a point
      // start — the webhook only announces what moves AFTER the link, and
      // without this scan the Pull Requests page would open empty on a repository which
      // has dozens of them. Outside the critical path: the answer starts from
      // continuation, and the list fills up behind.
      after(() => backfillRepoPullRequests(id));
      return NextResponse.json({ link: result.link });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 502 });
    }
  }

  // Unidirectional synchronization of depot exits → minddy (MIN-97). The toggle
  // does NOT touch tickets already imported: cutting it stops the arrival of
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
    /** Does the installation allow you to WRITE at the forge? Informed for
 GitHub only: on the GitLab side, the OAuth token of the connection already carries
 the rights of its owner on the repository. */
    let permissionsUrl: string | null = null;
    let canWrite = true;
    if (link.provider === "github") {
      // An App that gains permission does not obtain it retroactively:
      // the installation must accept `Issues (Read)`. Without that, no event
      // `issues` would not be delivered — we say this BEFORE activating.
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
        // `read` is NOT refused: the downward direction works perfectly with it,
        // and hardening the door would cut the connections that are already running. This is the
        // RETURN (close remote exit) which needs `write` — we say so
        // without imposing it, rather than letting it fail in silent 403.
        canWrite = level === "write";
      }
    } else {
      // GitLab: the hook lives on the repository, we provision/switch it here. Her
      // secret is specific to THIS deposit (MIN-333) and minted before the call: the
      // receiver will only recognize the hook by this secret.
      try {
        const secret = await ensureRepoWebhookSecret({
          provider: "gitlab",
          externalRepoId: link.externalRepoId,
        });
        const token = await getGitlabAccessToken(link.connectionId);
        hookId = await ensureGitlabIssuesHook(token, link.externalRepoId, {
          enabled,
          secret,
          // Relay-ness belongs to the connection: a local GitLab app on an
          // instance that also uses the relay keeps its instance-pointed hook.
          source: link.connectionSource ?? null,
        });
      } catch (err) {
        console.error("[git-link] gitlab hook failed:", (err as Error).message);
        // When deactivating we continue anyway: cutting the sync should not
        // not depend on a GitLab call. The false flag is enough — the receiver
        // will no longer find a target.
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

    // Backfill of open issues outside the critical path: the response leaves
    // straight away, the tickets then arrive via realtime.
    if (enabled) {
      after(() =>
        backfillRemoteIssues(link).catch((err) =>
          console.error("[git-link] backfill failed:", (err as Error).message),
        ),
      );
    }

    return NextResponse.json({
      link: await getProjectLink(id),
      // The panel uses this to prompt you to accept “Issues (Write)” when
      // only reading is granted. Absent on deactivation.
      ...(enabled && !canWrite ? { writeMissingUrl: permissionsUrl } : {}),
    });
  }

  return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
}

/** DELETE /api/projects/[id]/git-link — owner unlinks the project repository. */
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
