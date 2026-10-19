"use client";

import { fetchClientRead } from "./client-read";
import { apiErrorCode, HttpResponseError } from "./backend-availability";

import type { Collaborator, MembersResponse } from "./types";
import type { MemberRole } from "./project-roles";
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
    throw new HttpResponseError(message, response.status, apiErrorCode(data));
  }
  return data as T;
}

export async function fetchMembersApi(projectId: string, signal?: AbortSignal): Promise<MembersResponse> {
  return parseJson<MembersResponse>(await fetchClientRead(`/api/projects/${projectId}/members`, { signal }));
}

export interface MemberAccessInput {
  role: MemberRole;
  /** Reader-only comment option; ignored by the server for members. */
  can_comment: boolean;
}

export async function inviteMemberApi(
  projectId: string,
  email: string,
  access: MemberAccessInput = { role: "member", can_comment: false }
): Promise<void> {
  // The email is NEVER sent — only that an invitation goes out.
  trackEvent("project_member_invited", {});
  await parseJson(
    await fetch(`/api/projects/${projectId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        role: access.role,
        can_comment: access.role === "reader" && access.can_comment,
      }),
    })
  );
}

/**
 * Owner-only: invite someone who already joined another of your projects, by
 * account (MIN-689). The server resolves and checks their address.
 */
export async function inviteCollaboratorApi(
  projectId: string,
  userId: string,
  access: MemberAccessInput = { role: "member", can_comment: false }
): Promise<void> {
  trackEvent("project_member_invited", {});
  await parseJson(
    await fetch(`/api/projects/${projectId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        role: access.role,
        can_comment: access.role === "reader" && access.can_comment,
      }),
    })
  );
}

/** The people who joined one of your projects — the wizard proposes them by name. */
export async function fetchCollaboratorsApi(signal?: AbortSignal): Promise<Collaborator[]> {
  const data = await parseJson<{ collaborators: Collaborator[] }>(
    await fetchClientRead("/api/me/collaborators", { signal })
  );
  return data.collaborators;
}

async function patchMembers<T>(projectId: string, body: Record<string, unknown>): Promise<T> {
  return parseJson<T>(
    await fetch(`/api/projects/${projectId}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

/** Owner-only: change a member's role, or a reader's comment option. */
export async function updateMemberRoleApi(
  projectId: string,
  userId: string,
  access: MemberAccessInput
): Promise<{ unassigned?: number }> {
  return patchMembers(projectId, {
    userId,
    role: access.role,
    can_comment: access.role === "reader" && access.can_comment,
  });
}

/** Owner-only: change the role a pending invitation grants on acceptance. */
export async function updateInvitationRoleApi(
  projectId: string,
  invitationId: string,
  access: MemberAccessInput
): Promise<void> {
  await patchMembers(projectId, {
    invitationId,
    role: access.role,
    can_comment: access.role === "reader" && access.can_comment,
  });
}

/** Owner-only: hand ownership to an existing member. */
export async function transferOwnershipApi(
  projectId: string,
  userId: string
): Promise<{ disabledRoutines: number }> {
  const result = await patchMembers<{ disabledRoutines?: number }>(projectId, {
    transferTo: userId,
  });
  return { disabledRoutines: result?.disabledRoutines ?? 0 };
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
