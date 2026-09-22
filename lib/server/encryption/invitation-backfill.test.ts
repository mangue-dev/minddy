import { beforeEach, describe, expect, it, vi } from "vitest";
import { digestInvitationToken } from "./invitation-token-digest";

type Row = {
  id: string;
  project_id: string;
  invited_email: string | null;
  status: string;
  expires_at: string;
  encryption_version: number;
  invited_email_ciphertext: string | null;
  invited_email_blind_index: string | null;
  token: string;
};

const state = vi.hoisted(() => ({
  rows: [] as Row[],
  encrypt: vi.fn(async (_email: string, _projectId: string, _invitationId: string) => ({
    invited_email_ciphertext: "ciphertext",
    invited_email_blind_index: "a".repeat(64),
    encryption_version: 1,
  })),
}));

vi.mock("./invitation-email", () => ({
  isInvitationEncryptionEnabled: () => true,
  isInvitationEncryptionConfigured: () => true,
  encryptInvitationEmail: state.encrypt,
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from(table: string) {
      if (table !== "project_invitations") throw new Error("Unexpected table");
      return {
        select() {
          return {
            eq() { return this; },
            not() { return this; },
            order() { return this; },
            async limit(limit: number) {
              return {
                data: state.rows.filter((row) => row.encryption_version === 0 &&
                  row.invited_email !== null).slice(0, limit),
                error: null,
              };
            },
          };
        },
        update(patch: Partial<Row>) {
          const filters: Array<[string, unknown]> = [];
          return {
            eq(column: string, value: unknown) {
              filters.push([column, value]);
              return this;
            },
            async select() {
              const matched = state.rows.filter((row) => filters.every(
                ([column, value]) => row[column as keyof Row] === value,
              ));
              for (const row of matched) Object.assign(row, patch);
              return { data: matched.map((row) => ({ id: row.id })), error: null };
            },
          };
        },
      };
    },
  }),
}));

const { backfillInvitationEmailsBatch } = await import("./invitation-backfill");

beforeEach(() => {
  state.encrypt.mockClear();
  state.rows = [
    {
      id: "pending",
      project_id: "project",
      invited_email: "pending@example.test",
      status: "pending",
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      encryption_version: 0,
      invited_email_ciphertext: null,
      invited_email_blind_index: null,
      token: "pending-token",
    },
    {
      id: "expired",
      project_id: "project",
      invited_email: "expired@example.test",
      status: "pending",
      expires_at: new Date(Date.now() - 86_400_000).toISOString(),
      encryption_version: 0,
      invited_email_ciphertext: null,
      invited_email_blind_index: null,
      token: "expired-token",
    },
    {
      id: "accepted",
      project_id: "project",
      invited_email: "accepted@example.test",
      status: "accepted",
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      encryption_version: 0,
      invited_email_ciphertext: null,
      invited_email_blind_index: null,
      token: "accepted-token",
    },
  ];
});

describe("invitation email backfill", () => {
  it("encrypts live rows, purges obsolete emails and resumes without repeating work", async () => {
    expect(await backfillInvitationEmailsBatch()).toEqual({
      scanned: 3,
      encrypted: 1,
      purged: 2,
    });
    expect(state.encrypt).toHaveBeenCalledTimes(1);
    expect(state.rows[0].invited_email).toBeNull();
    expect(state.rows[0].invited_email_ciphertext).toBe("ciphertext");
    expect(state.rows[0].token).toBe(digestInvitationToken("pending-token"));
    expect(state.rows[1].status).toBe("cancelled");
    expect(state.rows[1].invited_email).toBeNull();
    expect(state.rows[2].invited_email).toBeNull();
    expect(await backfillInvitationEmailsBatch()).toEqual({
      scanned: 0,
      encrypted: 0,
      purged: 0,
    });
  });

  it("bounds each pass", async () => {
    expect(await backfillInvitationEmailsBatch(1)).toEqual({
      scanned: 1,
      encrypted: 1,
      purged: 0,
    });
    await expect(backfillInvitationEmailsBatch(501))
      .rejects.toThrow("Invalid invitation backfill batch size");
  });
});
