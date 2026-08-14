import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-325 — accepter une invitation, c'est se faire inscrire quelque part.
 *
 * La route lisait la ligne d'invitation et inscrivait l'appelant sur le
 * `project_id` TEL QU'IL EST EN BASE, en ne vérifiant que `invited_user_id`.
 * Or la ligne était modifiable par son invité (policy
 * `project_invitations_update_invitee`, supprimée par 20261215090000) : poser
 * son propre `project_id` sur le projet d'un autre suffisait à s'y inscrire.
 *
 * La policy est partie, mais une policy se réintroduit par distraction. Ce que
 * ces tests épinglent est donc la garde en profondeur, celle qui reste vraie
 * même si la base redevient permissive : une invitation acceptable est une
 * invitation COHÉRENTE — son adresse est celle du compte, et qui l'a émise
 * possède le projet vers lequel elle mène. Les deux divergences ne se produisent
 * pas à l'usage normal ; elles ne signent qu'une ligne trafiquée.
 */

const getAuthedUser = vi.fn();
const upsertMember = vi.fn();
const updateInvitation = vi.fn();

let invitation: Record<string, unknown> | null = null;
let project: Record<string, unknown> | null = null;

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: (...args: unknown[]) => getAuthedUser(...args),
}));
// La route importe le rattrapage des invitations pour son GET ; il tire tout
// `members.ts` (mails, push, entitlements) dont ce test n'a que faire.
vi.mock("@/lib/server/members", () => ({
  claimPendingInvitationsLate: async () => false,
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from(table: string) {
      if (table === "project_invitations") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: invitation }) }),
          }),
          update: (patch: unknown) => ({
            eq: async (_column: string, id: string) => {
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
      throw new Error(`table inattendue : ${table}`);
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
    status: "pending",
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  };
  project = { owner_id: OWNER };
});

describe("PATCH /api/projects/invitations", () => {
  it("inscrit l'invité sur le projet de son invitation", async () => {
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
      expect.objectContaining({ status: "accepted" }),
      INVITATION
    );
  });

  it("refuse un rejet aussi bien qu'une acceptation quand la ligne n'est pas la sienne", async () => {
    invitation!.invited_user_id = OWNER;
    const response = await PATCH(request("reject"));
    expect(response.status).toBe(403);
    expect(updateInvitation).not.toHaveBeenCalled();
  });

  it("refuse une invitation dont l'adresse n'est pas celle du compte", async () => {
    invitation!.invited_email = "quelquun.dautre@minddy.app";
    const response = await PATCH(request("accept"));
    expect(response.status).toBe(403);
    expect(upsertMember).not.toHaveBeenCalled();
    expect(updateInvitation).not.toHaveBeenCalled();
  });

  it("refuse une invitation redirigée vers le projet d'un autre", async () => {
    // L'attaque de MIN-325 : la ligne est bien la mienne, l'adresse aussi,
    // mais son `project_id` a été déplacé vers un projet que celui qui a émis
    // l'invitation ne possède pas.
    project = { owner_id: "22222222-2222-4222-8222-222222222222" };
    const response = await PATCH(request("accept"));
    expect(response.status).toBe(403);
    expect(upsertMember).not.toHaveBeenCalled();
    expect(updateInvitation).not.toHaveBeenCalled();
  });

  it("rejette sans inscrire personne", async () => {
    const response = await PATCH(request("reject"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, acceptedProjectId: null });
    expect(upsertMember).not.toHaveBeenCalled();
    expect(updateInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ status: "rejected" }),
      INVITATION
    );
  });

  it("ne ressuscite pas une invitation périmée", async () => {
    invitation!.expires_at = new Date(Date.now() - 1000).toISOString();
    const response = await PATCH(request("accept"));
    expect(response.status).toBe(404);
    expect(upsertMember).not.toHaveBeenCalled();
  });
});
