import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { isManagedForgeEnabled } from "@/lib/managed-services";
import { decryptForgeToken } from "@/lib/server/git/token-crypto";
import { enqueueRelayDeliveryForProvider } from "@/lib/server/forge-relay/fanout";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * `POST /api/relay/gitlab/webhook` — the URL GitLab hooks point at in relay
 * mode. Cloud resolves the repository against the link mirror, verifies the
 * per-repo `X-Gitlab-Token` (shared by the instance at hook-registration time
 * and on rotation), and enqueues a fan-out delivery that the worker re-signs
 * with the SAME secret — so the instance verification path is unchanged.
 */
export async function POST(request: NextRequest) {
  if (!isManagedForgeEnabled()) {
    return NextResponse.json({ error: "Managed forge relay is not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const token = request.headers.get("x-gitlab-token");
  let repo: string | null = null;
  try {
    const payload = JSON.parse(rawBody) as { project?: { path_with_namespace?: unknown } };
    if (typeof payload.project?.path_with_namespace === "string") {
      repo = payload.project.path_with_namespace;
    }
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  if (!repo || !token) {
    return NextResponse.json({ error: "unknown repository" }, { status: 404 });
  }

  const supabase = getServiceClient();
  const { data: mirrors } = await supabase
    .from("forge_relay_link_mirror")
    .select("instance_id, webhook_secret_encrypted")
    .eq("provider", "gitlab")
    .eq("repo_full_name", repo);
  const rows = (mirrors ?? []) as Array<{
    instance_id: string;
    webhook_secret_encrypted: string | null;
  }>;

  // Constant-time comparison against every mirror row of this repository,
  // fail-closed on any mismatch (same contract as the instance receiver).
  const provided = Buffer.from(token);
  const authorized = rows.filter((row) => {
    if (!row.webhook_secret_encrypted) return false;
    const secret = decryptForgeToken(row.webhook_secret_encrypted);
    if (!secret) return false;
    const computed = Buffer.from(secret);
    return (
      provided.length === computed.length && crypto.timingSafeEqual(provided, computed)
    );
  });
  if (authorized.length === 0) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  for (const row of authorized) {
    await enqueueRelayDeliveryForProvider({
      provider: "gitlab",
      instanceId: row.instance_id,
      event: request.headers.get("x-gitlab-event"),
      deliveryGuid: request.headers.get("x-gitlab-event-uuid"),
      rawBody,
    });
  }
  return NextResponse.json({ ok: true, relayed: authorized.length });
}
