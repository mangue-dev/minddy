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
  WEBHOOK_EVENTS,
  type WebhookEvent,
  type WebhookScope,
} from "@/lib/server/webhooks";

/**
 * Gestion des intégrations d'un projet (API Feedback). Écritures via le
 * service client — les routes appelantes DOIVENT avoir vérifié que l'acteur
 * est owner du projet. key_hash ne sort jamais d'ici.
 */

export const INTEGRATION_SUMMARY_SELECT =
  "id, name, kind, key_prefix, created_at, last_used_at, revoked_at, " +
  "webhook_url, webhook_events, webhook_scope, webhook_last_status, webhook_last_at";

// Le kind et son garde vivent en pur avec le contrat d'API qu'ils décrivent
// (lib/feedback/integration-contract.ts) ; réexportés ici pour les appelants.
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

const MAX_NAME_LENGTH = 60;
// Borne classique des URL (elle est persistée puis rejouée à chaque livraison).
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
  return (data ?? []) as unknown as IntegrationSummary[];
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
  return { ok: true, integration: data as unknown as IntegrationSummary, key };
}

export async function updateIntegrationWebhook({
  projectId,
  integrationId,
  input,
}: {
  projectId: string;
  integrationId: string;
  input: Record<string, unknown>;
}): Promise<
  | { ok: true; integration: IntegrationSummary }
  | {
      ok: false;
      status: number;
      errorKey:
        | "webhookInvalidUrl"
        | "webhookInvalidConfig"
        | "webhookIssuesOnly"
        | "integrationNotFound"
        | "databaseError";
    }
> {
  // webhook_url null = webhook désactivé (la config events/scope est conservée).
  let url: string | null = null;
  if (input.webhook_url !== null && input.webhook_url !== undefined) {
    if (typeof input.webhook_url !== "string") {
      return { ok: false, status: 400, errorKey: "webhookInvalidUrl" };
    }
    url = input.webhook_url.trim();
    if (url.length > MAX_WEBHOOK_URL_LENGTH) {
      return { ok: false, status: 400, errorKey: "webhookInvalidUrl" };
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
        throw new Error();
    } catch {
      return { ok: false, status: 400, errorKey: "webhookInvalidUrl" };
    }
  }

  // Plus long que la liste complète des événements = forcément des doublons.
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

  // Un webhook ne porte que des événements d'ISSUE : sur une clé feedback, il
  // n'aurait rien à livrer. On refuse de l'allumer plutôt que de ranger une
  // configuration qui ne partira jamais — l'éteindre, en revanche, reste
  // toujours possible (une clé feedback réglée avant cette règle doit pouvoir
  // se nettoyer).
  if (url) {
    const { data: existing, error: readError } = await service
      .from("integrations")
      .select("kind")
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
  return { ok: true, integration: row as unknown as IntegrationSummary };
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
