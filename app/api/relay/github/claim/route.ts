import { type NextRequest, NextResponse } from "next/server";

import { isManagedForgeEnabled } from "@/lib/managed-services";
import { getServiceClient } from "@/lib/supabase-service";
import { getGithubAppSlug } from "@/lib/server/git/github-app";
import {
  hasPendingRelayClaim,
  isValidClaimCode,
  signRelayClaimState,
} from "@/lib/server/forge-relay/claims";

/**
 * `GET /api/relay/github/claim?instance=<id>&code=<code>` — browser entry of
 * the installation claim flow. The self-hosted instance sends the operator
 * here; after a sanity check (active instance, well-formed single-use code) we
 * redirect to the standard GitHub App installation page with a short-lived
 * signed `state`. The GitHub setup URL then lands back on Cloud, which binds
 * the installation to the claiming instance.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const instanceId = searchParams.get("instance");
  const code = searchParams.get("code");

  const fail = (message: string, status = 400) =>
    new NextResponse(
      `<!doctype html><html><body style="font-family:system-ui;max-width:32rem;margin:4rem auto">
        <h1>GitHub claim failed</h1><p>${message}</p>
        <p>Go back to your minddy instance and restart the connection.</p>
      </body></html>`,
      { status, headers: { "content-type": "text/html; charset=utf-8" } },
    );

  // Same kill switch as every other relay route (GA runbook commitment):
  // with the managed forge off, no claim can even start.
  if (!isManagedForgeEnabled()) {
    return fail("The managed forge relay is not configured on Cloud.", 503);
  }

  if (!instanceId || !isValidClaimCode(code)) {
    return fail("The claim link is malformed.");
  }

  const supabase = getServiceClient();
  const { data: instance } = await supabase
    .from("forge_relay_instances")
    .select("id, name, status")
    .eq("id", instanceId)
    .maybeSingle();
  const instanceRow = instance as { id: string; name: string; status: string } | null;
  if (!instanceRow || instanceRow.status !== "active") {
    return fail("This minddy instance is not a registered relay instance (or was revoked).");
  }
  if (!(await hasPendingRelayClaim({ instanceId, code }))) {
    return fail("This claim was not registered, has expired, or was already used.");
  }

  let slug: string;
  try {
    slug = getGithubAppSlug();
  } catch {
    return fail("The managed GitHub App is not configured on Cloud.");
  }

  const state = signRelayClaimState({ instanceId, code });
  const installUrl = new URL(`https://github.com/apps/${slug}/installations/new`);
  installUrl.searchParams.set("state", state);
  return NextResponse.redirect(installUrl);
}
