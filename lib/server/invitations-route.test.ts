import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-325 — to accept an invitation is to register somewhere.
 *
 * The route read the invitation line and registered the caller on the
 * `project_id` AS IT IS IN BASIC, checking only `invited_user_id`.
 * But the line was modifiable by its guest (policy
 * `project_invitations_update_invitee`, deleted by 20261215090000): placing
 * its own `project_id` on another's project was enough to do so. register.
 *
 * The policy is gone, but a policy is reintroduced by distraction. What
 * these tests pinpoint is therefore the in-depth guard, the one which remains true
 * even if the base becomes permissive again: an acceptable invitation is a
 * CONSISTENT invitation — its address is that of the account, and who issued it
 * owns the project to which it leads. Both discrepancies do not occur in normal usage; they only sign a doctored line.
 */

const getAuthedUser = vi.fn();
const upsertMember = vi.fn();
const updateInvitation = vi.fn();

let invitation: Record<string, unknown> | null = null;
let project: Record<string, unknown> | null = null;
let legacySchema = false;

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: (...args: unknown[]) => getAuthedUser(...args),
}));
// The route imports the invitation catch-up for its GET; he pulls everything
// `members.ts` (email, push, entitlements), which this test does not need.
vi.mock("@/lib/server/members", () => ({
  claimPendingInvitationsLate: async () => false,
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from(table: string) {
      if (table === "project_invitations") {
        return {
          select: (columns: string) => ({
            eq: () => ({ maybeSingle: async () => legacySchema && columns.includes("encryption_version")
              ? { data: null, error: { code: "42703", message: "column does not exist" } }
              : { data: invitation, error: null } }),
          }),
          update: (patch: unknown) => ({
            eq: async (_column: string, id: string) => {
              if (legacySchema && Object.hasOwn(patch as object, "invited_email_ciphertext")) {
                return { error: { code: "42703", message: "column does not exist" } };
              }
              updateInvitation(patch, id);
              return { error: null };
            },
          }),
        };
      }
      if (table === "projects") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: project }) }),
          }),
        };
      }
      if (table === "project_members") {
        return {
          upsert: async (payload: unknown) => {
            upsertMember(payload);
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

const { PATCH } = await import("@/app/api/projects/invitations/route");

const USER = "5ad9b962-93e7-4a7c-a44b-f4925484ba93";
const OWNER = "11111111-1111-4111-8111-111111111111";
const PROJECT = "07b14964-0def-4941-8ddf-686572d6345d";
const INVITATION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function request(action: string) {
  return new Request("https://minddy.app/api/projects/invitations", {
    method: "PATCH",
    body: JSON.stringify({ invitationId: INVITATION, action }),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  legacySchema = false;
  getAuthedUser.mockResolvedValue({
    ok: true,
    user: { id: USER, email: "invitee@minddy.app" },
  });
  invitation = {
    id: INVITATION,
    project_id: PROJECT,
    invited_by: OWNER,
    invited_user_id: USER,
    invited_email: "invitee@minddy.app",
    invited_email_ciphertext: null,
    invited_email_blind_index: null,
    encryption_version: 0,
    status: "pending",
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  };
  project = { owner_id: OWNER };
});

describe("PATCH /api/projects/invitations", () => {
  it("keeps legacy preview deployments usable before the additive migration", async () => {
    legacySchema = true;
    const response = await PATCH(request("accept"));
    expect(response.status).toBe(200);
    expect(updateInvitation).toHaveBeenCalledWith(
      expect.not.objectContaining({ invited_email_ciphertext: null }),
      INVITATION,
    );
  });

  it("adds the invitee to the invitation's project", async () => {
    const response = await PATCH(request("accept"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      acceptedProjectId: PROJECT,
    });
    expect(upsertMember).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: PROJECT, user_id: USER })
    );
    expect(updateInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "accepted",
        invited_email: null,
        invited_email_ciphertext: null,
        invited_email_blind_index: null,
      }),
      INVITATION
    );
  });

  it("rejects an acceptance or rejection from another invitee", async () => {
    invitation!.invited_user_id = OWNER;
    const response = await PATCH(request("reject"));
    expect(response.status).toBe(403);
    expect(updateInvitation).not.toHaveBeenCalled();
  });

  it("rejects an invitation with a mismatched account email", async () => {
    invitation!.invited_email = "quelquun.dautre@minddy.app";
    const response = await PATCH(request("accept"));
    expect(response.status).toBe(403);
    expect(upsertMember).not.toHaveBeenCalled();
    expect(updateInvitation).not.toHaveBeenCalled();
  });

  it("rejects an invitation redirected to someone else's project", async () => {
    // The attack on MIN-325: the line is mine, the address too,
    // but its `project_id` was moved to a project that issued
    // the invitation does not have.
    project = { owner_id: "22222222-2222-4222-8222-222222222222" };
    const response = await PATCH(request("accept"));
    expect(response.status).toBe(403);
    expect(upsertMember).not.toHaveBeenCalled();
    expect(updateInvitation).not.toHaveBeenCalled();
  });

  it("rejects without adding a member", async () => {
    const response = await PATCH(request("reject"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, acceptedProjectId: null });
    expect(upsertMember).not.toHaveBeenCalled();
    expect(updateInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ status: "rejected" }),
      INVITATION
    );
  });

  it("does not accept an expired invitation", async () => {
    invitation!.expires_at = new Date(Date.now() - 1000).toISOString();
    const response = await PATCH(request("accept"));
    expect(response.status).toBe(404);
    expect(upsertMember).not.toHaveBeenCalled();
  });
});
