import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-197 — we invite an ADDRESS, not an account.
 *
 * The rule that these tests pin down is in two halves, and it is their
 * JOINT that is fragile:
 *
 * 1. `inviteMember` inserts the line even when the address does not have an account —
 * `invited_user_id` remains null, and an email leaves with the token.
 * 2. `attachPendingInvitations` requests this line for an account, later,
 * on its email CHECKED.
 *
 * Missing the second half doesn't break anything visible: the invitation exists, the email
 * is gone, the invitee signs up — and never sees anything, because the inbox reads
 * `invited_user_id`. Hence the assertions on the FILTERS of the attachment (email
 * unconfirmed, line already attached, invitation expired), and not only on
 * its happy result.
 *
 * The double PostgREST applies the filters for real: a test which does not apply them
 * would not apply would say nothing about the query we write.
 */

interface Row extends Record<string, unknown> {
  id: string;
}

let projectRows: Row[] = [];
let memberRows: Row[] = [];
let invitationRows: Row[] = [];
/** Comptes minddy existants, par email — ce que `findAuthUserByEmail` voit. */
let accounts = new Map<string, { id: string }>();
/** Scheduled background jobs to wait for explicitly. */
let background: Promise<unknown>[] = [];

let nextId = 0;
const newId = () => `row-${++nextId}`;

/** PostgREST string double: accumulate filters, then read/insert/modify. */
function table(name: string, rows: () => Row[]) {
  const filters: ((row: Row) => boolean)[] = [];
  /** `limit(n)`: truncates after filters, like PostgREST. */
  let cap: number | null = null;
  type Payload = Record<string, unknown>;
  let staged:
    | { kind: "insert"; payload: Payload }
    | { kind: "update"; patch: Payload }
    | { kind: "delete" }
    | null = null;
  const query: Record<string, unknown> = {};

  const matching = () => {
    const hits = rows().filter((row) => filters.every((f) => f(row)));
    return cap == null ? hits : hits.slice(0, cap);
  };

  query.select = () => query;
  query.insert = (payload: Payload) => {
    staged = { kind: "insert", payload };
    return query;
  };
  query.update = (patch: Payload) => {
    staged = { kind: "update", patch };
    return query;
  };
  query.delete = () => {
    staged = { kind: "delete" };
    return query;
  };
  query.eq = (column: string, value: unknown) => {
    filters.push((row) => row[column] === value);
    return query;
  };
  query.is = (column: string, value: unknown) => {
    filters.push((row) => (row[column] ?? null) === value);
    return query;
  };
  query.gt = (column: string, value: unknown) => {
    filters.push(
      (row) => Date.parse(String(row[column])) > Date.parse(String(value))
    );
    return query;
  };
  query.lte = (column: string, value: unknown) => {
    filters.push(
      (row) => Date.parse(String(row[column])) <= Date.parse(String(value))
    );
    return query;
  };
  query.order = () => query;
  query.limit = (n: number) => {
    cap = n;
    return query;
  };

  /** The insertion, with the partial unique index of `project_invitations`. */
  const runInsert = (payload: Payload) => {
    if (
      name === "project_invitations" &&
      invitationRows.some(
        (r) =>
          r.project_id === payload.project_id &&
          r.invited_email === payload.invited_email &&
          r.status === "pending"
      )
    ) {
      return { data: null, error: { code: "23505", message: "duplicate key" } };
    }
    // The defects of the MIN-197 migration, posed by the base.
    const row: Row = {
      id: newId(),
      created_at: new Date().toISOString(),
      token: `tok-${newId()}`,
      expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      ...payload,
    };
    rows().push(row);
    return { data: row, error: null };
  };

  const resolve = () => {
    if (staged?.kind === "insert") return runInsert(staged.payload);
    if (staged?.kind === "update") {
      const touched = matching();
      for (const row of touched) Object.assign(row, staged.patch);
      return { data: touched, error: null };
    }
    if (staged?.kind === "delete") {
      const doomed = new Set(matching());
      const kept = rows().filter((row) => !doomed.has(row));
      rows().length = 0;
      rows().push(...kept);
      return { data: [...doomed], error: null };
    }
    return { data: matching(), error: null };
  };

  query.single = async () => resolve();
  query.maybeSingle = async () => {
    const result = resolve();
    const data = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;
    return { ...result, data };
  };
  query.then = (onFulfilled: (value: unknown) => unknown) =>
    Promise.resolve(resolve()).then(onFulfilled);

  return query;
}

const TABLES: Record<string, () => Row[]> = {
  projects: () => projectRows,
  project_members: () => memberRows,
  project_invitations: () => invitationRows,
};

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (name: string) => table(name, TABLES[name] ?? (() => [])),
  }),
}));

/** The accounts that the admin API renders, by id — what `fetchAuthUsersById`.
 sees Empty = we fall back on the generic account of the invitation tests, which does not have
 a confirmed email (he does not need one: he is the INVITER, not the guest). */
let adminAccounts = new Map<string, Record<string, unknown>>();
/** How many times the admin API was hit — the catchup probe exists
 so that this counter remains at zero when there is nothing to claim. */
let adminLookups = 0;

vi.mock("@/lib/server/auth-users", () => ({
  findAuthUserByEmail: async (_service: unknown, email: string) =>
    accounts.get(email) ?? null,
  fetchAuthUsersById: async (_service: unknown, ids: string[]) => {
    adminLookups += 1;
    return new Map(
      ids.map((id) => [
        id,
        adminAccounts.get(id) ?? { id, email: `${id}@example.test` },
      ])
    );
  },
  toNamed: (user: { email?: string } | undefined) => ({
    email: user?.email ?? null,
    full_name: null,
  }),
}));

vi.mock("@/lib/server/entitlements", () => ({
  ensureMemberSlotAvailable: async () => undefined,
}));

// Push notification is off topic here: cut, `pushInvitation` does nothing.
vi.mock("@/lib/server/push/vapid", () => ({ isPushConfigured: () => false }));
vi.mock("@/lib/server/push/send", () => ({ sendPushToUser: async () => undefined }));

const sendInvitationEmail = vi.fn(async (_params: Record<string, unknown>) => true);
vi.mock("@/lib/server/invitation-email", () => ({
  sendInvitationEmail: (params: Record<string, unknown>) => sendInvitationEmail(params),
}));

// The background hook, made observable: we keep the promise for
// be able to wait for it — without ever detaching it, like the real `afterOrNow`.
vi.mock("@/lib/server/after-safe", () => ({
  afterOrNow: (work: () => void | Promise<void>) => {
    background.push(Promise.resolve(work()));
  },
}));

import {
  attachPendingInvitations,
  claimPendingInvitationsLate,
  inviteMember,
} from "./members";

const OWNER = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const MEMBER = "33333333-3333-4333-8333-333333333333";

const settle = () => Promise.all(background.splice(0));

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("EMAIL_PROVIDER", "resend");
  vi.stubEnv("RESEND_API_KEY", "resend-key");
  vi.stubEnv("FEEDBACK_EMAIL_FROM", "feedback@example.test");
  vi.stubEnv("INVITATION_EMAIL_FROM", "invites@example.test");
  projectRows = [
    { id: PROJECT, owner_id: OWNER, name: "Atlas", deleted_at: null },
  ];
  memberRows = [];
  invitationRows = [];
  accounts = new Map();
  adminAccounts = new Map();
  adminLookups = 0;
  background = [];
  sendInvitationEmail.mockClear();
});

describe("inviteMember — an address without an account", () => {
  it("retains an invitation when application email is disabled", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "");

    const result = await inviteMember({
      projectId: PROJECT,
      actorId: OWNER,
      email: "nouvelle@example.test",
    });

    expect(result.ok).toBe(true);
    expect(invitationRows).toHaveLength(1);
    expect(invitationRows[0]).toMatchObject({
      invited_email: "nouvelle@example.test",
      invited_user_id: null,
      status: "pending",
    });
    await settle();
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });

  it("crée quand même l'invitation, sans invited_user_id", async () => {
    const result = await inviteMember({
      projectId: PROJECT,
      actorId: OWNER,
      email: "Nouvelle@Example.test",
    });

    expect(result.ok).toBe(true);
    expect(invitationRows).toHaveLength(1);
    expect(invitationRows[0].invited_email).toBe("nouvelle@example.test");
    expect(invitationRows[0].invited_user_id).toBeNull();
  });

  it("envoie l'email d'invitation avec le token de la ligne", async () => {
    await inviteMember({
      projectId: PROJECT,
      actorId: OWNER,
      email: "nouvelle@example.test",
      locale: "fr",
      origin: "http://localhost:3000",
    });
    await settle();

    expect(sendInvitationEmail).toHaveBeenCalledTimes(1);
    expect(sendInvitationEmail.mock.calls[0][0]).toMatchObject({
      to: "nouvelle@example.test",
      projectName: "Atlas",
      token: invitationRows[0].token,
      locale: "fr",
      origin: "http://localhost:3000",
    });
  });

  it("ne rend PAS le token à qui invite", async () => {
    const result = await inviteMember({
      projectId: PROJECT,
      actorId: OWNER,
      email: "nouvelle@example.test",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.invitation).not.toHaveProperty("token");
  });

  // The account enumeration: `invited_user_id` returned to the client would say, for
  // any address you enter, if she has a minddy account. Both
  // cases are checked — the unknown address AND the one which has an account, since
  // it is precisely the DIFFERENCE between the two answers that would be the oracle.
  it("ne rend PAS invited_user_id, compte ou pas", async () => {
    const unknown = await inviteMember({
      projectId: PROJECT,
      actorId: OWNER,
      email: "inconnue@example.test",
    });
    const account = "55555555-5555-4555-8555-555555555555";
    accounts.set("connue@example.test", { id: account });
    const known = await inviteMember({
      projectId: PROJECT,
      actorId: OWNER,
      email: "connue@example.test",
    });

    expect(unknown.ok && known.ok).toBe(true);
    if (!unknown.ok || !known.ok) return;
    expect(unknown.invitation).not.toHaveProperty("invited_user_id");
    expect(known.invitation).not.toHaveProperty("invited_user_id");
    // The column is well written in base: it is the RESPONSE which silences it.
    expect(invitationRows[1].invited_user_id).toBe(account);
  });

  it("refuse la seconde invitation vers la même adresse (index unique)", async () => {
    await inviteMember({ projectId: PROJECT, actorId: OWNER, email: "a@example.test" });
    const second = await inviteMember({
      projectId: PROJECT,
      actorId: OWNER,
      email: "a@example.test",
    });

    expect(second).toMatchObject({
      ok: false,
      status: 409,
      errorKey: "invitationAlreadyPending",
    });
    expect(invitationRows).toHaveLength(1);
  });

  // The counterpart of 409 above. The partial unique index only knows
  // `status = 'pending'`, and nothing passes an expired invitation to another
  // status: without the cleaning done before insertion, an address remained banned
  // of the project between its expiration (30 days) and the purge of `retention.ts` (90 days).
  it("réinvite une adresse dont l'invitation a expiré", async () => {
    await inviteMember({ projectId: PROJECT, actorId: OWNER, email: "a@example.test" });
    invitationRows[0].expires_at = new Date(Date.now() - 86_400_000).toISOString();
    const mort = invitationRows[0].id;

    const again = await inviteMember({
      projectId: PROJECT,
      actorId: OWNER,
      email: "a@example.test",
    });

    expect(again.ok).toBe(true);
    expect(invitationRows).toHaveLength(1);
    expect(invitationRows[0].id).not.toBe(mort);
  });

  it("refuse toujours une adresse qui n'en est pas une", async () => {
    const result = await inviteMember({
      projectId: PROJECT,
      actorId: OWNER,
      email: "pas-un-email",
    });
    expect(result).toMatchObject({ ok: false, status: 400, errorKey: "invalidEmail" });
    expect(invitationRows).toHaveLength(0);
  });
});

describe("inviteMember — une adresse qui a déjà un compte", () => {
  beforeEach(() => {
    accounts.set("connu@example.test", { id: MEMBER });
  });

  it("rattache tout de suite l'invitation au compte, et envoie l'email", async () => {
    const result = await inviteMember({
      projectId: PROJECT,
      actorId: OWNER,
      email: "connu@example.test",
    });
    await settle();

    expect(result.ok).toBe(true);
    expect(invitationRows[0].invited_user_id).toBe(MEMBER);
    expect(sendInvitationEmail).toHaveBeenCalledTimes(1);
  });

  it("refuse le propriétaire et un membre déjà présent", async () => {
    accounts.set("owner@example.test", { id: OWNER });
    await expect(
      inviteMember({ projectId: PROJECT, actorId: OWNER, email: "owner@example.test" })
    ).resolves.toMatchObject({ ok: false, status: 409, errorKey: "alreadyOwner" });

    memberRows = [{ id: "m1", project_id: PROJECT, user_id: MEMBER }];
    await expect(
      inviteMember({ projectId: PROJECT, actorId: OWNER, email: "connu@example.test" })
    ).resolves.toMatchObject({ ok: false, status: 409, errorKey: "alreadyMember" });

    expect(invitationRows).toHaveLength(0);
  });
});

describe("attachPendingInvitations", () => {
  const NEWCOMER = "44444444-4444-4444-8444-444444444444";
  const CONFIRMED = { id: NEWCOMER, email: "Nouvelle@Example.test", email_confirmed_at: "2026-08-06T10:00:00Z" };

  const seed = (patch: Partial<Row> = {}) => {
    invitationRows = [
      {
        id: "inv-1",
        project_id: PROJECT,
        invited_email: "nouvelle@example.test",
        invited_user_id: null,
        invited_by: OWNER,
        status: "pending",
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        ...patch,
      },
    ];
  };

  it("réclame l'invitation laissée sur son adresse", async () => {
    seed();
    await attachPendingInvitations(CONFIRMED);
    expect(invitationRows[0].invited_user_id).toBe(NEWCOMER);
  });

  it("ne touche à rien tant que l'email n'est pas confirmé", async () => {
    seed();
    await attachPendingInvitations({ ...CONFIRMED, email_confirmed_at: null });
    expect(invitationRows[0].invited_user_id).toBeNull();
  });

  it("ne réclame pas une invitation expirée", async () => {
    seed({ expires_at: new Date(Date.now() - 86_400_000).toISOString() });
    await attachPendingInvitations(CONFIRMED);
    expect(invitationRows[0].invited_user_id).toBeNull();
  });

  it("ne vole pas une invitation déjà rattachée à quelqu'un d'autre", async () => {
    seed({ invited_user_id: MEMBER });
    await attachPendingInvitations(CONFIRMED);
    expect(invitationRows[0].invited_user_id).toBe(MEMBER);
  });

  it("laisse les invitations déjà répondues où elles sont", async () => {
    seed({ status: "rejected" });
    await attachPendingInvitations(CONFIRMED);
    expect(invitationRows[0].invited_user_id).toBeNull();
  });
});

/**
 * Catch-up for sessions that do not go through /auth/callback — a
 * password connection. What we particularly note is that the
 * email confirmation is REVERIFIED on the service side: the object passed here comes from the
 * claims of the JWT and does not carry `email_confirmed_at`, so believing what we give it
 * would amount to no longer having custody of the all.
 */
describe("claimPendingInvitationsLate", () => {
  const LATE = "66666666-6666-4666-8666-666666666666";
  /** What `getAuthedUser` renders: an id, an email, and nothing verifiable. */
  const SESSION = { id: LATE, email: "Tardive@Example.test" };

  const seed = (patch: Partial<Row> = {}) => {
    invitationRows = [
      {
        id: "inv-late",
        project_id: PROJECT,
        invited_email: "tardive@example.test",
        invited_user_id: null,
        invited_by: OWNER,
        status: "pending",
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        ...patch,
      },
    ];
  };

  it("rattache l'invitation restée orpheline, compte confirmé", async () => {
    seed();
    adminAccounts.set(LATE, {
      id: LATE,
      email: "tardive@example.test",
      email_confirmed_at: "2026-08-06T10:00:00Z",
    });

    await expect(claimPendingInvitationsLate(SESSION)).resolves.toBe(true);
    expect(invitationRows[0].invited_user_id).toBe(LATE);
  });

  // The custody cannot come from the session: the account is authentic.
  it("ne rattache rien si le compte n'a pas d'email confirmé", async () => {
    seed();
    adminAccounts.set(LATE, {
      id: LATE,
      email: "tardive@example.test",
      email_confirmed_at: null,
    });

    await expect(claimPendingInvitationsLate(SESSION)).resolves.toBe(true);
    expect(invitationRows[0].invited_user_id).toBeNull();
  });

  it("ne touche pas l'API admin quand il n'y a rien à réclamer", async () => {
    seed({ invited_user_id: MEMBER });
    await expect(claimPendingInvitationsLate(SESSION)).resolves.toBe(false);
    expect(adminLookups).toBe(0);
  });

  it("ignore une invitation périmée, sans aller chercher le compte", async () => {
    seed({ expires_at: new Date(Date.now() - 86_400_000).toISOString() });
    await expect(claimPendingInvitationsLate(SESSION)).resolves.toBe(false);
    expect(adminLookups).toBe(0);
  });

  it("ne fait rien pour une session sans email", async () => {
    seed();
    await expect(claimPendingInvitationsLate({ id: LATE })).resolves.toBe(false);
    expect(invitationRows[0].invited_user_id).toBeNull();
  });
});
