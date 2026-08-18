"use client";

import type {
  Integration,
  IntegrationKind,
  IntegrationWebhookEvent,
  IntegrationWebhookScope,
} from "./types";
import { trackEvent } from "./analytics";

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      (data as { error?: string } | null)?.error ||
      text.trim() ||
      "Request failed";
    throw new Error(message);
  }
  return data as T;
}

export interface IntegrationsResponse {
  integrations: Integration[];
  isOwner: boolean;
}

export async function fetchIntegrationsApi(
  projectId: string,
): Promise<IntegrationsResponse> {
  return parseJson<IntegrationsResponse>(
    await fetch(`/api/projects/${projectId}/integrations`),
  );
}

/** Returns the plaintext key — shown once, never retrievable again. */
export async function createIntegrationApi(
  projectId: string,
  name: string,
  kind: IntegrationKind,
): Promise<{ integration: Integration; key: string }> {
  trackEvent("integration_added", { kind });
  return parseJson(
    await fetch(`/api/projects/${projectId}/integrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kind }),
    }),
  );
}

/**
 * The prompt for integrating a key that already exists. No credential in it:
 * it names the environment variable, the interface shows the line to paste.
 * This is what allows you to entrust it to Numo without sending a secret.
 */
export async function fetchIntegrationPromptApi(
  projectId: string,
  input: {
    kind: IntegrationKind;
    placement: string;
    webhook: {
      url: string;
      events: IntegrationWebhookEvent[];
      scope: IntegrationWebhookScope;
    } | null;
  },
): Promise<{ prompt: string }> {
  return parseJson(
    await fetch(`/api/projects/${projectId}/integrations/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function updateIntegrationWebhookApi(
  projectId: string,
  integrationId: string,
  config: {
    webhook_url: string | null;
    webhook_events: IntegrationWebhookEvent[];
    webhook_scope: IntegrationWebhookScope;
  },
): Promise<{ integration: Integration }> {
  return parseJson(
    await fetch(
      `/api/projects/${projectId}/integrations/${encodeURIComponent(integrationId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      },
    ),
  );
}

export async function revokeIntegrationApi(
  projectId: string,
  integrationId: string,
): Promise<void> {
  trackEvent("integration_removed", { kind: "unknown" });
  await parseJson(
    await fetch(
      `/api/projects/${projectId}/integrations/${encodeURIComponent(integrationId)}`,
      { method: "DELETE" },
    ),
  );
}
