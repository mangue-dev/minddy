import { type NextRequest, NextResponse } from "next/server";

import { isManagedForgeEnabled } from "@/lib/managed-services";
import { getGitlabAuthorizeUrl } from "@/lib/server/git/gitlab-app";
import { canonicalAppOrigin } from "@/lib/server/app-origin";
import { verifyInstanceSignedState } from "@/lib/server/forge-relay/user-broker";
import {
  RELAY_GITLAB_STATE_KIND,
  signCloudGitlabState,
} from "@/lib/server/forge-relay/gitlab-broker";

/**
 * `GET /api/relay/gitlab/authorize?instance=<id>&state=<signed>` — browser
 * entry of the GitLab OAuth broker. The instance signs the request with its
 * Ed25519 key; after verification we hand the user to GitLab's authorize page
 * with OUR registered callback URI and a Cloud-signed state.
 */
export async function GET(request: NextRequest) {
  if (!isManagedForgeEnabled()) {
    return NextResponse.json({ error: "Managed forge relay is not configured" }, { status: 503 });
  }
  const { searchParams } = request.nextUrl;
  const verified = await verifyInstanceSignedState(
    searchParams.get("instance"),
    searchParams.get("state"),
    RELAY_GITLAB_STATE_KIND,
  );
  if (!verified) {
    return new NextResponse(
      `<!doctype html><html><body style="font-family:system-ui;max-width:32rem;margin:4rem auto">
        <h1>GitLab connection failed</h1>
        <p>This connection request is invalid, expired, or comes from an unknown instance.</p>
        <p>Go back to your minddy instance and restart the connection.</p>
      </body></html>`,
      { status: 400, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  const cloudState = signCloudGitlabState({
    instanceId: verified.instanceId,
    userId: verified.userId,
    callbackOrigin: verified.callbackOrigin,
  });
  const authorizeUrl = getGitlabAuthorizeUrl({
    redirectUri: `${canonicalAppOrigin()}/api/relay/gitlab/callback`,
    state: cloudState,
  });
  return NextResponse.redirect(authorizeUrl);
}
