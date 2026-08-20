import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-133 — the trash must cost NOTHING to the plan.
 *
 * This is the trap of any soft delete: the line remains in base, and a guard of
 * plan written in “counts the lines” begins to charge what the user
 * believes he has deleted. A Free account capped at 2 projects and 300 tickets would find
 * blocked just after cleaning up — the worst time.
 *
 * These tests highlight the only valid rule: what is in the trash is
 * removed from the count, immediately, without waiting for the 30-day purge. The double Supabase therefore applies the filters for real, otherwise it wouldn't say anything that custody really matters. that we count is not only what exists (the members)
 * but also what is promised (the pending invitations).
 */

interface Row extends Record<string, unknown> {
  id: string;
  owner_id?: string;
  project_id?: string;
  user_id?: string;
  status?: string;
  deleted_at?: string | null;
}

let projectRows: Row[] = [];
let issueRows: Row[] = [];
let memberRows: Row[] = [];
let invitationRows: Row[] = [];

/** The plan the guard reads — rewritten by the tests that change tiers. */
let plan: {
  maxProjects: number | null;
  maxIssuesPerProject: number | null;
  maxMembersPerProject: number | null;
};

/** PostgREST string duplicate: accumulate filters, then count. */
function table(rows: () => Row[]) {
  const filters: ((row: Row) => boolean)[] = [];
  const query: Record<string, unknown> = {};
  const self = () => query;

  query.select = self;
  query.eq = (column: string, value: unknown) => {
    filters.push((row) => (row as Record<string, unknown>)[column] === value);
    return query;
  };
  query.is = (column: string, value: unknown) => {
    filters.push(
      (row) => ((row as Record<string, unknown>)[column] ?? null) === value
    );
    return query;
  };
  query.gt = (column: string, value: unknown) => {
    filters.push(
      (row) =>
        Date.parse(String((row as Record<string, unknown>)[column])) >
        Date.parse(String(value))
    );
    return query;
  };
  // `or("owner_id.eq.X,id.in.(a,b)")` — the only form used by the guard.
  query.or = (expression: string) => {
    const owner = /owner_id\.eq\.([^,)]+)/.exec(expression)?.[1];
    const ids = /id\.in\.\(([^)]*)\)/.exec(expression)?.[1];
    const idSet = new Set((ids ?? "").split(",").filter(Boolean));
    filters.push((row) => row.owner_id === owner || idSet.has(row.id));
    return query;
  };
  query.maybeSingle = async () => ({
    data: rows().find((row) => filters.every((f) => f(row))) ?? null,
    error: null,
  });
  // A `select()` is awaited as is, with or without `{ count: "exact", head }`:
  // we render both forms, the guard only reads the one that concerns it.
  query.then = (resolve: (value: unknown) => unknown) => {
    const matching = rows().filter((row) => filters.every((f) => f(row)));
    return Promise.resolve({
      data: matching,
      count: matching.length,
      error: null,
    }).then(resolve);
  };

  return query;
}

const TABLES: Record<string, () => Row[]> = {
  projects: () => projectRows,
  issues: () => issueRows,
  project_members: () => memberRows,
  project_invitations: () => invitationRows,
};

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (name: string) => table(TABLES[name] ?? (() => [])),
  }),
}));

vi.mock("@/lib/server/billing-accounts", () => ({
  getResolvedBilling: async () => ({ plan }),
}));

vi.mock("@/lib/server/usage", () => ({ hasUsageBudget: async () => true }));

import {
  countAccessibleProjects,
  ensureIssueLimit,
  ensureMemberSlotAvailable,
  ensureProjectLimit,
} from "./entitlements";

const OWNER = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const TRASHED = "2026-07-01T00:00:00.000Z";

beforeEach(() => {
  process.env.MINDDY_EDITION = "cloud";
  process.env.MINDDY_MANAGED_BILLING = "1";
  process.env.STRIPE_SECRET_KEY = "sk_test";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  process.env.STRIPE_PRICE_ID_GO = "price_go";
  process.env.STRIPE_PRICE_ID_PRO = "price_pro";
  process.env.STRIPE_PRICE_ID_GO_YEARLY = "price_go_year";
  process.env.STRIPE_PRICE_ID_PRO_YEARLY = "price_pro_year";
  projectRows = [];
  issueRows = [];
  memberRows = [];
  invitationRows = [];
  // Free plan: 2 projects, 300 issues per project, and 3 guests per project.
  plan = { maxProjects: 2, maxIssuesPerProject: 300, maxMembersPerProject: 3 };
});

describe("project limit", () => {
  it("sells no structural limit to a self-hosted instance", async () => {
    process.env.MINDDY_EDITION = "self-hosted";
    process.env.MINDDY_MANAGED_BILLING = "";
    projectRows = [
      { id: "p1", owner_id: OWNER, deleted_at: null },
      { id: "p2", owner_id: OWNER, deleted_at: null },
    ];

    await expect(ensureProjectLimit(OWNER)).resolves.toBeUndefined();
  });

  it("does not count a trashed project", async () => {
    projectRows = [
      { id: "p1", owner_id: OWNER, deleted_at: null },
      { id: "p2", owner_id: OWNER, deleted_at: TRASHED },
    ];
    await expect(countAccessibleProjects(OWNER)).resolves.toBe(1);
  });

  it("frees a slot for a full account as soon as one project is trashed", async () => {
    projectRows = [
      { id: "p1", owner_id: OWNER, deleted_at: null },
      { id: "p2", owner_id: OWNER, deleted_at: null },
    ];
    await expect(ensureProjectLimit(OWNER)).rejects.toThrow();

    projectRows[1].deleted_at = TRASHED;
    await expect(ensureProjectLimit(OWNER)).resolves.toBeUndefined();
  });
});

describe("ticket limit per project", () => {
  const fill = (n: number, deleted: string | null) =>
    Array.from({ length: n }, (_, i) => ({
      id: `i${deleted ? "d" : ""}${i}`,
      project_id: PROJECT,
      deleted_at: deleted,
    }));

  it("does not count trashed tickets", async () => {
    projectRows = [{ id: PROJECT, owner_id: OWNER, deleted_at: null }];
    issueRows = [...fill(299, null), ...fill(50, TRASHED)];
    await expect(ensureIssueLimit(PROJECT)).resolves.toBeUndefined();
  });

  it("blocks when the cap is reached by LIVE tickets", async () => {
    projectRows = [{ id: PROJECT, owner_id: OWNER, deleted_at: null }];
    issueRows = fill(300, null);
    await expect(ensureIssueLimit(PROJECT)).rejects.toThrow();
  });
});

describe("guest cap per project (MIN-199)", () => {
  const member = (n: number): Row => ({
    id: `m${n}`,
    project_id: PROJECT,
    user_id: `u${n}`,
  });
  // `expires_at` is NOT NULL in base (MIN-197): double models it, otherwise
  // it would test for a line that cannot exist.
  const LIVE = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const DEAD = new Date(Date.now() - 86_400_000).toISOString();
  const invitation = (n: number, status: string, expires = LIVE): Row => ({
    id: `inv${n}`,
    project_id: PROJECT,
    status,
    expires_at: expires,
  });

  it("allows the first three guests on the free plan", async () => {
    await expect(
      ensureMemberSlotAvailable(OWNER, PROJECT)
    ).resolves.toBeUndefined();

    memberRows = [member(1)];
    await expect(
      ensureMemberSlotAvailable(OWNER, PROJECT)
    ).resolves.toBeUndefined();

    memberRows = [member(1), member(2)];
    await expect(ensureMemberSlotAvailable(OWNER, PROJECT)).resolves.toBeUndefined();

    memberRows = [member(1), member(2), member(3)];
    await expect(ensureMemberSlotAvailable(OWNER, PROJECT)).rejects.toThrow();
  });

  it("counts a PENDING invitation as an occupied slot", async () => {
    memberRows = [member(1), member(2)];
    invitationRows = [invitation(1, "pending")];
    await expect(ensureMemberSlotAvailable(OWNER, PROJECT)).rejects.toThrow();
  });

  it("frees a slot for a cancelled or accepted invitation", async () => {
    memberRows = [member(1)];
    invitationRows = [invitation(1, "cancelled"), invitation(2, "accepted")];
    await expect(
      ensureMemberSlotAvailable(OWNER, PROJECT)
    ).resolves.toBeUndefined();
  });

  // Nothing reverts an expired invitation to another status: it remains
  // `pending` until the 90 days have been purged. If it counted, a place in the plan
  // would remain taken for two months by an invitation that no one can anymore
  // accept — the trap of MIN-133 (the expensive trash) in another form.
  it("frees a slot for an EXPIRED invitation that remained pending", async () => {
    memberRows = [member(1)];
    invitationRows = [invitation(1, "pending", DEAD)];
    await expect(
      ensureMemberSlotAvailable(OWNER, PROJECT)
    ).resolves.toBeUndefined();
  });

  it("counts only the targeted project", async () => {
    memberRows = [
      { id: "m1", project_id: "autre-projet", user_id: "u1" },
      { id: "m2", project_id: "autre-projet", user_id: "u2" },
    ];
    await expect(
      ensureMemberSlotAvailable(OWNER, PROJECT)
    ).resolves.toBeUndefined();
  });

  it("never counts anything when the plan is unlimited (Go and Pro)", async () => {
    plan.maxMembersPerProject = null;
    memberRows = Array.from({ length: 50 }, (_, i) => member(i));
    await expect(
      ensureMemberSlotAvailable(OWNER, PROJECT)
    ).resolves.toBeUndefined();
  });

  it("does not downgrade a project already above its cap", async () => {
    // An expired subscription leaves four guests in place; only the next
    // invitation is refused. Enforcement happens on invitation, never
    // retroactively.
    memberRows = [member(1), member(2), member(3), member(4)];
    await expect(ensureMemberSlotAvailable(OWNER, PROJECT)).rejects.toThrow();
    expect(memberRows).toHaveLength(4);
  });
});
