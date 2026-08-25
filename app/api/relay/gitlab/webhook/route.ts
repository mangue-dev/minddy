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
 *
 * Repository lookup uses GitLab's stable numeric `project.id`; the mutable
 * path is checked only as metadata after authentication. Every refusal of an
 * authenticated-looking delivery also performs a fixed-width digest compare
 * and answers the same 401, avoiding a name or id existence oracle.
 */
export async function POST(request: NextRequest) {
  if (!isManagedForgeEnabled()) {
    return NextResponse.json({ error: "Managed forge relay is not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const token = request.headers.get("x-gitlab-token");
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

  const supabase = getServiceClient();
  const { data: mirrors } = await supabase
    .from("forge_relay_link_mirror")
    .select("instance_id, repo_full_name, webhook_secret_encrypted")
    .eq("provider", "gitlab")
    .eq("external_repo_id", repoId);
  const rows = (mirrors ?? []) as Array<{
    instance_id: string;
    repo_full_name: string;
    webhook_secret_encrypted: string | null;
  }>;

  // Constant-time comparison against every mirror row of this repository,
  // fail-closed on any mismatch (same contract as the instance receiver).
  // A missing token header lands here too — same verdict as a wrong one.
  const providedDigest = crypto.createHash("sha256").update(token ?? "").digest();
  const authorized = rows.filter((row) => {
    const secret = row.webhook_secret_encrypted
      ? decryptForgeToken(row.webhook_secret_encrypted)
      : null;
    const expectedDigest = crypto
      .createHash("sha256")
      .update(secret ?? "forge-relay-invalid-token")
      .digest();
    return Boolean(token && secret && crypto.timingSafeEqual(providedDigest, expectedDigest));
  });
  if (rows.length === 0) {
    const dummyDigest = crypto
      .createHash("sha256")
      .update("forge-relay-invalid-token")
      .digest();
    crypto.timingSafeEqual(providedDigest, dummyDigest);
  }
  if (authorized.length === 0) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }
  if (authorized.some((row) => row.repo_full_name !== repo)) {
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
