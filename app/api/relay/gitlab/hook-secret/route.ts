import { NextResponse, type NextRequest } from "next/server";

import { isManagedForgeEnabled } from "@/lib/managed-services";
import { verifyRelayRequest } from "@/lib/server/forge-relay/protocol";
import { parseRelayJsonObject } from "@/lib/server/forge-relay/json-body";
import { registerGitlabHookSecret } from "@/lib/server/forge-relay/gitlab-broker";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * `POST /api/relay/gitlab/hook-secret` — the instance shares a per-repo hook
 * secret at hook-registration time and on every rotation (MIN-333 stays in
 * the core; only the sharing moves over the wire). Cloud verifies incoming
 * GitLab deliveries and re-signs the fan-out with this secret.
 */
export async function POST(request: NextRequest) {
  if (!isManagedForgeEnabled()) {
    return NextResponse.json({ error: "Managed forge relay is not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const verification = await verifyRelayRequest({
    method: request.method,
    path: new URL(request.url).pathname,
    headers: request.headers,
    rawBody,
  });
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }

  // A malformed body from an authenticated instance is a 400, not a 500.
  const body = parseRelayJsonObject(rawBody);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const repo = typeof body.repo === "string" ? body.repo : "";
  const secret = typeof body.secret === "string" ? body.secret : "";
  const ok = await registerGitlabHookSecret({
    instanceId: verification.instance.id,
    repo,
    secret,
  });
  if (!ok) {
    return NextResponse.json(
      { error: "repo must be owner/name and secret at least 32 characters" },
      { status: 400 },
    );
  }

  await getServiceClient().from("forge_relay_audit").insert({
    instance_id: verification.instance.id,
    action: "gitlab_hook_secret_registered",
    detail: { repo },
  });
  return NextResponse.json({ ok: true });
}
