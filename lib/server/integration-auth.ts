import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import {
  INTEGRATION_KEY_PREFIX,
  hashIntegrationKey,
} from "@/lib/server/integration-key";
import { afterOrNow } from "@/lib/server/after-safe";

/**
 * Integration key authentication for public API (/api/v1/…,
 * server-to-server, Authorization: Bearer mdy_…). The key uniquely identifies
 * the integration and therefore the project. Unlike app routes,
 * errors are in plain English with stable codes — no i18n.
 */

export interface AuthedIntegration {
  id: string;
  project_id: string;
  name: string;
  /** Dedicated use of the key — each /api/v1 endpoint verifies its own. */
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

/** Public API error response: { error: { code, message } }. */
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
  // Unknown key and revoked key are intentionally indistinguishable.
  if (!integration) return { ok: false, response: invalidKey() };

  const { data: project } = await service
    .from("projects")
    .select("id, name, key")
    .eq("id", integration.project_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) return { ok: false, response: invalidKey() };

  // A usual timestamp does not delay the request: it leaves AFTER the response,
  // but attached to the invocation - detached, he would die in the frost of the lambda.
  const usedAt = new Date().toISOString();
  afterOrNow(async () => {
    const { error } = await service
      .from("integrations")
      .update({ last_used_at: usedAt })
      .eq("id", integration.id);
    if (error) console.error("[integration-auth] last_used_at:", error.message);
  });

  return { ok: true, integration: integration as AuthedIntegration, project };
}

/** Usage guard: an issues key does not leave feedback and vice versa.
 The message points to the correct endpoint for deadlock-free DX. */
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
