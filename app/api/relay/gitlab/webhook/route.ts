import { NextResponse, type NextRequest } from "next/server";

import { isManagedForgeEnabled } from "@/lib/managed-services";
import { enqueueRelayDeliveryForProvider } from "@/lib/server/forge-relay/fanout";
import { gitlabHookTokenDigest } from "@/lib/server/forge-relay/gitlab-broker";
import { readBoundedRequestBody } from "@/lib/server/forge-relay/request-body";
import { getServiceClient } from "@/lib/supabase-service";

export const RELAY_GITLAB_WEBHOOK_MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * `POST /api/relay/gitlab/webhook` — the URL GitLab hooks point at in relay
 * mode. Cloud resolves the repository against the link mirror, verifies the
 * per-repo `X-Gitlab-Token` (shared by the instance at hook-registration time
 * and on rotation), and enqueues a fan-out delivery that the worker re-signs
 * with the SAME secret — so the instance verification path is unchanged.
 *
 * The hook token is authenticated from a keyed digest before the bounded body
 * is parsed. Repository lookup then uses GitLab's stable numeric `project.id`;
 * the mutable path is checked only as authenticated metadata. Every token or
 * repository refusal answers the same 401, avoiding a name or id oracle.
 */
export async function POST(request: NextRequest) {
  if (!isManagedForgeEnabled()) {
    return NextResponse.json({ error: "Managed forge relay is not configured" }, { status: 503 });
  }

  const token = request.headers.get("x-gitlab-token");
  const tokenDigest = gitlabHookTokenDigest(token ?? "");
  const supabase = getServiceClient();
  const { data: candidates } = await supabase
    .from("forge_relay_link_mirror")
    .select("instance_id, external_repo_id, repo_full_name")
    .eq("provider", "gitlab")
    .eq("webhook_secret_digest", tokenDigest);
  const authenticated = (candidates ?? []) as Array<{
    instance_id: string;
    external_repo_id: string;
    repo_full_name: string;
  }>;
  if (!token || authenticated.length === 0) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  const incoming = await readBoundedRequestBody(request, RELAY_GITLAB_WEBHOOK_MAX_BODY_BYTES);
  if (!incoming.ok) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }
  const rawBody = incoming.body;
  let repoId: string | null = null;
  let repo: string | null = null;
  try {
    const payload = JSON.parse(rawBody) as {
      project?: { id?: unknown; path_with_namespace?: unknown };
    };
    if (
      typeof payload.project?.id === "number" &&
      Number.isSafeInteger(payload.project.id) &&
      payload.project.id > 0
    ) {
      repoId = String(payload.project.id);
    } else if (
      typeof payload.project?.id === "string" &&
      /^[1-9][0-9]*$/.test(payload.project.id)
    ) {
      repoId = payload.project.id;
    }
    if (typeof payload.project?.path_with_namespace === "string") {
      repo = payload.project.path_with_namespace;
    }
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  if (!repoId || !repo) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const authorized = authenticated.filter(
    (row) => row.external_repo_id === repoId && row.repo_full_name === repo,
  );
  if (authorized.length === 0) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  // Fail closed on an enqueue failure: a 503 makes GitLab retry, while a 200
  // here would drop the event for the instance. Already-enqueued rows are
  // absorbed by the queue's unique constraint on re-delivery.
  for (const row of authorized) {
    const enqueued = await enqueueRelayDeliveryForProvider({
      provider: "gitlab",
      instanceId: row.instance_id,
      event: request.headers.get("x-gitlab-event"),
      deliveryGuid: request.headers.get("x-gitlab-event-uuid"),
      rawBody,
    });
    if (!enqueued) {
      console.error(
        `[relay/gitlab/webhook] enqueue failed for instance ${row.instance_id}`,
      );
      return NextResponse.json(
        { error: "relay queue unavailable" },
        { status: 503 },
      );
    }
  }
  return NextResponse.json({ ok: true, relayed: authorized.length });
}
