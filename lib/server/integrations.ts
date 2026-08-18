import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { generateIntegrationKey } from "@/lib/server/integration-key";
import {
  isIntegrationKind,
  type IntegrationKind,
} from "@/lib/feedback/integration-contract";
import {
  isWebhookEvent,
  isWebhookScope,
  normalizeWebhookStatus,
  WEBHOOK_EVENTS,
  type WebhookEvent,
  type WebhookScope,
} from "@/lib/server/webhooks";
import { assertPublicHttpUrl } from "@/lib/server/safe-fetch";

/**
 * Management of project integrations (Feedback API). Writes via the
 * customer service — calling routes MUST have verified that the actor
 * is the owner of the project. key_hash never leaves here.
 */

export const INTEGRATION_SUMMARY_SELECT =
  "id, name, kind, key_prefix, created_at, last_used_at, revoked_at, " +
  "webhook_url, webhook_events, webhook_scope, webhook_last_status, webhook_last_at";

// The kind and its guard live in purity with the API contract they describe
// (lib/feedback/integration-contract.ts); re-exported here for callers.
export { isIntegrationKind, type IntegrationKind };

export interface IntegrationSummary {
  id: string;
  name: string;
  kind: IntegrationKind;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  webhook_url: string | null;
  webhook_events: WebhookEvent[];
  webhook_scope: WebhookScope;
  webhook_last_status: string | null;
  webhook_last_at: string | null;
}

/** A row of the table, returned to the caller: the state of the last
 delivery replaces the remote HTTP code (MIN-341). */
function toSummary(row: unknown): IntegrationSummary {
  const raw = row as IntegrationSummary;
  return { ...raw, webhook_last_status: normalizeWebhookStatus(raw.webhook_last_status) };
}

const MAX_NAME_LENGTH = 60;
// Classic URL terminal (it is persisted then replayed on each delivery).
const MAX_WEBHOOK_URL_LENGTH = 2048;

export async function listIntegrations(
  projectId: string,
): Promise<IntegrationSummary[] | null> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("integrations")
    .select(INTEGRATION_SUMMARY_SELECT)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[integrations] list failed:", error.message);
    return null;
  }
  return (data ?? []).map(toSummary);
}

export async function createIntegration({
  projectId,
  actorId,
  name,
  kind,
}: {
  projectId: string;
  actorId: string;
  name: unknown;
  kind: unknown;
}): Promise<
  | { ok: true; integration: IntegrationSummary; key: string }
  | {
      ok: false;
      status: number;
      errorKey: "integrationNameRequired" | "databaseError";
    }
> {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed || trimmed.length > MAX_NAME_LENGTH) {
    return { ok: false, status: 400, errorKey: "integrationNameRequired" };
  }

  const { key, hash, prefix } = generateIntegrationKey();
  const service = getServiceClient();
  const { data, error } = await service
    .from("integrations")
    .insert({
      project_id: projectId,
      name: trimmed,
      kind: isIntegrationKind(kind) ? kind : "issues",
      key_hash: hash,
      key_prefix: prefix,
      created_by: actorId,
    })
    .select(INTEGRATION_SUMMARY_SELECT)
    .single();

  if (error) {
    console.error("[integrations] create failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  return { ok: true, integration: toSummary(data), key };
}

/**
 * Which sets the webhook. A webhook destination is a permanent
 * output channel: everything that passes through the project's exit events goes to
 * the address written there. A prompt injection in a ticket would be enough
 * to make the agent write it — so CHOOSING an address is a human gesture
 * (MIN-341). The agent keeps what doesn't create a channel: turn off the webhook,
 * and set the events and scope of a destination already in place.
 */
export type WebhookActor = "human" | "agent";

export async function updateIntegrationWebhook({
  projectId,
  integrationId,
  input,
  actor,
}: {
  projectId: string;
  integrationId: string;
  input: Record<string, unknown>;
  actor: WebhookActor;
}): Promise<
  | { ok: true; integration: IntegrationSummary }
  | {
      ok: false;
      status: number;
      errorKey:
        | "webhookInvalidUrl"
        | "webhookInvalidConfig"
        | "webhookIssuesOnly"
        | "webhookHumanOnly"
        | "integrationNotFound"
        | "databaseError";
    }
> {
  // webhook_url null = webhook disabled (the events/scope config is preserved).
  let url: string | null = null;
  if (input.webhook_url !== null && input.webhook_url !== undefined) {
    if (typeof input.webhook_url !== "string") {
      return { ok: false, status: 400, errorKey: "webhookInvalidUrl" };
    }
    url = input.webhook_url.trim();
    if (url.length > MAX_WEBHOOK_URL_LENGTH) {
      return { ok: false, status: 400, errorKey: "webhookInvalidUrl" };
    }
    // Same guard as delivery: a URL that we refuse to call has no
    // no reason to be tidy. The check is on the resolved address —
    // `127.0.0.1`, the link-local of the metadata service, the internal network.
    try {
      await assertPublicHttpUrl(url);
    } catch {
      return { ok: false, status: 400, errorKey: "webhookInvalidUrl" };
    }
  }

  // Longer than the complete list of events = necessarily duplicates.
  if (
    !Array.isArray(input.webhook_events) ||
    input.webhook_events.length > WEBHOOK_EVENTS.length ||
    !input.webhook_events.every(isWebhookEvent)
  ) {
    return { ok: false, status: 400, errorKey: "webhookInvalidConfig" };
  }
  if (!isWebhookScope(input.webhook_scope)) {
    return { ok: false, status: 400, errorKey: "webhookInvalidConfig" };
  }

  const service = getServiceClient();

  // A webhook only carries ISSUE events: on a feedback key, it
  // would have nothing to deliver. We refuse to light it rather than put away a
  // configuration that will never go away — turning it off, however, remains
  // always possible (a feedback key set before this rule must be able to
  // se nettoyer).
  if (url) {
    const { data: existing, error: readError } = await service
      .from("integrations")
      .select("kind, webhook_url")
      .eq("id", integrationId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (readError) {
      console.error(
        "[integrations] webhook kind read failed:",
        readError.message,
      );
      return { ok: false, status: 500, errorKey: "databaseError" };
    }
    if (!existing)
      return { ok: false, status: 404, errorKey: "integrationNotFound" };
    if (existing.kind !== "issues") {
      return { ok: false, status: 400, errorKey: "webhookIssuesOnly" };
    }
    // Set a destination, or move it: human gesture only.
    if (actor === "agent" && existing.webhook_url !== url) {
      return { ok: false, status: 403, errorKey: "webhookHumanOnly" };
    }
  }

  const { data, error } = await service
    .from("integrations")
    .update({
      webhook_url: url,
      webhook_events: input.webhook_events,
      webhook_scope: input.webhook_scope,
    })
    .eq("id", integrationId)
    .eq("project_id", projectId)
    .is("revoked_at", null)
    .select(INTEGRATION_SUMMARY_SELECT);

  if (error) {
    console.error("[integrations] webhook update failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  const row = (data ?? [])[0];
  if (!row) return { ok: false, status: 404, errorKey: "integrationNotFound" };
  return { ok: true, integration: toSummary(row) };
}

export async function revokeIntegration({
  projectId,
  integrationId,
}: {
  projectId: string;
  integrationId: string;
}): Promise<
  | { ok: true }
  | {
      ok: false;
      status: number;
      errorKey: "integrationNotFound" | "databaseError";
    }
> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("integrations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", integrationId)
    .eq("project_id", projectId)
    .is("revoked_at", null)
    .select("id");

  if (error) {
    console.error("[integrations] revoke failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  if (!data || data.length === 0) {
    return { ok: false, status: 404, errorKey: "integrationNotFound" };
  }
  return { ok: true };
}
