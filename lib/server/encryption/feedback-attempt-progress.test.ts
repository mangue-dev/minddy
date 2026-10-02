import { beforeEach, describe, expect, it, vi } from "vitest";

type Item = Record<string, unknown> & { id: string; attempted?: number | null };
const state = vi.hoisted(() => ({
  tick: 0,
  conflictId: "",
  rows: {} as Record<string, Item[]>,
}));

vi.mock("./content-config", () => ({ isContentEncryptionEnabled: () => true }));
vi.mock("./registry", () => ({
  getContentKeys: () => ({
    current: async () => ({ version: 1, bytes: Buffer.alloc(32) }),
  }),
}));
vi.mock("@/lib/server/feedback/identity-content", () => ({
  decodeFeedbackIdentity: async (_project: string, _id: string, _column: string,
    value: string) => {
    if (value.startsWith("bad:")) throw new Error("Unreadable identity");
    return value.startsWith("enc:") ? value.slice(4) : value;
  },
  decodeFeedbackOtpEmail: async (_id: string, value: string) => {
    if (value.startsWith("bad:")) throw new Error("Unreadable OTP");
    return value.startsWith("enc:") ? value.slice(4) : value;
  },
  encodeFeedbackIdentity: async (_project: string, _id: string, _column: string,
    value: string) => `enc:${value}`,
  encodeFeedbackOtpEmail: async (_id: string, value: string) => `enc:${value}`,
  feedbackIdentityLookup: async () => "a".repeat(64),
  feedbackOtpEmailLookup: async () => "a".repeat(64),
  isEncryptedFeedbackIdentity: (value: string) => value.startsWith("enc:"),
  feedbackIdentityState: () => ({ version: 1, format: 3 }),
}));
vi.mock("@/lib/server/feedback/board-sso-content", () => ({
  decodeBoardSso: async (_project: string, _id: string, value: string) => {
    if (value.startsWith("bad:")) throw new Error("Unreadable SSO");
    return value.startsWith("enc:") ? value.slice(4) : value;
  },
  encodeBoardSso: async (_project: string, _id: string, value: string) => `enc:${value}`,
  boardSsoState: () => ({ version: 1, format: 3 }),
  isEncryptedBoardSso: (value: string) => value.startsWith("enc:"),
}));

const service = {
  from(table: string) {
    let order = "";
    const query = {
      select: () => query,
      not: () => query,
      neq: () => query,
      order: (column: string) => { if (!order) order = column; return query; },
      limit: async (limit: number) => ({
        data: [...(state.rows[table] ?? [])]
          .filter((row) => table !== "feedback_boards" || row.sso_secret !== null)
          .filter((row) => table !== "feedback_merge_events" ||
            JSON.stringify(row.payload) !== "{}")
          .sort((a, b) => {
            const valueA = a[order] as number | null;
            const valueB = b[order] as number | null;
            if (valueA === null && valueB !== null) return -1;
            if (valueB === null && valueA !== null) return 1;
            return (valueA ?? 0) - (valueB ?? 0) || a.id.localeCompare(b.id);
          }).slice(0, limit).map((row) => ({ ...row })),
        error: null,
      }),
    };
    return query;
  },
  async rpc(name: string, args: Record<string, unknown>) {
    const table = name.includes("feedback_user_identity") ||
        (name === "mark_feedback_identity_attempt" && args.p_kind === "user")
      ? "feedback_users"
      : name.includes("feedback_otp") ||
        (name === "mark_feedback_identity_attempt" && args.p_kind === "otp")
        ? "feedback_otp_codes"
      : name.includes("feedback_sso") ? "feedback_boards"
      : name.includes("feedback_merge") ? "feedback_merge_events" : "";
    const row = state.rows[table]?.find((candidate) => candidate.id ===
      (args.p_id ?? args.p_event));
    if (!row) return { data: false, error: null };
    if (name.startsWith("mark_")) {
      row[table === "feedback_boards" ? "sso_encryption_attempted_at"
        : table === "feedback_merge_events" ? "payload_attempted_at"
          : "content_encryption_attempted_at"] = ++state.tick;
      return { data: true, error: null };
    }
    if (row.id === state.conflictId) {
      state.conflictId = "";
      return { data: false, error: null };
    }
    if (table === "feedback_users") {
      row.email = args.p_new_email ?? row.email;
      row.email_lookup = args.p_email_lookup ?? row.email_lookup;
    } else if (table === "feedback_otp_codes") {
      row.email = args.p_new_email;
      row.email_lookup = args.p_email_lookup;
    } else if (table === "feedback_boards") {
      row.sso_secret = args.p_new;
    } else if (table === "feedback_merge_events") {
      if (typeof row.payload === "object" && row.payload !== null &&
          "malformed" in row.payload) return { data: null, error: { message: "Invalid payload" } };
      row.payload = {};
    }
    row[table === "feedback_boards" ? "sso_encryption_attempted_at"
      : table === "feedback_merge_events" ? "payload_attempted_at"
        : "content_encryption_attempted_at"] = ++state.tick;
    return { data: true, error: null };
  },
};
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));

const { backfillFeedbackIdentityBatch } = await import("./feedback-identity-backfill");
const { backfillFeedbackSsoBatch } = await import("./feedback-sso-backfill");
const { backfillFeedbackMergeBatch } = await import("./feedback-merge-backfill");

beforeEach(() => {
  state.tick = 0;
  state.conflictId = "";
  state.rows = {};
  vi.stubEnv("MINDDY_FEEDBACK_IDENTITY_ENCRYPTION_ENABLED", "true");
  vi.stubEnv("MINDDY_FEEDBACK_SSO_ENCRYPTION_ENABLED", "true");
  vi.stubEnv("MINDDY_FEEDBACK_MERGE_PAYLOAD_CLEANUP_ENABLED", "true");
});

describe("feedback attempt queues", () => {
  it.each(["feedback_users", "feedback_otp_codes"] as const)(
    "%s advances past a fully unreadable first page", async (table) => {
      state.rows[table] = ["a", "b"].map((id) => ({ id,
        project_id: "project", email: `bad:${id}`, name: null, external_id: null,
        content_encryption_attempted_at: null,
      }));
      state.rows[table].push({ id: "c", project_id: "project",
        email: "valid@example.test", name: null, external_id: null,
        content_encryption_attempted_at: null });
      expect(await backfillFeedbackIdentityBatch(table, 2)).toMatchObject({
        scanned: 2, failed: 2, migrated: 0,
      });
      expect(await backfillFeedbackIdentityBatch(table, 2)).toMatchObject({
        migrated: 1,
      });
      expect(state.rows[table][2].email).toBe("enc:valid@example.test");
      expect(state.rows[table][0].content_encryption_checked_at).toBeUndefined();
    });

  it("advances SSO after failures and a CAS conflict", async () => {
    state.rows.feedback_boards = ["a", "b"].map((id) => ({ id,
      project_id: "project", sso_secret: `bad:${id}`,
      sso_encryption_attempted_at: null }));
    state.rows.feedback_boards.push({ id: "c", project_id: "project",
      sso_secret: "valid-secret", sso_encryption_attempted_at: null });
    expect(await backfillFeedbackSsoBatch(2)).toMatchObject({ failed: 2 });
    state.conflictId = "c";
    expect(await backfillFeedbackSsoBatch(2)).toMatchObject({ conflicted: 1 });
    expect(state.rows.feedback_boards[2].sso_encryption_attempted_at).not.toBeNull();
    expect(await backfillFeedbackSsoBatch(2)).toMatchObject({ migrated: 1 });
    expect(state.rows.feedback_boards[2].sso_secret).toBe("enc:valid-secret");
  });

  it("advances merge cleanup after a failed first page and a CAS conflict", async () => {
    state.rows.feedback_merge_events = ["a", "b"].map((id) => ({ id,
      payload: { malformed: true }, payload_attempted_at: null }));
    state.rows.feedback_merge_events.push({ id: "c", payload: { moved_vote_user_ids: [] },
      payload_attempted_at: null });
    expect(await backfillFeedbackMergeBatch(2)).toMatchObject({ failed: 2 });
    state.conflictId = "c";
    expect(await backfillFeedbackMergeBatch(2)).toMatchObject({ conflicted: 1 });
    expect(await backfillFeedbackMergeBatch(2)).toMatchObject({ migrated: 1 });
    expect(state.rows.feedback_merge_events[2].payload).toEqual({});
  });
});
