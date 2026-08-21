import { type NextRequest, NextResponse } from "next/server";
import { verifyGitLinkState, ACCOUNT_CONNECT_PROJECT } from "@/lib/server/git/link-state";
import {
  readForgeCallbackSession,
  sessionMatchesState,
} from "@/lib/server/git/callback-session";
import { getServiceClient } from "@/lib/supabase-service";
import { getInstallationAccount } from "@/lib/server/git/github-app";
import { upsertGithubConnection } from "@/lib/server/git/connections";
import { canonicalAppOrigin } from "@/lib/server/app-origin";
import { isManagedForgeEnabled } from "@/lib/managed-services";
import {
  bindRelayClaim,
  verifyRelayClaimState,
} from "@/lib/server/forge-relay/claims";

/**
 * GET /api/git/github/setup — Setup URL de l'app GitHub (MIN-47).
 *
 * After the user installs the minddy app on an account/repository, GitHub
 * redirects here with `installation_id`, `setup_action` and our signed `state`. THE
 * `state` says which project to return to; it is the SESSION which says under what
 * compte enregistrer l'installation (MIN-324 — cf. callback-session.ts). On
 * checks both, we save the connection at account level, then we return
 * the user to the project settings to choose a repository.
 *
 * RELAY claims (docs/managed-forge-relay-plan.md): when the state is a
 * forge-relay claim state, the installation is bound to the claiming INSTANCE
 * (not to a Cloud user account) and the operator gets a plain confirmation
 * page — no session applies, the operator's account lives on the instance.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = canonicalAppOrigin();

  const relayClaim = verifyRelayClaimState(searchParams.get("state"));
  if (relayClaim) {
    // Same kill switch as every other relay route (GA runbook commitment):
    // the local flow below stays reachable, only claims are cut.
    const failPage = (title: string, detail: string, status: number) =>
      new NextResponse(
        `<!doctype html><html><body style="font-family:system-ui;max-width:32rem;margin:4rem auto">
          <h1>${title}</h1>${detail}
        </body></html>`,
        { status, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    if (!isManagedForgeEnabled()) {
      return failPage(
        "GitHub claim failed",
        "<p>The managed forge relay is not configured on Cloud.</p><p>Go back to your minddy instance and restart the connection.</p>",
        503,
      );
    }
    const installationId = Number(searchParams.get("installation_id"));
    const binding = Number.isFinite(installationId) && installationId > 0
      ? await bindRelayClaim({
          instanceId: relayClaim.instanceId,
          code: relayClaim.code,
          installationId,
        })
      : { ok: false as const, status: 400, error: "Missing installation id" };
    const title = binding.ok ? "GitHub connected" : "GitHub claim failed";
    const detail = binding.ok
      ? `<p>The installation <code>${binding.installationId}</code>${binding.accountLogin ? ` (${binding.accountLogin})` : ""} is now bound to your minddy instance. You can close this page and return to your instance.</p>`
      : `<p>${binding.error}</p><p>Go back to your minddy instance and restart the connection.</p>`;
    return new NextResponse(
      `<!doctype html><html><body style="font-family:system-ui;max-width:32rem;margin:4rem auto">
        <h1>${title}</h1>${detail}
      </body></html>`,
      {
        status: binding.ok ? 200 : binding.status,
        headers: { "content-type": "text/html; charset=utf-8" },
      },
    );
  }

  const { userId: sessionUserId, applyCookies } =
    await readForgeCallbackSession(request);
  const state = verifyGitLinkState(searchParams.get("state"));
  const installationIdRaw = searchParams.get("installation_id");

  // Without a valid state we don't know where to return: return to account settings.
  if (!state) {
    return applyCookies(
      NextResponse.redirect(new URL("/settings?tab=git&git=error", origin)),
    );
  }

  const isAccount = state.projectId === ACCOUNT_CONNECT_PROJECT;
  // An install initiated from the creation wizard (MIN-62) returns to
  // /home: at this stage the project does not yet exist, it is the draft in
  // session which reopens the wizard where it left off. Otherwise, return to
  // git settings of the project (or account).
  const isWizard = isAccount && state.origin === "wizard";
  const base = isWizard
    ? "/home?setup=git"
    : isAccount
      ? "/settings?tab=git"
      : `/projects/${state.projectId}/settings?tab=git`;

  // A valid `state` is not an identity: its bearer may have minted it
  // from another account. Without a corresponding session, nothing is written.
  if (!sessionMatchesState(sessionUserId, state.userId)) {
    return applyCookies(
      NextResponse.redirect(new URL(`${base}&git=error`, origin)),
    );
  }

  const installationId = installationIdRaw ? Number(installationIdRaw) : NaN;
  if (!Number.isFinite(installationId) || installationId <= 0) {
    // setup_action === 'request' (org approval pending) or install canceled.
    return applyCookies(
      NextResponse.redirect(new URL(`${base}&git=error`, origin)),
    );
  }

  try {
    // An installation CLAIMED by a relay instance must not become a Cloud
    // connection: the webhook receiver routes claimed installations to their
    // instance and skips local handlers, so the Cloud account would silently
    // stop receiving PR and issue events.
    const { data: relayClaimed } = await getServiceClient()
      .from("forge_relay_installations")
      .select("id")
      .eq("installation_id", installationId)
      .limit(1)
      .maybeSingle();
    if (relayClaimed) {
      console.error(
        "[git/github/setup] installation is claimed by a forge-relay instance",
      );
      return applyCookies(
        NextResponse.redirect(new URL(`${base}&git=error`, origin)),
      );
    }
    const account = await getInstallationAccount(installationId);
    const connectionId = await upsertGithubConnection({
      // `state.userId` rather than `sessionUserId`: the guard above has them
      // made equal, and this is typed `string`.
      userId: state.userId,
      installationId,
      accountLogin: account?.login ?? null,
      accountType: account?.type ?? null,
      repositorySelection: account?.repositorySelection ?? null,
    });
    // The wizard needs the login id to open the repository selector
    // on the return; the account settings don't do anything about it.
    const suffix =
      isAccount && !isWizard
        ? "&git=connected"
        : `&git=connected&connection=${encodeURIComponent(connectionId)}`;
    return applyCookies(
      NextResponse.redirect(new URL(`${base}${suffix}`, origin)),
    );
  } catch (err) {
    // Including `GithubInstallationOwnedByAnotherUserError`: the screen says
    // “error”, and nothing more — especially not who owns the installation.
    console.error("[git/github/setup] failed:", err);
    return applyCookies(
      NextResponse.redirect(new URL(`${base}&git=error`, origin)),
    );
  }
}
