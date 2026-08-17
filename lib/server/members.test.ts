import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-197 — on invite une ADRESSE, pas un compte.
 *
 * La règle que ces tests épinglent tient en deux moitiés, et c'est leur
 * ARTICULATION qui est fragile :
 *
 *   1. `inviteMember` insère la ligne même quand l'adresse n'a pas de compte —
 *      `invited_user_id` reste null, et un email part avec le token.
 *   2. `attachPendingInvitations` réclame cette ligne pour un compte, plus tard,
 *      sur son email VÉRIFIÉ.
 *
 * Rater la seconde moitié ne casse rien de visible : l'invitation existe, l'email
 * est parti, l'invité s'inscrit — et ne voit jamais rien, parce que l'inbox lit
 * `invited_user_id`. D'où les assertions sur les FILTRES du rattachement (email
 * non confirmé, ligne déjà rattachée, invitation expirée), et pas seulement sur
 * son résultat heureux.
 *
 * Le double PostgREST applique les filtres pour de vrai : un test qui ne les
 * appliquerait pas ne dirait rien de la requête qu'on écrit.
 */

interface Row extends Record<string, unknown> {
  id: string;
}

let projectRows: Row[] = [];
let memberRows: Row[] = [];
let invitationRows: Row[] = [];
/** Comptes minddy existants, par email — ce que `findAuthUserByEmail` voit. */
let accounts = new Map<string, { id: string }>();
/** Les travaux d'arrière-plan programmés, à attendre explicitement. */
let background: Promise<unknown>[] = [];

let nextId = 0;
const newId = () => `row-${++nextId}`;

/** Double de chaîne PostgREST : accumule les filtres, puis lit/insère/modifie. */
function table(name: string, rows: () => Row[]) {
  const filters: ((row: Row) => boolean)[] = [];
  /** `limit(n)` : tronque après les filtres, comme PostgREST. */
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

  /** L'insertion, avec l'index unique partiel de `project_invitations`. */
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
    // Les défauts de la migration MIN-197, posés par la base.
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

/** Les comptes que l'API admin rend, par id — ce que voit `fetchAuthUsersById`.
    Vide = on retombe sur le compte générique des tests d'invitation, qui n'a pas
    d'email confirmé (il n'en a pas besoin : il est l'INVITANT, pas l'invité). */
let adminAccounts = new Map<string, Record<string, unknown>>();
/** Combien de fois l'API admin a été touchée — la sonde du rattrapage existe
    pour que ce compteur reste à zéro quand il n'y a rien à réclamer. */
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

// La notification push est hors sujet ici : coupée, `pushInvitation` ne fait rien.
vi.mock("@/lib/server/push/vapid", () => ({ isPushConfigured: () => false }));
vi.mock("@/lib/server/push/send", () => ({ sendPushToUser: async () => undefined }));

const sendInvitationEmail = vi.fn(async (_params: Record<string, unknown>) => true);
vi.mock("@/lib/server/invitation-email", () => ({
  sendInvitationEmail: (params: Record<string, unknown>) => sendInvitationEmail(params),
}));

// Le crochet d'arrière-plan, rendu observable : on garde la promesse pour
// pouvoir l'attendre — sans jamais la détacher, comme le vrai `afterOrNow`.
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

describe("inviteMember — une adresse sans compte", () => {
  it("refuse une invitation externe impossible à livrer", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "");

    const result = await inviteMember({
      projectId: PROJECT,
      actorId: OWNER,
      email: "nouvelle@example.test",
    });

    expect(result).toEqual({
      ok: false,
      status: 503,
      errorKey: "invitationEmailUnavailable",
    });
    expect(invitationRows).toHaveLength(0);
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

  // L'énumération de comptes : `invited_user_id` rendu au client dirait, pour
  // n'importe quelle adresse qu'on saisit, si elle a un compte minddy. Les deux
  // cas sont vérifiés — l'adresse inconnue ET celle qui a un compte, puisque
  // c'est justement la DIFFÉRENCE entre les deux réponses qui serait l'oracle.
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
    // La colonne est bien écrite en base : c'est la RÉPONSE qui la tait.
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

  // La contrepartie du 409 ci-dessus. L'index unique partiel ne connaît que
  // `status = 'pending'`, et rien ne repasse une invitation périmée à un autre
  // statut : sans le ménage fait avant l'insertion, une adresse restait bannie
  // du projet entre son expiration (30 j) et la purge de `retention.ts` (90 j).
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
 * Le rattrapage des sessions qui ne passent pas par /auth/callback — une
 * connexion par mot de passe. Ce qu'on épingle surtout, c'est que la
 * confirmation d'email se REVÉRIFIE côté service : l'objet passé ici vient des
 * claims du JWT et ne porte pas `email_confirmed_at`, donc croire ce qu'on lui
 * donne reviendrait à ne plus avoir de garde du tout.
 */
describe("claimPendingInvitationsLate", () => {
  const LATE = "66666666-6666-4666-8666-666666666666";
  /** Ce que rend `getAuthedUser` : un id, un email, et rien de vérifiable. */
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

  // La garde ne peut pas venir de la session : le compte fait foi.
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
