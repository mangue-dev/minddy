import { type NextRequest, NextResponse } from "next/server";

import { isManagedForgeEnabled } from "@/lib/managed-services";
import { canonicalAppOrigin } from "@/lib/server/app-origin";
import { getGithubUserAuthorizeUrl } from "@/lib/server/git/github-user-auth";
import {
  signCloudUserState,
  verifyRelayUserState,
} from "@/lib/server/forge-relay/user-broker";

/**
 * `GET /api/relay/github/user-authorize?instance=<id>&state=<signed>` —
 * browser entry of the user-authorization broker. The self-hosted instance
 * redirects its user here with an Ed25519-signed state (the instance's private
 * key; Cloud holds only the public key). After verification we hand the user
 * to the standard GitHub authorize page with OUR registered callback URL and a
 * Cloud-signed state.
 */
export async function GET(request: NextRequest) {
  if (!isManagedForgeEnabled()) {
    return NextResponse.json({ error: "Managed forge relay is not configured" }, { status: 503 });
  }
  const { searchParams } = request.nextUrl;
  const verified = await verifyRelayUserState(
    searchParams.get("instance"),
    searchParams.get("state"),
  );
  if (!verified) {
    return new NextResponse(
      `<!doctype html><html><body style="font-family:system-ui;max-width:32rem;margin:4rem auto">
        <h1>GitHub authorization failed</h1>
        <p>This authorization request is invalid, expired, or comes from an unknown instance.</p>
        <p>Go back to your minddy instance and restart the authorization.</p>
      </body></html>`,
      { status: 400, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  const cloudState = signCloudUserState({
    instanceId: verified.instanceId,
    userId: verified.userId,
    origin: verified.origin,
    callbackOrigin: verified.callbackOrigin,
  });
  const authorizeUrl = getGithubUserAuthorizeUrl({
    redirectUri: `${canonicalAppOrigin()}/api/relay/github/user-callback`,
    state: cloudState,
  });
  return NextResponse.redirect(authorizeUrl);
}
