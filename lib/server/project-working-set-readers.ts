import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Invitation, Issue, Member, MembersResponse, Objective } from "@/lib/types";
import { getServiceClient } from "@/lib/supabase-service";
import { fetchAuthUsersById, toNamed } from "./auth-users";
import { fetchAvatarSeeds } from "./avatar-seeds";
import { CompleteScopedRowsError, readCompleteScopedRows } from "./complete-scoped-rows";
import { ISSUE_SELECT } from "./issue-mapper";
import { issueStore } from "./issue-store";
import { objectiveStore } from "./objective-store";
import { buildProjectIssueResponse } from "./project-issue-response";
import {
  decryptInvitationEmail, legacyInvitationEmailColumns, missingInvitationEncryptionSchema,
  type InvitationEmailColumns,
} from "./encryption/invitation-email";

export type ProjectWorkingSetAuth = { supabase: SupabaseClient; user: { id: string } };
export type ProjectWorkingSetReadResult<T> = { ok: true; data: T } |
  { ok: false; status: 404 | 500; errorKey: "databaseError" | "projectNotFound" };
const BATCH_SIZE = 1000;
const databaseError = { ok: false, status: 500, errorKey: "databaseError" } as const;
const projectNotFound = { ok: false, status: 404, errorKey: "projectNotFound" } as const;
type IdentifiedRow = Record<string, unknown> & { id: string };

function compareNumber(a: unknown, b: unknown): number {
  const value = (item: unknown) => {
    if (item === null) return Infinity;
    if (typeof item !== "number" || Number.isNaN(item)) throw new Error("Invalid issue ordering");
    return item;
  };
  const left = value(a), right = value(b);
  return left === right ? 0 : left < right ? -1 : 1;
}
function compareDate(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

/** The ordinary project issue DTO, including complete issue-level resource counts. */
export async function loadProjectIssues(auth: ProjectWorkingSetAuth, projectId: string): Promise<ProjectWorkingSetReadResult<Issue[]>> {
  try {
    // Keep the existing independent issue/count reads parallel. Resource counts
    // deliberately remain best effort; unavailable counts do not hide a board.
    const [issues, resources] = await Promise.all([
      readCompleteScopedRows<IdentifiedRow>((after) => {
        let query = issueStore(auth.supabase, auth.user.id).select(ISSUE_SELECT, { count: "exact" })
          .eq("project_id", projectId).order("id", { ascending: true }).limit(BATCH_SIZE);
        if (after) query = query.gt("id", after);
        return query;
      }, (row) => row.id),
      readCompleteScopedRows<{ id: string; issue_id: string | null }>((after) => {
        let query = auth.supabase.from("attachments").select("id, issue_id", { count: "exact" })
          .eq("project_id", projectId).is("comment_id", null).order("id", { ascending: true }).limit(BATCH_SIZE);
        if (after) query = query.gt("id", after);
        return query;
      }, (row) => row.id).catch(() => {
        console.error("[api/issues] resource counts unavailable");
        return [];
      }),
    ]);
    issues.sort((a, b) => compareNumber(a.position, b.position) || compareNumber(a.number, b.number) || compareDate(a.id, b.id));
    return { ok: true, data: buildProjectIssueResponse(issues, resources) as unknown as Issue[] };
  } catch {
    console.error("[api/issues] complete list failed");
    return databaseError;
  }
}

/** Preserve the ordinary decrypted objective projection and creation order. */
export async function loadProjectObjectives(auth: ProjectWorkingSetAuth, projectId: string): Promise<ProjectWorkingSetReadResult<Objective[]>> {
  try {
    const rows = await readCompleteScopedRows<Objective>((after) => {
      let query = objectiveStore(auth.supabase, auth.user.id).select("*", { count: "exact" })
        .eq("project_id", projectId).order("id", { ascending: true }).limit(BATCH_SIZE);
      if (after) query = query.gt("id", after);
      return query;
    }, (row) => row.id);
    rows.sort((a, b) => compareDate(a.created_at, b.created_at) || compareDate(a.id, b.id));
    return { ok: true, data: rows };
  } catch {
    console.error("[api/objectives] complete list failed");
    return databaseError;
  }
}

type InvitationRow = InvitationEmailColumns & { id: string; project_id: string; status: string; created_at: string };
type MembershipRow = { user_id: string; role: string; created_at: string };

/** Service-role member enrichment retains the ordinary living-project ACL. */
export async function loadProjectMembers(auth: ProjectWorkingSetAuth, projectId: string): Promise<ProjectWorkingSetReadResult<MembersResponse>> {
  try {
    const service = getServiceClient();
    const expiresAfter = new Date().toISOString();
    const invitations = (columns: string) => readCompleteScopedRows<InvitationRow>((after) => {
      let query = service.from("project_invitations").select(columns, { count: "exact" })
        .eq("project_id", projectId).eq("status", "pending").gt("expires_at", expiresAfter)
        .order("id", { ascending: true }).limit(BATCH_SIZE);
      if (after) query = query.gt("id", after);
      return query.returns<InvitationRow[]>();
    }, (row) => row.id);
    const loadInvitations = async () => {
      try {
        return await invitations("id, project_id, invited_email, invited_email_ciphertext, invited_email_blind_index, encryption_version, status, created_at");
      } catch (error) {
        if (!(error instanceof CompleteScopedRowsError) || !missingInvitationEncryptionSchema(error.databaseError)) throw error;
        return (await invitations("id, project_id, invited_email, status, created_at")).map(legacyInvitationEmailColumns);
      }
    };
    const [projectResult, memberRows, inviteRows] = await Promise.all([
      service.from("projects").select("owner_id, deleted_at").eq("id", projectId).maybeSingle(),
      readCompleteScopedRows<MembershipRow>((after) => {
        let query = service.from("project_members").select("user_id, role, created_at", { count: "exact" })
          .eq("project_id", projectId).order("user_id", { ascending: true }).limit(BATCH_SIZE);
        if (after) query = query.gt("user_id", after);
        return query;
      }, (row) => row.user_id),
      loadInvitations(),
    ]);
    // A failed metadata/member read cannot masquerade as an absent project or
    // a successful owner-only collection. Actual absence or access denial remains a 404 response.
    if (projectResult.error) return databaseError;
    const project = projectResult.data;
    if (!project || project.deleted_at) return projectNotFound;
    const ownerId = project.owner_id as string;
    const isOwner = ownerId === auth.user.id;
    if (!isOwner && !memberRows.some((member) => member.user_id === auth.user.id)) return projectNotFound;
    memberRows.sort((a, b) => compareDate(a.created_at, b.created_at) || compareDate(a.user_id, b.user_id));
    inviteRows.sort((a, b) => compareDate(b.created_at, a.created_at) || compareDate(a.id, b.id));
    const pending: Invitation[] = isOwner ? await Promise.all(inviteRows.map(async (row) => ({
      id: row.id, project_id: row.project_id,
      invited_email: await decryptInvitationEmail(row, { actorId: auth.user.id, reason: "invitation_list" }),
      status: row.status, created_at: row.created_at,
    }))) : [];
    const memberIds = [ownerId, ...memberRows.map((member) => member.user_id)];
    const [users, seeds] = await Promise.all([fetchAuthUsersById(service, memberIds), fetchAvatarSeeds(service, memberIds)]);
    const members: Member[] = [{ user_id: ownerId, ...toNamed(users.get(ownerId)), avatar_seed: seeds.get(ownerId) ?? ownerId,
      role: "owner", is_owner: true },
    ...memberRows.map((member) => ({ user_id: member.user_id, ...toNamed(users.get(member.user_id)),
      avatar_seed: seeds.get(member.user_id) ?? member.user_id, role: "member" as const, is_owner: false }))];
    return { ok: true, data: { members, invitations: pending, isOwner } };
  } catch {
    console.error("[api/members] complete list failed");
    return databaseError;
  }
}
