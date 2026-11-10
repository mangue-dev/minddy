import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const H = vi.hoisted(() => ({
  getProjectAccess: vi.fn(),
  inviteMember: vi.fn(),
  updateMemberRole: vi.fn(),
  updateInvitationRole: vi.fn(),
}));
vi.mock("@/lib/server/project-access", async (original) => ({
  ...await original<typeof import("@/lib/server/project-access")>(),
  getProjectAccess: H.getProjectAccess,
}));
vi.mock("@/lib/server/members", async (original) => ({
  ...await original<typeof import("@/lib/server/members")>(),
  inviteMember: H.inviteMember,
  updateMemberRole: H.updateMemberRole,
  updateInvitationRole: H.updateInvitationRole,
}));

import { executeTool, type ToolContext } from "./execute-tool";

/** Numo sets a member's role as Settings → Members does (MIN-955). */

const PROJECT = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";
const INVITATION = "33333333-3333-4333-8333-333333333333";

function context(): ToolContext {
  return {
    projectId: null,
    requireExplicitProjectTarget: true,
    userId: "owner-1",
    supabase: {} as SupabaseClient,
    service: {} as SupabaseClient,
    locale: "en",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  H.getProjectAccess.mockResolvedValue({
    project: { id: PROJECT, key: "MIN", owner_id: "owner-1" },
    isOwner: true,
    role: "owner",
  });
});

describe("update_member_role (MIN-955)", () => {
  it("demotes a member to reader and reports the issues it unassigned", async () => {
    H.updateMemberRole.mockResolvedValue({ ok: true, role: "reader", canComment: true, unassigned: 3 });
    const result = await executeTool(
      "update_member_role",
      { project_id: PROJECT, user_id: MEMBER, role: "reader", can_comment: true },
      context(),
    );
    expect(H.updateMemberRole).toHaveBeenCalledWith({
      projectId: PROJECT, actorId: "owner-1", userId: MEMBER, role: "reader", canComment: true,
    });
    expect(result).toEqual({
      success: true,
      result: { member: { user_id: MEMBER, role: "reader", can_comment: true }, unassigned_issues: 3 },
    });
  });

  it("never gives a member the reader-only comment option", async () => {
    H.updateMemberRole.mockResolvedValue({ ok: true, role: "member", canComment: false, unassigned: 0 });
    await executeTool(
      "update_member_role",
      { project_id: PROJECT, user_id: MEMBER, role: "member", can_comment: true },
      context(),
    );
    expect(H.updateMemberRole).toHaveBeenCalledWith(expect.objectContaining({ role: "member", canComment: false }));
  });

  it("changes a pending invitation's role", async () => {
    H.updateInvitationRole.mockResolvedValue({ ok: true, role: "reader", canComment: false });
    const result = await executeTool(
      "update_member_role",
      { project_id: PROJECT, invitation_id: INVITATION, role: "reader" },
      context(),
    );
    expect(H.updateInvitationRole).toHaveBeenCalledWith({
      projectId: PROJECT, actorId: "owner-1", invitationId: INVITATION, role: "reader", canComment: false,
    });
    expect(result.success).toBe(true);
  });

  it("asks for exactly one target", async () => {
    for (const args of [
      { project_id: PROJECT, role: "reader" },
      { project_id: PROJECT, role: "reader", user_id: MEMBER, invitation_id: INVITATION },
    ]) {
      const result = await executeTool("update_member_role", args, context());
      expect(result.success, JSON.stringify(args)).toBe(false);
    }
    expect(H.updateMemberRole).not.toHaveBeenCalled();
    expect(H.updateInvitationRole).not.toHaveBeenCalled();
  });

  it("relays the core's refusal for the owner", async () => {
    H.updateMemberRole.mockResolvedValue({ ok: false, status: 400, errorKey: "cannotChangeOwner" });
    const result = await executeTool(
      "update_member_role",
      { project_id: PROJECT, user_id: "owner-1", role: "reader" },
      context(),
    );
    expect(result).toMatchObject({ success: false });
    expect(JSON.stringify(result)).toContain("The project owner's role cannot change.");
  });
});

describe("invite_member with a role (MIN-955)", () => {
  it("invites a reader who may comment", async () => {
    H.inviteMember.mockResolvedValue({
      ok: true,
      invitation: { id: INVITATION, invited_email: "sam@example.test", role: "reader", can_comment: true },
    });
    const result = await executeTool(
      "invite_member",
      { project_id: PROJECT, email: "sam@example.test", role: "reader", can_comment: true },
      context(),
    );
    expect(H.inviteMember).toHaveBeenCalledWith(expect.objectContaining({ role: "reader", canComment: true }));
    expect(result).toMatchObject({
      success: true,
      result: { invitation: { id: INVITATION, role: "reader", can_comment: true } },
    });
  });

  it("invites a member by default, without the comment option", async () => {
    H.inviteMember.mockResolvedValue({
      ok: true,
      invitation: { id: INVITATION, invited_email: "sam@example.test", role: "member", can_comment: false },
    });
    await executeTool("invite_member", { project_id: PROJECT, email: "sam@example.test", can_comment: true }, context());
    expect(H.inviteMember).toHaveBeenCalledWith(expect.objectContaining({ role: "member", canComment: false }));
  });
});
