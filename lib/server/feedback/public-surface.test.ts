import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

/**
 * MIN-342 — what an ANONYMOUS (or a visitor from another board) achieves.
 *
 * Two surfaces, two rules, and both are only seen between files:
 *
 * - a vote resolves IN the visitor's project. Post id comes from
 * client; resolved alone, it designated any return from the base.
 * - the OTP is the only place where a stranger chooses the recipient of an
 * e-mail from minddy's verified domain. What holds it: a body without
 * no third-party text, and PERSISTENT counters — the one in memory
 * starts from zero each time it is deployed, and a victim is watered via N boards.
 */

interface Row {
  [key: string]: unknown;
}

/** Base posts, all projects combined. */
const posts: Row[] = [
  { id: "post-mine", project_id: "proj-a", merged_into_id: null, deleted_at: null },
  { id: "post-theirs", project_id: "proj-b", merged_into_id: null, deleted_at: null },
];

/** The OTP lines written, plus those planted before the call. */
let otpRows: Row[] = [];
let voteUpserts: Row[] = [];
const sentEmails: { to: string; code: string; locale: string }[] = [];

/** An accumulated `.eq()` / `.gte()` / `.is()` filter, applied at the end. */
type Filter = (row: Row) => boolean;

function query(rows: () => Row[], onInsert?: (values: Row) => void) {
  const filters: Filter[] = [];
  let head = false;
  let desc = true;
  let orderKey: string | null = null;

  const api = {
    select: (_cols?: string, opts?: { head?: boolean; count?: string }) => {
      head = opts?.head ?? false;
      return api;
    },
    eq: (col: string, value: unknown) => {
      filters.push((r) => r[col] === value);
      return api;
    },
    gte: (col: string, value: string) => {
      filters.push((r) => String(r[col]) >= value);
      return api;
    },
    is: (col: string, value: unknown) => {
      filters.push((r) => r[col] === value);
      return api;
    },
    order: (col: string, opts?: { ascending?: boolean }) => {
      orderKey = col;
      desc = opts?.ascending === false;
      return api;
    },
    limit: () => api,
    matched: () => {
      const out = rows().filter((r) => filters.every((f) => f(r)));
      if (orderKey) {
        const key = orderKey;
        out.sort((a, b) =>
          desc
            ? String(b[key]).localeCompare(String(a[key]))
            : String(a[key]).localeCompare(String(b[key]))
        );
      }
      return out;
    },
    maybeSingle: async () => ({ data: api.matched()[0] ?? null, error: null }),
    insert: async (values: Row) => {
      onInsert?.(values);
      return { error: null };
    },
    update: () => ({ eq: async () => ({ error: null }) }),
    upsert: async (values: Row) => {
      voteUpserts.push(values);
      return { error: null };
    },
    // A head/count select is directly awaitable in Supabase's query builder.
    then: (
      resolve: (value: { data: Row[] | null; count: number; error: null }) => unknown
    ) => {
      const matched = api.matched();
      return Promise.resolve(
        resolve({ data: head ? null : matched, count: matched.length, error: null })
      );
    },
  };
  return api;
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (name: string) => {
      if (name === "feedback_posts") return query(() => posts);
      if (name === "feedback_otp_codes") return query(() => otpRows);
      return query(() => []);
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "issue_feedback_otp_code") {
        const now = String(args.p_now);
        const windowStart = new Date(
          new Date(now).getTime() - Number(args.p_window_seconds) * 1000
        ).toISOString();
        const cooldownStart = new Date(
          new Date(now).getTime() - Number(args.p_cooldown_seconds) * 1000
        ).toISOString();
        const email = String(args.p_email);
        const ipHash = String(args.p_ip_hash);
        if (
          otpRows.some(
            (row) =>
              row.board_id === args.p_board_id &&
              row.email === email &&
              String(row.created_at) > cooldownStart
          )
        ) {
          return { data: "cooldown", error: null };
        }
        const emailCount = otpRows.filter(
          (row) => row.email === email && String(row.created_at) >= windowStart
        ).length;
        const ipCount = otpRows.filter(
          (row) => row.ip_hash === ipHash && String(row.created_at) >= windowStart
        ).length;
        if (
          emailCount >= Number(args.p_email_limit) ||
          ipCount >= Number(args.p_ip_limit)
        ) {
          return { data: "rate_limited", error: null };
        }
        otpRows.push({
          id: args.p_id,
          board_id: args.p_board_id,
          email,
          ip_hash: ipHash,
          code_hash: args.p_code_hash,
          expires_at: args.p_expires_at,
          created_at: now,
          attempts: 0,
          consumed_at: null,
        });
        return { data: "issued", error: null };
      }
      if (name === "claim_feedback_otp_attempt") {
        const row = otpRows
          .filter(
            (candidate) =>
              candidate.board_id === args.p_board_id &&
              candidate.email === args.p_email &&
              candidate.consumed_at === null
          )
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
        if (!row) return { data: [{ status: "invalid", id: null, code_hash: null }], error: null };
        if (String(row.expires_at) <= String(args.p_now)) {
          return { data: [{ status: "expired", id: row.id, code_hash: null }], error: null };
        }
        if (Number(row.attempts) >= Number(args.p_max_attempts)) {
          return {
            data: [{ status: "too_many_attempts", id: row.id, code_hash: null }],
            error: null,
          };
        }
        row.attempts = Number(row.attempts) + 1;
        return {
          data: [{ status: "claimed", id: row.id, code_hash: row.code_hash }],
          error: null,
        };
      }
      if (name === "consume_feedback_otp_code") {
        const row = otpRows.find((candidate) => candidate.id === args.p_id);
        if (!row || row.consumed_at !== null || String(row.expires_at) <= String(args.p_now)) {
          return { data: false, error: null };
        }
        row.consumed_at = args.p_now;
        return { data: true, error: null };
      }
      return { data: null, error: { message: `Unexpected RPC: ${name}` } };
    },
  }),
}));

vi.mock("@/lib/server/posthog", () => ({ captureServerEvent: () => {} }));

vi.mock("@/lib/server/feedback/otp-email", () => ({
  sendOtpEmail: async (params: { to: string; code: string; locale: string }) => {
    sentEmails.push(params);
    return true;
  },
}));

const { votePost } = await import("@/lib/server/feedback/votes");
const { requestFeedbackOtp, verifyFeedbackOtp } = await import(
  "@/lib/server/feedback/otp"
);

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("EMAIL_PROVIDER", "resend");
  vi.stubEnv("RESEND_API_KEY", "resend-key");
  vi.stubEnv("FEEDBACK_EMAIL_FROM", "feedback@example.test");
  vi.stubEnv("INVITATION_EMAIL_FROM", "invites@example.test");
  otpRows = [];
  voteUpserts = [];
  sentEmails.length = 0;
});

describe("votePost", () => {
  it("accepts a post from the visitor's project", async () => {
    expect(
      await votePost({ postId: "post-mine", userId: "u1", projectId: "proj-a" })
    ).toBe(true);
    expect(voteUpserts).toEqual([{ post_id: "post-mine", user_id: "u1" }]);
  });

  it("rejects a post from another board even with a valid session", async () => {
    expect(
      await votePost({ postId: "post-theirs", userId: "u1", projectId: "proj-a" })
    ).toBe(false);
    // The refusal is valid for the absence of writing: a `false` returned after an upsert
    // would have left the voice in base.
    expect(voteUpserts).toEqual([]);
  });
});

describe("requestFeedbackOtp", () => {
  // One IP per case: the first barrier remains a shared IN-MEMORY counter
  // through the entire test module — reusing it would pass off a case for the
  // wrong reason.
  const base = { boardId: "board-1", locale: "fr" as const };

  it("stops before storage when transactional email is unavailable", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "");

    expect(
      await requestFeedbackOtp({ ...base, ip: "10.0.0.0", email: "a@example.com" }),
    ).toEqual({ ok: false, error: "notConfigured" });
    expect(otpRows).toHaveLength(0);
    expect(sentEmails).toHaveLength(0);
  });

  it("sends a code without accepting third-party email content", async () => {
    expect(
      await requestFeedbackOtp({ ...base, ip: "10.0.0.1", email: "Someone@Example.com " })
    ).toEqual({ ok: true });
    expect(sentEmails).toHaveLength(1);
    // The address is standardized, and the call no longer takes a project name:
    // it is this absence that closes the relay.
    expect(sentEmails[0].to).toBe("someone@example.com");
    expect(Object.keys(sentEmails[0]).sort()).toEqual(["code", "locale", "to"]);
  });

  it("silently suppresses a second send during the cooldown", async () => {
    const p = { ...base, ip: "10.0.0.2", email: "a@b.com" };
    await requestFeedbackOtp(p);
    expect(await requestFeedbackOtp(p)).toEqual({ ok: true });
    // Same response — but only one email went out.
    expect(sentEmails).toHaveLength(1);
  });

  it("refuses to target one address through multiple boards", async () => {
    // Five requests already submitted within the hour, on five different boards:
    // the limit per recipient counts them all. This is the relay lever
    // a board-scoped counter would never catch.
    otpRows = recent(5, (i) => ({ board_id: `board-${i}`, email: "victim@example.com" }));
    expect(
      await requestFeedbackOtp({
        ...base,
        boardId: "board-9",
        ip: "10.0.0.3",
        email: "victim@example.com",
      })
    ).toEqual({ ok: false, error: "rateLimited" });
    expect(sentEmails).toHaveLength(0);
  });

  it("refuses an origin that targets arbitrary addresses", async () => {
    const ip = "10.0.0.4";
    // We learn the fingerprint of the origin by letting a request pass.
    await requestFeedbackOtp({ ...base, ip, email: "first@example.com" });
    const ipHash = otpRows[0].ip_hash;
    expect(ipHash).toBeTruthy();

    // Fifteen distinct recipients from the same origin: the counter is
    // in base, so it survives the deployment which empties the one in memory.
    otpRows = recent(15, (i) => ({
      board_id: "board-1",
      email: `target-${i}@example.com`,
      ip_hash: ipHash,
    }));
    sentEmails.length = 0;
    expect(await requestFeedbackOtp({ ...base, ip, email: "another@example.com" })).toEqual(
      { ok: false, error: "rateLimited" }
    );
    expect(sentEmails).toHaveLength(0);
  });

  it("does not exceed the email quota under parallel issuance", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        requestFeedbackOtp({
          boardId: `parallel-board-${index}`,
          locale: "en",
          ip: `198.51.100.${index}`,
          email: "parallel-victim@example.com",
        })
      )
    );
    expect(results.filter((result) => result.ok)).toHaveLength(5);
    expect(sentEmails).toHaveLength(5);
    expect(otpRows.filter((row) => row.email === "parallel-victim@example.com")).toHaveLength(5);
  });
});

describe("verifyFeedbackOtp", () => {
  function otpHash(id: string, code: string): string {
    return createHash("sha256").update(`${id}:${code}`).digest("hex");
  }

  it("atomically caps parallel verification attempts", async () => {
    const id = "00000000-0000-4000-8000-000000000461";
    otpRows = [
      {
        id,
        board_id: "board-verify",
        email: "verify@example.com",
        code_hash: otpHash(id, "123456"),
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        created_at: new Date().toISOString(),
        attempts: 0,
        consumed_at: null,
      },
    ];

    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        verifyFeedbackOtp({
          boardId: "board-verify",
          email: "verify@example.com",
          code: "000000",
        })
      )
    );
    expect(otpRows[0].attempts).toBe(5);
    expect(results.filter((result) => !result.ok && result.error === "invalidCode")).toHaveLength(5);
    expect(
      results.filter((result) => !result.ok && result.error === "tooManyAttempts")
    ).toHaveLength(7);
  });

  it("allows only one parallel submission to consume a correct code", async () => {
    const id = "00000000-0000-4000-8000-000000000462";
    otpRows = [
      {
        id,
        board_id: "board-consume",
        email: "consume@example.com",
        code_hash: otpHash(id, "654321"),
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        created_at: new Date().toISOString(),
        attempts: 0,
        consumed_at: null,
      },
    ];

    const results = await Promise.all(
      Array.from({ length: 2 }, () =>
        verifyFeedbackOtp({
          boardId: "board-consume",
          email: "consume@example.com",
          code: "654321",
        })
      )
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(otpRows[0].consumed_at).not.toBeNull();
  });
});

/** n lines dated within the past hour, but outside the one minute cooldown. */
function recent(n: number, shape: (i: number) => Row): Row[] {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => ({
    ...shape(i),
    created_at: new Date(now - (i + 2) * 60_000).toISOString(),
  }));
}
