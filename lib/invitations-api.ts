"use client";

import type { MyInvitation } from "./types";

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
      (data as { error?: string } | null)?.error || text.trim() || "Requête échouée";
    throw new Error(message);
  }
  return data as T;
}

export async function fetchMyInvitationsApi(): Promise<MyInvitation[]> {
  return parseJson<MyInvitation[]>(await fetch("/api/projects/invitations"));
}

export async function respondInvitationApi(
  invitationId: string,
  action: "accept" | "reject"
): Promise<{ acceptedProjectId: string | null }> {
  return parseJson<{ acceptedProjectId: string | null }>(
    await fetch("/api/projects/invitations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitationId, action }),
    })
  );
}
