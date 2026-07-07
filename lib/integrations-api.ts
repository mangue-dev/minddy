"use client";

import type { Integration } from "./types";

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
      (data as { error?: string } | null)?.error || text.trim() || "Request failed";
    throw new Error(message);
  }
  return data as T;
}

export interface IntegrationsResponse {
  integrations: Integration[];
  isOwner: boolean;
}

export async function fetchIntegrationsApi(
  projectId: string
): Promise<IntegrationsResponse> {
  return parseJson<IntegrationsResponse>(
    await fetch(`/api/projects/${projectId}/integrations`)
  );
}

/** Returns the plaintext key — shown once, never retrievable again. */
export async function createIntegrationApi(
  projectId: string,
  name: string
): Promise<{ integration: Integration; key: string }> {
  return parseJson(
    await fetch(`/api/projects/${projectId}/integrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
  );
}

export async function revokeIntegrationApi(
  projectId: string,
  integrationId: string
): Promise<void> {
  await parseJson(
    await fetch(
      `/api/projects/${projectId}/integrations/${encodeURIComponent(integrationId)}`,
      { method: "DELETE" }
    )
  );
}
