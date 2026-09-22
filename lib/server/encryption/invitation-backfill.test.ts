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
  beforeWrite: null as (() => void) | null,
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
                  row.invited_email !== null).slice(0, limit).map((row) => ({ ...row })),
                error: null,
              };
            },
          };
        },
        delete() { return this.update(null); },
        update(patch: Partial<Row> | null) {
          state.beforeWrite?.();
          state.beforeWrite = null;
          const filters: Array<(row: Row) => boolean> = [];
          return {
            eq(column: string, value: unknown) {
              filters.push((row) => row[column as keyof Row] === value);
              return this;
            },
            gt(column: string, value: string) {
              filters.push((row) => String(row[column as keyof Row]) > value);
              return this;
            },
            async select() {
              const matched = state.rows.filter((row) => filters.every((filter) => filter(row)));
              if (patch) {
                for (const row of matched) Object.assign(row, patch);
              } else {
                state.rows = state.rows.filter((row) => !matched.includes(row));
              }
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
  state.beforeWrite = null;
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
    expect(state.rows.find((row) => row.id === "expired")).toBeUndefined();
    expect(state.rows.find((row) => row.id === "accepted")?.invited_email).toBeNull();
    expect(await backfillInvitationEmailsBatch()).toEqual({
      scanned: 0,
      encrypted: 0,
      purged: 0,
    });
  });

  it("does not overwrite a response committed after the batch was read", async () => {
    state.rows = [state.rows[1]];
    state.beforeWrite = () => { state.rows[0].status = "accepted"; };
    expect(await backfillInvitationEmailsBatch()).toEqual({ scanned: 1, encrypted: 0, purged: 0 });
    expect(state.rows[0].status).toBe("accepted");
  });

  it("leaves an invitation that expires during encryption for the next purge pass", async () => {
    state.rows = [state.rows[0]];
    state.beforeWrite = () => { state.rows[0].expires_at = new Date(0).toISOString(); };
    expect(await backfillInvitationEmailsBatch()).toEqual({ scanned: 1, encrypted: 0, purged: 0 });
    expect(state.rows[0].encryption_version).toBe(0);
    expect(await backfillInvitationEmailsBatch()).toEqual({ scanned: 1, encrypted: 0, purged: 1 });
    expect(state.rows).toEqual([]);
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
