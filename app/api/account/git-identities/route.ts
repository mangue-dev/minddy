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
 * The user's PERSONAL git account (MIN-144) — the one under which they leave
 * its human gestures on a pull request.
 *
 * GET → { identities, providers } (authorized accounts + deployed providers).
 *  POST → { action:'start', provider, origin? } → { url } (page d'autorisation).
 *
 * Not to be confused with `/api/account/git-connections`, which talks about
 * INSTALLATION of the GitHub App (reused by projects to link a
 * deposit). The two coexist: installing the App says nothing about who acts.
 *
 * On the GitLab side, the OAuth connection of `git_connections` IS already the identity of the
 * person: nothing new to store, the GET brings it back as is and the
 * POST returns to the existing callback.
 */

/** Origins from which an authorization can be launched (table closed, see callback). */
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

  // The stored login is a snapshot of the account connection: we reset it
  // before reading it, otherwise a rename at the forge is displayed for life (MIN-154).
  await refreshForgeAccountNames(auth.user.id);
  const identities = await listUserIdentities(auth.user.id);
  if (!identities) {
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  const providers = ACTIVE_PROVIDERS.map((p) => ({
    id: p.id,
    // Without that, the headband would offer a button that responds 400 in self-host.
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
