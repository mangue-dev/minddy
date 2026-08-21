import { type NextRequest, NextResponse } from "next/server";

import { isManagedForgeEnabled } from "@/lib/managed-services";
import { canonicalAppOrigin } from "@/lib/server/app-origin";
import {
  exchangeGithubUserCode,
  getGithubUserAccount,
} from "@/lib/server/git/github-user-auth";
import {
  createUserDelivery,
  pruneExpiredUserDeliveries,
  verifyCloudUserState,
} from "@/lib/server/forge-relay/user-broker";

/**
 * `GET /api/relay/github/user-callback` — the *User authorization callback
 * URL* registered on the official app, for RELAYED instances. Cloud completes
 * the OAuth exchange, parks the token set as a single-consumption delivery,
 * and sends the user's browser back to the instance, which fetches the
 * delivery over the authenticated relay channel. User tokens keep living on
 * the instance; Cloud sees each token once, transiently.
 */
export async function GET(request: NextRequest) {
  if (!isManagedForgeEnabled()) {
    return NextResponse.json({ error: "Managed forge relay is not configured" }, { status: 503 });
  }
  const { searchParams } = request.nextUrl;
  const state = verifyCloudUserState(searchParams.get("state"));
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
      "GitHub authorization failed",
      `<p>${detail}</p><p>Go back to your minddy instance and restart the authorization.</p>`,
      status,
    );

  if (!state || !code) return fail("This authorization request is invalid or expired.");

  try {
    const tokens = await exchangeGithubUserCode({
      code,
      redirectUri: `${canonicalAppOrigin()}/api/relay/github/user-callback`,
    });
    const account = await getGithubUserAccount(tokens.accessToken);
    const deliveryId = await createUserDelivery({
      instanceId: state.instanceId,
      delivery: {
        userId: state.userId,
        account: { id: account.id, login: account.login, avatarUrl: account.avatarUrl },
        tokens,
      },
    });
    void pruneExpiredUserDeliveries();

    // The browser carries only the random delivery id — the tokens travel to
    // the instance over the signed relay channel, not through the browser.
    const returnUrl = new URL(
      `/api/git/github/relay-user-callback?delivery=${encodeURIComponent(deliveryId)}`,
      state.callbackOrigin,
    );
    return page(
      "GitHub authorized",
      `<p>Returning to your minddy instance…</p>
       <p><a href="${returnUrl.toString()}">Continue if nothing happens.</a></p>
       <meta http-equiv="refresh" content="1;url=${returnUrl.toString().replace(/"/g, "&quot;")}">`,
      200,
    );
  } catch (err) {
    console.error("[relay/github/user-callback] failed:", err);
    return fail("GitHub refused the authorization.");
  }
}
