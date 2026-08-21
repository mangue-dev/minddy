import "server-only";

import crypto from "node:crypto";

import { getServiceClient } from "@/lib/supabase-service";
import { isManagedForgeEnabled } from "@/lib/managed-services";
import { decryptForgeToken } from "@/lib/server/git/token-crypto";

/**
 * GitHub webhook fan-out, Cloud side (docs/managed-forge-relay-plan.md,
 * "Webhook relay").
 *
 * The official app has ONE webhook URL — Cloud's. Every delivery whose
 * installation is claimed by a relayed instance is enqueued verbatim and
 * fanned out to that instance's registered endpoint:
 *
 * - the `X-GitHub-Delivery` GUID is PRESERVED, so the instance-side dedup
 *   (`forge_webhook_deliveries`) keeps working unchanged;
 * - the payload is re-signed with the instance-generated webhook secret
 *   (HMAC-SHA256, same header format as GitHub) — Cloud cannot derive it,
 *   the instance pushed it over the authenticated channel;
 * - delivery semantics are AT-LEAST-ONCE: retry with backoff (5 attempts over
 *   ~2h), dead-letter after exhaustion; a duplicate enqueue is absorbed by
 *   the unique constraint.
 */

const BACKOFF_MINUTES = [1, 5, 15, 30, 60];
const MAX_ATTEMPTS = BACKOFF_MINUTES.length;

interface EnqueueRow {
  instance_id: string;
}

/**
 * Resolves the target instance(s) of a raw webhook payload from its
 * installation id and enqueues one delivery per claimed installation.
 * Best-effort and silent for unclaimed installations (Cloud's own).
 */
export async function enqueueRelayDeliveryForPayload(input: {
  provider: string;
  event: string | null;
  deliveryGuid: string | null;
  rawBody: string;
}): Promise<string | null> {
  if (!input.deliveryGuid) return null;
  let installationId: unknown;
  try {
    installationId = (JSON.parse(input.rawBody) as { installation?: { id?: unknown } })
      .installation?.id;
  } catch {
    return null;
  }
  if (typeof installationId !== "number" || !Number.isSafeInteger(installationId)) {
    return null;
  }

  const supabase = getServiceClient();
  const { data: claims } = await supabase
    .from("forge_relay_installations")
    .select("instance_id")
    .eq("installation_id", installationId);
  const instances = (claims ?? []) as EnqueueRow[];
  if (instances.length === 0) return null;

  for (const claim of instances) {
    await supabase.from("forge_relay_deliveries").upsert(
      {
        instance_id: claim.instance_id,
        provider: input.provider,
        delivery_guid: input.deliveryGuid,
        event: input.event,
        payload: input.rawBody,
      },
      { onConflict: "instance_id,provider,delivery_guid", ignoreDuplicates: true },
    );
  }
  return instances[0]?.instance_id ?? null;
}

export interface FanoutOutcome {
  processed: number;
  delivered: number;
  dead: number;
}

/**
 * Enqueues one delivery for a KNOWN instance — the GitLab relay webhook
 * resolves repo → instance itself (via the link mirror) before calling this.
 */
export async function enqueueRelayDeliveryForProvider(input: {
  provider: string;
  instanceId: string;
  event: string | null;
  deliveryGuid: string | null;
  rawBody: string;
}): Promise<boolean> {
  if (!input.deliveryGuid) return false;
  const { error } = await getServiceClient()
    .from("forge_relay_deliveries")
    .upsert(
      {
        instance_id: input.instanceId,
        provider: input.provider,
        delivery_guid: input.deliveryGuid,
        event: input.event,
        payload: input.rawBody,
      },
      { onConflict: "instance_id,provider,delivery_guid", ignoreDuplicates: true },
    );
  return !error;
}

function fanoutSignature(secret: string, rawBody: string): string {
  return (
    "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex")
  );
}

/** Provider-specific fan-out headers. GitLab deliveries carry the per-repo
 * secret in `X-Gitlab-Token` — exactly what the instance receiver verifies. */
function fanoutHeaders(input: {
  provider: string;
  secret: string;
  guid: string;
  event: string | null;
  rawBody: string;
}): Record<string, string> {
  if (input.provider === "gitlab") {
    return {
      "Content-Type": "application/json",
      "X-Gitlab-Token": input.secret,
      ...(input.event ? { "X-Gitlab-Event": input.event } : {}),
      "X-Gitlab-Event-UUID": input.guid,
      "X-Minddy-Relay": "1",
    };
  }
  return {
    "Content-Type": "application/json",
    "X-GitHub-Delivery": input.guid,
    ...(input.event ? { "X-GitHub-Event": input.event } : {}),
    "X-Hub-Signature-256": fanoutSignature(input.secret, input.rawBody),
    "X-Minddy-Relay": "1",
  };
}

/**
 * Delivers every due pending delivery. Called by the cron route. Concurrent
 * passes are SAFE: every terminal update is a compare-and-set on
 * (status, attempts), so attempts advance once and outcomes are counted once
 * even when two workers race. Two workers may still both POST the same row —
 * that is the at-least-once contract, absorbed by the instance's GUID dedup.
 */
export async function processDueRelayDeliveries(limit = 25): Promise<FanoutOutcome> {
  const outcome: FanoutOutcome = { processed: 0, delivered: 0, dead: 0 };
  if (!isManagedForgeEnabled()) return outcome;

  const supabase = getServiceClient();
  const { data } = await supabase
    .from("forge_relay_deliveries")
    .select(
      "id, instance_id, provider, delivery_guid, event, payload, status, attempts, forge_relay_instances(webhook_url, webhook_secret_encrypted)",
    )
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at")
    .limit(limit);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    instance_id: string;
    provider: string;
    delivery_guid: string;
    event: string | null;
    payload: string;
    status: string;
    attempts: number;
    forge_relay_instances: {
      webhook_url: string | null;
      webhook_secret_encrypted: string | null;
    } | null;
  }>;

  for (const row of rows) {
    outcome.processed += 1;
    const endpoint = row.forge_relay_instances?.webhook_url ?? null;
    const encryptedSecret =
      row.forge_relay_instances?.webhook_secret_encrypted ?? null;
    const secret = encryptedSecret ? decryptForgeToken(encryptedSecret) : null;

    // Not registered (yet): this pass counts as an attempt on the same
    // backoff ladder as any other failure. Without the cap, a delivery for an
    // endpoint that never registers would retry every minute forever.
    if (!endpoint || !secret) {
      if (await backoffDelivery(supabase, row, "instance webhook endpoint not registered")) {
        outcome.dead += 1;
      }
      continue;
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: fanoutHeaders({
          provider: row.provider,
          secret,
          guid: row.delivery_guid,
          event: row.event,
          rawBody: row.payload,
        }),
        body: row.payload,
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) {
        // Compare-and-set: only the worker that flips THIS pending row at
        // THIS attempt count counts the delivery.
        const { data: written } = await supabase
          .from("forge_relay_deliveries")
          .update({ status: "delivered", delivered_at: new Date().toISOString(), last_error: null })
          .eq("id", row.id)
          .eq("status", "pending")
          .select("id");
        if (written?.length) outcome.delivered += 1;
        continue;
      }
      throw new Error(`endpoint responded ${response.status}`);
    } catch (err) {
      const dead = await backoffDelivery(
        supabase,
        row,
        (err as Error).message.slice(0, 500),
      );
      if (dead) outcome.dead += 1;
    }
  }

  return outcome;
}

/**
 * One failed attempt: advances `attempts` under a compare-and-set on the
 * values this worker read (the loser of a race writes nothing), backs off on
 * the ladder, and dead-letters after exhaustion. Returns true when THIS write
 * killed the delivery.
 */
async function backoffDelivery(
  supabase: ReturnType<typeof getServiceClient>,
  row: { id: string; status: string; attempts: number },
  error: string,
): Promise<boolean> {
  const attempts = row.attempts + 1;
  const dead = attempts >= MAX_ATTEMPTS;
  const backoffMinutes = BACKOFF_MINUTES[Math.min(attempts - 1, MAX_ATTEMPTS - 1)];
  const { data: written } = await supabase
    .from("forge_relay_deliveries")
    .update({
      status: dead ? "dead" : "pending",
      attempts,
      last_error: error,
      next_attempt_at: new Date(Date.now() + backoffMinutes * 60_000).toISOString(),
    })
    .eq("id", row.id)
    .eq("status", "pending")
    .eq("attempts", row.attempts)
    .select("id");
  return Boolean(written?.length) && dead;
}

export interface RelayDeliveryRecord {
  id: string;
  provider: string;
  delivery_guid: string;
  event: string | null;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  delivered_at: string | null;
}

/** How long finished deliveries (delivered or dead) stay queryable. */
const FINISHED_RETENTION_MS = 7 * 24 * 60 * 60_000;

/**
 * Queue retention: delivered and dead-lettered rows leave after a week. Dead
 * letters are the incident-response record, so they age out SLOWLY; pending
 * rows are never touched. Called by the cron route alongside the worker.
 */
export async function pruneFinishedRelayDeliveries(): Promise<number> {
  const cutoff = new Date(Date.now() - FINISHED_RETENTION_MS).toISOString();
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("forge_relay_deliveries")
    .delete()
    .in("status", ["delivered", "dead"])
    .lt("created_at", cutoff)
    .select("id");
  return ((data ?? []) as unknown[]).length;
}

/** Per-instance delivery dashboard (admin). */
export async function listRelayDeliveries(input: {
  instanceId?: string;
  limit?: number;
}): Promise<RelayDeliveryRecord[]> {
  const supabase = getServiceClient();
  let query = supabase
    .from("forge_relay_deliveries")
    .select(
      "id, provider, delivery_guid, event, status, attempts, last_error, created_at, delivered_at",
    )
    .order("created_at", { ascending: false })
    .limit(Math.min(input.limit ?? 50, 200));
  if (input.instanceId) query = query.eq("instance_id", input.instanceId);
  const { data } = await query;
  return (data ?? []) as RelayDeliveryRecord[];
}
