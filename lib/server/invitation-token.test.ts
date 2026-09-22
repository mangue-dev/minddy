import { beforeEach, describe, expect, it, vi } from "vitest";

import { digestInvitationToken } from "./encryption/invitation-token-digest";

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from(table: string) {
      if (table !== "project_invitations") throw new Error("Unexpected table");
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      const query = {
        select() { return query; },
        eq(column: string, value: unknown) {
          filters.push((row: Record<string, unknown>) => row[column] === value);
          return query;
        },
        gt(column: string, value: number) {
          filters.push((row: Record<string, unknown>) => Number(row[column]) > value);
          return query;
        },
        async maybeSingle() {
          return { data: state.rows.find((row) => filters.every((filter) => filter(row))) ?? null, error: null };
        },
      };
      return query;
    },
  }),
}));
vi.mock("@/lib/server/auth-users", () => ({
  fetchAuthUsersById: async () => new Map([["owner", { id: "owner", email: "owner@example.test" }]]),
  toNamed: () => ({ name: "Owner" }),
}));
vi.mock("@/lib/display-name", () => ({ displayName: () => "Owner" }));
vi.mock("./encryption/invitation-email", () => ({
  decryptInvitationEmail: async (row: Record<string, unknown>) => row.invited_email,
}));

const { resolveInvitationToken } = await import("./invitation-token");

beforeEach(() => {
  state.rows = [];
});

describe("invitation preview tokens", () => {
  it("resolves a raw encrypted invitation token but rejects its stored digest", async () => {
    const raw = "raw-secret-token";
    const digest = digestInvitationToken(raw);
    state.rows = [{
      id: "invite",
      project_id: "project",
      token: digest,
      encryption_version: 1,
      status: "pending",
      invited_email: "guest@example.test",
      invited_by: "owner",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      projects: { name: "Project" },
    }];

    expect(await resolveInvitationToken(raw)).toMatchObject({ invitedEmail: "guest@example.test" });
    expect(await resolveInvitationToken(digest)).toBeNull();
  });

  it("keeps a legacy link valid until the row is backfilled", async () => {
    state.rows = [{
      id: "legacy",
      project_id: "project",
      token: "legacy-token",
      encryption_version: 0,
      status: "pending",
      invited_email: "legacy@example.test",
      invited_by: "owner",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      projects: { name: "Project" },
    }];

    expect(await resolveInvitationToken("legacy-token")).toMatchObject({ invitedEmail: "legacy@example.test" });
  });
});
