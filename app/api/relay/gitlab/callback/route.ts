import { type NextRequest, NextResponse } from "next/server";

import { isManagedForgeEnabled } from "@/lib/managed-services";
import { canonicalAppOrigin } from "@/lib/server/app-origin";
import { exchangeGitlabCode, getGitlabUser } from "@/lib/server/git/gitlab-app";
import {
  createGitlabTokenDelivery,
  verifyCloudGitlabState,
} from "@/lib/server/forge-relay/gitlab-broker";

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

  const page = (title: string, detail: string, status: number) =>
    new NextResponse(
      `<!doctype html><html><body style="font-family:system-ui;max-width:32rem;margin:4rem auto">
        <h1>${title}</h1>${detail}
      </body></html>`,
      { status, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  const fail = (detail: string, status = 400) =>
    page(
      "GitLab connection failed",
      `<p>${detail}</p><p>Go back to your minddy instance and restart the connection.</p>`,
      status,
    );

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
    return page(
      "GitLab connected",
      `<p>Returning to your minddy instance…</p>
       <p><a href="${returnUrl.toString()}">Continue if nothing happens.</a></p>
       <meta http-equiv="refresh" content="1;url=${returnUrl.toString().replace(/"/g, "&quot;")}">`,
      200,
    );
  } catch (err) {
    console.error("[relay/gitlab/callback] failed:", err);
    return fail("GitLab refused the connection.");
  }
}
