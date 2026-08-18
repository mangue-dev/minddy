import { beforeEach, describe, expect, it, vi } from "vitest";

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
    // Un `select(..., { head: true, count: 'exact' })` s'attend directement.
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
      if (name === "feedback_otp_codes") {
        return query(
          () => otpRows,
          (values) => otpRows.push({ ...values, created_at: new Date().toISOString() })
        );
      }
      return query(() => []);
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
const { requestFeedbackOtp } = await import("@/lib/server/feedback/otp");

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
  it("accepte un post du projet du visiteur", async () => {
    expect(
      await votePost({ postId: "post-mine", userId: "u1", projectId: "proj-a" })
    ).toBe(true);
    expect(voteUpserts).toEqual([{ post_id: "post-mine", user_id: "u1" }]);
  });

  it("refuse un post d'un AUTRE board, même avec une session valide", async () => {
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
  // mauvaise raison.
  const base = { boardId: "board-1", locale: "fr" as const };

  it("s'arrête avant la base quand l'e-mail applicatif est absent", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "");

    expect(
      await requestFeedbackOtp({ ...base, ip: "10.0.0.0", email: "a@example.com" }),
    ).toEqual({ ok: false, error: "notConfigured" });
    expect(otpRows).toHaveLength(0);
    expect(sentEmails).toHaveLength(0);
  });

  it("envoie un code, et le corps ne porte AUCUN texte de tiers", async () => {
    expect(
      await requestFeedbackOtp({ ...base, ip: "10.0.0.1", email: "Someone@Example.com " })
    ).toEqual({ ok: true });
    expect(sentEmails).toHaveLength(1);
    // The address is standardized, and the call no longer takes a project name:
    // it is this absence that closes the relay.
    expect(sentEmails[0].to).toBe("someone@example.com");
    expect(Object.keys(sentEmails[0]).sort()).toEqual(["code", "locale", "to"]);
  });

  it("bloque le second envoi dans la fenêtre de cooldown, sans le dire", async () => {
    const p = { ...base, ip: "10.0.0.2", email: "a@b.com" };
    await requestFeedbackOtp(p);
    expect(await requestFeedbackOtp(p)).toEqual({ ok: true });
    // Same response — but only one email went out.
    expect(sentEmails).toHaveLength(1);
  });

  it("refuse d'arroser une adresse via PLUSIEURS boards", async () => {
    // Five requests already submitted within the hour, on five different boards:
    // the limit per recipient counts them all. This is the relay lever
    // ouvert — un compteur par board ne l'aurait jamais vu.
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

  it("refuse une origine qui arrose des adresses ARBITRAIRES", async () => {
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
});

/** n lines dated within the past hour, but outside the one minute cooldown. */
function recent(n: number, shape: (i: number) => Row): Row[] {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => ({
    ...shape(i),
    created_at: new Date(now - (i + 2) * 60_000).toISOString(),
  }));
}
