import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { generateIntegrationKey } from "@/lib/server/integration-key";

/**
 * Gestion des intégrations d'un projet (API Feedback). Écritures via le
 * service client — les routes appelantes DOIVENT avoir vérifié que l'acteur
 * est owner du projet. key_hash ne sort jamais d'ici.
 */

export const INTEGRATION_SUMMARY_SELECT =
  "id, name, key_prefix, created_at, last_used_at, revoked_at";

export interface IntegrationSummary {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const MAX_NAME_LENGTH = 60;

export async function listIntegrations(
  projectId: string
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
  return (data ?? []) as IntegrationSummary[];
}

export async function createIntegration({
  projectId,
  actorId,
  name,
}: {
  projectId: string;
  actorId: string;
  name: unknown;
}): Promise<
  | { ok: true; integration: IntegrationSummary; key: string }
  | { ok: false; status: number; errorKey: "integrationNameRequired" | "databaseError" }
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
  return { ok: true, integration: data as IntegrationSummary, key };
}

export async function revokeIntegration({
  projectId,
  integrationId,
}: {
  projectId: string;
  integrationId: string;
}): Promise<
  | { ok: true }
  | { ok: false; status: number; errorKey: "integrationNotFound" | "databaseError" }
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
