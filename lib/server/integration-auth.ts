import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import {
  INTEGRATION_KEY_PREFIX,
  hashIntegrationKey,
} from "@/lib/server/integration-key";

/**
 * Authentification par clé d'intégration pour l'API publique (/api/v1/…,
 * serveur-à-serveur, Authorization: Bearer mdy_…). La clé identifie à elle
 * seule l'intégration et donc le projet. Contrairement aux routes de l'app,
 * les erreurs sont en anglais simple avec des codes stables — pas de i18n.
 */

export interface AuthedIntegration {
  id: string;
  project_id: string;
  name: string;
  /** Usage dédié de la clé — chaque endpoint /api/v1 vérifie le sien. */
  kind: "issues" | "feedback";
}

export interface IntegrationProject {
  id: string;
  name: string;
  key: string;
}

export type IntegrationAuthResult =
  | { ok: true; integration: AuthedIntegration; project: IntegrationProject }
  | { ok: false; response: NextResponse };

/** Réponse d'erreur de l'API publique : { error: { code, message } }. */
export function publicApiError(
  status: number,
  code: string,
  message: string,
  headers?: Record<string, string>
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status, headers });
}

const invalidKey = () =>
  publicApiError(401, "invalid_api_key", "Invalid or revoked API key.");

export async function authenticateIntegration(
  request: NextRequest
): Promise<IntegrationAuthResult> {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return authenticateIntegrationKey(match?.[1]);
}

/** Key-only variant, for server code that holds a key without an incoming
    Bearer header. */
export async function authenticateIntegrationKey(
  key: string | null | undefined
): Promise<IntegrationAuthResult> {
  if (!key || !key.startsWith(INTEGRATION_KEY_PREFIX)) {
    return { ok: false, response: invalidKey() };
  }

  const service = getServiceClient();
  const { data: integration } = await service
    .from("integrations")
    .select("id, project_id, name, kind")
    .eq("key_hash", hashIntegrationKey(key))
    .is("revoked_at", null)
    .maybeSingle();
  // Clé inconnue et clé révoquée sont volontairement indistinguables.
  if (!integration) return { ok: false, response: invalidKey() };

  const { data: project } = await service
    .from("projects")
    .select("id, name, key")
    .eq("id", integration.project_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) return { ok: false, response: invalidKey() };

  // Fire-and-forget : ne pas retarder la requête pour un horodatage d'usage.
  void service
    .from("integrations")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", integration.id)
    .then(({ error }) => {
      if (error) console.error("[integration-auth] last_used_at:", error.message);
    });

  return { ok: true, integration: integration as AuthedIntegration, project };
}

/** Garde d'usage : une clé issues ne dépose pas de feedback et inversement.
    Le message pointe vers le bon endpoint pour une DX sans impasse. */
export function requireIntegrationKind(
  integration: AuthedIntegration,
  expected: "issues" | "feedback"
): NextResponse | null {
  if (integration.kind === expected) return null;
  const hint =
    expected === "feedback"
      ? "This key creates issues directly. Use POST /api/v1/issues with it, or create a feedback key in Settings → Integrations."
      : "This key submits feedback. Use POST /api/v1/feedback with it, or create an issues key in Settings → Integrations.";
  return publicApiError(403, "wrong_key_kind", hint);
}
