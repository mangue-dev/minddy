import { type NextRequest, NextResponse } from "next/server";

import { isManagedForgeEnabled } from "@/lib/managed-services";
import { canonicalAppOrigin } from "@/lib/server/app-origin";
import { exchangeGitlabCode, getGitlabUser } from "@/lib/server/git/gitlab-app";
import {
  createGitlabTokenDelivery,
  verifyCloudGitlabState,
} from "@/lib/server/forge-relay/gitlab-broker";
import { relayCallbackPage } from "@/lib/server/forge-relay/callback-page";

/**
 * `GET /api/relay/gitlab/callback` — the redirect URI registered on Cloud's
 * GitLab app for RELAYED instances. Cloud completes the OAuth exchange, parks
 * the token pair as a single-consumption delivery, and bounces the browser
 * back to the instance, which fetches it over the authenticated channel. The
 * refresh token transits Cloud ONCE; refreshes then happen instance-side.
 */
export async function GET(request: NextRequest) {
  if (!isManagedForgeEnabled()) {
    return NextResponse.json({ error: "Managed forge relay is not configured" }, { status: 503 });
  }
  const { searchParams } = request.nextUrl;
  const state = verifyCloudGitlabState(searchParams.get("state"));
  const code = searchParams.get("code");

  const fail = (detail: string, status = 400) =>
    relayCallbackPage({
      title: "GitLab connection failed",
      detail: `${detail} Go back to your minddy instance and restart the connection.`,
      status,
    });

  if (!state || !code) return fail("This connection request is invalid or expired.");

  try {
    const tokens = await exchangeGitlabCode({
      code,
      redirectUri: `${canonicalAppOrigin()}/api/relay/gitlab/callback`,
    });
    const user = await getGitlabUser(tokens.accessToken);
    const deliveryId = await createGitlabTokenDelivery({
      instanceId: state.instanceId,
      delivery: {
        userId: state.userId,
        account: { id: user.id, login: user.username, avatarUrl: null },
        tokens,
      },
    });

    const returnUrl = new URL(
      `/api/git/gitlab/relay-callback?delivery=${encodeURIComponent(deliveryId)}`,
      state.callbackOrigin,
    );
    if (state.returnPath) {
      returnUrl.searchParams.set("return", state.returnPath);
    }
    return relayCallbackPage({
      title: "GitLab connected",
      detail: "Returning to your minddy instance…",
      status: 200,
      returnUrl,
    });
  } catch (err) {
    console.error("[relay/gitlab/callback] failed:", err);
    return fail("GitLab refused the connection.");
  }
}
