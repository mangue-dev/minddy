"use client";

import { fetchClientRead } from "./client-read";

import type { MyInvitation } from "./types";
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

export async function fetchMyInvitationsApi(signal?: AbortSignal): Promise<MyInvitation[]> {
  return parseJson<MyInvitation[]>(await fetchClientRead("/api/projects/invitations", { signal }));
}

/** Shared lightweight options, without importing the invitation UI or toast. */
export const myInvitationsQueryOptions = {
  queryKey: ["my-invitations"] as const,
  queryFn: ({ signal }: { signal: AbortSignal }) => fetchMyInvitationsApi(signal),
};

export async function respondInvitationApi(
  invitationId: string,
  action: "accept" | "reject"
): Promise<{ acceptedProjectId: string | null }> {
  trackEvent("project_invitation_responded", {
    response: action === "accept" ? "accepted" : "declined",
  });
  return parseJson<{ acceptedProjectId: string | null }>(
    await fetch("/api/projects/invitations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitationId, action }),
    })
  );
}
