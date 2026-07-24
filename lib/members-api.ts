"use client";

import type { MembersResponse } from "./types";
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
      (data as { error?: string } | null)?.error || text.trim() || "Request failed";
    throw new Error(message);
  }
  return data as T;
}

export async function fetchMembersApi(projectId: string): Promise<MembersResponse> {
  return parseJson<MembersResponse>(await fetch(`/api/projects/${projectId}/members`));
}

export async function inviteMemberApi(projectId: string, email: string): Promise<void> {
  // L'email n'est JAMAIS envoyé — seulement le fait qu'une invitation part.
  trackEvent("project_member_invited", {});
  await parseJson(
    await fetch(`/api/projects/${projectId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
  );
}

export async function cancelInvitationApi(
  projectId: string,
  invitationId: string
): Promise<void> {
  await parseJson(
    await fetch(
      `/api/projects/${projectId}/members?invitationId=${encodeURIComponent(invitationId)}`,
      { method: "DELETE" }
    )
  );
}

export async function removeMemberApi(projectId: string, userId: string): Promise<void> {
  trackEvent("project_member_removed", {});
  await parseJson(
    await fetch(
      `/api/projects/${projectId}/members?userId=${encodeURIComponent(userId)}`,
      { method: "DELETE" }
    )
  );
}
