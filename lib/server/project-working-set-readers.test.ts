import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./encryption/store";
import { encodeIssue } from "./issue-store";
import { encodeObjective } from "./objective-store";
import { loadProjectIssues, loadProjectMembers, loadProjectObjectives } from "./project-working-set-readers";

const state = vi.hoisted(() => ({ store: null as EncryptedStore | null,
  client: null as SupabaseClient | null, service: null as SupabaseClient | null,
  actor: "", denied: false, names: vi.fn(), avatars: vi.fn(), decryptInvitation: vi.fn() }));
vi.mock("./encryption/registry", () => ({ getEncryptedStore: () => state.store }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => state.service }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key, getLocale: async () => "en" }));
vi.mock("./api-auth", () => ({ getAuthedUser: async () => state.denied
  ? { ok: false, response: new Response(null, { status: 401 }) }
  : { ok: true, user: { id: state.actor }, supabase: state.client } }));
vi.mock("./auth-users", () => ({ fetchAuthUsersById: (...args: unknown[]) => state.names(...args),
  toNamed: (user?: { email: string; full_name: string }) => ({ email: user?.email ?? null, full_name: user?.full_name ?? null }) }));
vi.mock("./avatar-seeds", () => ({ fetchAvatarSeeds: (...args: unknown[]) => state.avatars(...args) }));
vi.mock("./encryption/invitation-email", async (original) => ({
  ...await original<typeof import("./encryption/invitation-email")>(),
  decryptInvitationEmail: (...args: unknown[]) => state.decryptInvitation(...args),
}));
// Route writes stay outside these read-contract tests.
vi.mock("./create-issue", () => ({ createIssueForProject: vi.fn() }));
vi.mock("./objectives", () => ({ createObjective: vi.fn() }));
vi.mock("./members", () => ({ inviteMember: vi.fn(), removeMember: vi.fn(), cancelInvitation: vi.fn() }));

type Row = Record<string, unknown>;
const id = (index: number) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
const projectId = id(90000), ownerId = id(90001), memberId = id(90002);
const issue = (index: number): Row => ({ id: id(index), project_id: projectId, title: `Issue ${index}`,
  number: index, position: index % 7, deleted_at: null, issue_categories: [{ category_id: id(90003) }] });
const objective = (index: number): Row => ({ id: id(index), project_id: projectId,
  name: `Objective ${index}`, description: null, created_at: `2026-10-${String(index % 28 + 1).padStart(2, "0")}T00:00:00Z` });
const invitation = (index: number): Row => ({ id: id(index), project_id: projectId,
  invited_email: `guest${index}@example.test`, invited_email_ciphertext: null, invited_email_blind_index: null,
  encryption_version: 0, status: "pending", expires_at: "2099-01-01T00:00:00Z", created_at: String(index).padStart(6, "0") });

function fixture(tables: Record<string, Row[]>, options: { cap?: number; failTable?: string; failAt?: number; legacy?: boolean } = {}) {
  const calls: Array<{ table: string; select: string; count?: string; orders: string[];
    limit?: number; filters: Array<{ kind: string; column: string; value: unknown }> }> = [];
  const executions = new Map<string, number>();
  const client = { from(table: string) {
    const call: typeof calls[number] = { table, select: "", orders: [], filters: [] };
    const query = {
      select(selection: string, config?: { count?: string }) { call.select = selection; call.count = config?.count; return query; },
      returns() { return query; },
      order(column: string) { call.orders.push(column); return query; },
      limit(value: number) { call.limit = value; return query; },
      eq(column: string, value: unknown) { call.filters.push({ kind: "eq", column, value }); return query; },
      is(column: string, value: unknown) { call.filters.push({ kind: "eq", column, value }); return query; },
      gt(column: string, value: unknown) { call.filters.push({ kind: "gt", column, value }); return query; },
      maybeSingle() { return execute(true); },
      then(resolve: (result: unknown) => unknown, reject?: (error: unknown) => unknown) { return execute(false).then(resolve, reject); },
    };
    async function execute(single: boolean) {
      calls.push(call);
      const number = (executions.get(table) ?? 0) + 1; executions.set(table, number);
      if (table === options.failTable && number === (options.failAt ?? 1))
        return { data: null, error: { code: "57014", message: "Private SQL" } };
      if (options.legacy && table === "project_invitations" && call.select.includes("invited_email_ciphertext"))
        return { data: null, error: { code: "42703", message: "Private SQL" } };
      const rows = (tables[table] ?? []).filter((row) => call.filters.every(({ kind, column, value }) =>
        kind === "eq" ? row[column] === value : String(row[column]) > String(value)))
        // Represent the ordinary user's unchanged RLS, including soft deletion.
        .filter((row) => table !== "issues" && table !== "objectives" || row.project_id === projectId && row.deleted_at == null)
        .sort((a, b) => { const column = call.orders[0] ?? "id"; return String(a[column]).localeCompare(String(b[column])); });
      return { data: single ? rows[0] ?? null : rows.slice(0, Math.min(options.cap ?? 1000, call.limit ?? Infinity)),
        error: null, count: call.count === "exact" ? rows.length : null };
    }
    return query;
  } } as unknown as SupabaseClient;
  return { client, calls };
}
const auth = (client: SupabaseClient) => ({ supabase: client, user: { id: state.actor } });
const failure = { ok: false, status: 500, errorKey: "databaseError" };

beforeEach(() => {
  vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
  vi.stubEnv("MINDDY_ISSUE_SOURCE_ENCRYPTION_ENABLED", "true");
  vi.stubEnv("MINDDY_DATA_ROOT_KEY", "1".repeat(64));
  const key = randomBytes(32);
  state.store = new EncryptedStore({ current: async () => ({ version: 1, bytes: Buffer.from(key) }),
    byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }) });
  state.actor = ownerId; state.denied = false;
  state.names.mockReset().mockImplementation(async (_service, ids: string[]) => new Map(ids.map((value) =>
    [value, { email: `${value}@example.test`, full_name: `Member ${value}` }])));
  state.avatars.mockReset().mockImplementation(async (_service, ids: string[]) => new Map(ids.map((value) => [value, `seed:${value}`])));
  state.decryptInvitation.mockReset().mockImplementation(async (row: Row) => row.invited_email);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("ordinary project working-set readers", () => {
  it.each([250, 1000])("returns complete issue DTOs and resource counts under server cap %i", async (cap) => {
    const rows = Array.from({ length: 1206 }, (_, index) => issue(index + 1));
    const attachments = Array.from({ length: 1206 }, (_, index) => ({ id: id(index + 2000),
      project_id: projectId, issue_id: id(1206), comment_id: null }));
    const f = fixture({ issues: rows, attachments: [...attachments,
      { id: id(5000), project_id: projectId, issue_id: id(1206), comment_id: id(6000) },
      { id: id(5001), project_id: id(80000), issue_id: id(1206), comment_id: null }] }, { cap });
    const result = await loadProjectIssues(auth(f.client), projectId);
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.data).toHaveLength(1206);
    expect(result.data.find((row) => row.id === id(1206))).toMatchObject({ resource_count: 1206, category_ids: [id(90003)] });
    expect(result.data[0]).not.toHaveProperty("issue_categories");
    expect(result.data.map((row) => row.id)).toEqual([...rows].sort((a, b) =>
      Number(a.position) - Number(b.position) || Number(a.number) - Number(b.number)).map((row) => row.id));
    expect(f.calls.filter((call) => call.table === "issues")).toHaveLength(Math.ceil(1206 / cap));
    expect(f.calls.every((call) => call.count === "exact" && call.limit === 1000 && call.orders.join() === "id" &&
      call.filters.some((filter) => filter.column === "project_id" && filter.value === projectId))).toBe(true);
  });

  it("decodes every protected issue batch with ordinary RLS and never exposes storage metadata", async () => {
    const first = await encodeIssue({ ...issue(1), title: "Accepted source" });
    const second = await encodeIssue({ ...issue(2), title: "Second accepted source" });
    const f = fixture({ issues: [second, first,
      { ...issue(3), project_id: id(80000), encrypted_content: "Forbidden encrypted content" },
      { ...issue(4), deleted_at: "2026-10-01", encrypted_content: "Deleted encrypted content" }] }, { cap: 1 });
    const result = await loadProjectIssues(auth(f.client), projectId);
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.data.map((row) => row.title)).toEqual(["Accepted source", "Second accepted source"]);
    expect(JSON.stringify(result.data)).not.toMatch(/encrypted_content|encryption_version|Forbidden|Deleted/);
  });

  it.each(["database", "decode"])("fails closed after a later issue %s failure", async (kind) => {
    const rows = [issue(1), kind === "decode" ? { ...await encodeIssue(issue(2)), encrypted_content: "Broken protected content" } : issue(2)];
    const f = fixture({ issues: rows }, { cap: 1, ...(kind === "database" ? { failTable: "issues", failAt: 2 } : {}) });
    expect(await loadProjectIssues(auth(f.client), projectId)).toEqual(failure);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("Private SQL");
  });

  it("preserves best-effort counts when a later attachment page fails", async () => {
    const f = fixture({ issues: [issue(1)], attachments: [1, 2].map((index) =>
      ({ id: id(index + 100), project_id: projectId, issue_id: id(1), comment_id: null })) },
    { cap: 1, failTable: "attachments", failAt: 2 });
    const result = await loadProjectIssues(auth(f.client), projectId);
    expect(result).toMatchObject({ ok: true, data: [{ id: id(1), resource_count: 0 }] });
  });

  it.each([250, 1000])("returns every decrypted objective in creation order under cap %i", async (cap) => {
    const rows = Array.from({ length: 1206 }, (_, index) => objective(index + 1));
    rows[1205] = await encodeObjective({ ...rows[1205], name: "Accepted last goal" });
    const f = fixture({ objectives: rows }, { cap });
    const result = await loadProjectObjectives(auth(f.client), projectId);
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.data).toHaveLength(1206);
    expect(result.data.find((row) => row.id === id(1206))?.name).toBe("Accepted last goal");
    expect(result.data.map((row) => row.id)).toEqual([...rows].sort((a, b) =>
      String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id))).map((row) => row.id));
    expect(JSON.stringify(result.data)).not.toMatch(/encrypted_content|encryption_version/);
    expect(f.calls).toHaveLength(Math.ceil(1206 / cap));
  });

  it.each(["database", "decode"])("fails closed after a later objective %s failure", async (kind) => {
    const rows = [objective(1), kind === "decode" ? { ...await encodeObjective(objective(2)), encrypted_content: "Broken protected content" } : objective(2)];
    const f = fixture({ objectives: rows }, { cap: 1, ...(kind === "database" ? { failTable: "objectives", failAt: 2 } : {}) });
    expect(await loadProjectObjectives(auth(f.client), projectId)).toEqual(failure);
  });

  it("preserves all members, owner enrichment and owner-only invitations beyond a lower cap", async () => {
    const members = Array.from({ length: 1206 }, (_, index) => ({ user_id: id(index + 1),
      project_id: projectId, role: "member", created_at: String(1206 - index).padStart(6, "0") }));
    const f = fixture({ projects: [{ id: projectId, owner_id: ownerId, deleted_at: null }],
      project_members: members, project_invitations: Array.from({ length: 1001 }, (_, index) => invitation(index + 2000)) }, { cap: 250 });
    state.service = f.client;
    const result = await loadProjectMembers(auth(f.client), projectId);
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.data.members).toHaveLength(1207); expect(result.data.invitations).toHaveLength(1001);
    expect(result.data.members[0]).toMatchObject({ user_id: ownerId, role: "owner", is_owner: true, avatar_seed: `seed:${ownerId}` });
    expect(result.data.members[1].user_id).toBe(id(1206));
    expect(result.data.invitations[0].id).toBe(id(3000));
    expect(result.data.isOwner).toBe(true);
    expect(state.decryptInvitation).toHaveBeenCalledTimes(1001);
    expect(state.decryptInvitation.mock.calls[0][1]).toEqual({ actorId: ownerId, reason: "invitation_list" });
    expect(f.calls.filter((call) => call.table === "project_members")).toHaveLength(5);
  });

  it("checks membership from the complete collection and never decrypts invitations for a non-owner", async () => {
    state.actor = id(1206);
    const f = fixture({ projects: [{ id: projectId, owner_id: ownerId, deleted_at: null }],
      project_members: Array.from({ length: 1206 }, (_, index) => ({ user_id: id(index + 1), project_id: projectId,
        role: "member", created_at: "2026-10-01" })), project_invitations: [invitation(2000)] }, { cap: 250 });
    state.service = f.client;
    expect(await loadProjectMembers(auth(f.client), projectId)).toMatchObject({ ok: true, data: { isOwner: false, invitations: [] } });
    expect(state.decryptInvitation).not.toHaveBeenCalled();
  });

  it.each(["projects", "project_members", "project_invitations"])("does not disguise a %s database error as an owner-only success", async (table) => {
    const f = fixture({ projects: [{ id: projectId, owner_id: ownerId, deleted_at: null }] }, { failTable: table });
    state.service = f.client;
    expect(await loadProjectMembers(auth(f.client), projectId)).toEqual(failure);
    expect(state.names).not.toHaveBeenCalled(); expect(state.avatars).not.toHaveBeenCalled();
  });

  it.each(["project_members", "project_invitations"])("publishes no earlier %s batch when a later page fails", async (table) => {
    const f = fixture({ projects: [{ id: projectId, owner_id: ownerId, deleted_at: null }],
      project_members: [1, 2].map((index) => ({ user_id: id(index), project_id: projectId, role: "member", created_at: "2026-10-01" })),
      project_invitations: [invitation(2000), invitation(2001)] }, { cap: 1, failTable: table, failAt: 2 });
    state.service = f.client;
    expect(await loadProjectMembers(auth(f.client), projectId)).toEqual(failure);
    expect(state.decryptInvitation).not.toHaveBeenCalled(); expect(state.names).not.toHaveBeenCalled();
    expect(f.calls.filter((call) => call.table === table)).toHaveLength(2);
  });

  it("fails the entire owner DTO when an accepted invitation cannot be decoded", async () => {
    const f = fixture({ projects: [{ id: projectId, owner_id: ownerId, deleted_at: null }],
      project_invitations: [invitation(2000), invitation(2001)] }, { cap: 1 }); state.service = f.client;
    state.decryptInvitation.mockImplementation(async (row: Row) => {
      if (row.id === id(2001)) throw new Error("Private protected invitation");
      return row.invited_email;
    });
    expect(await loadProjectMembers(auth(f.client), projectId)).toEqual(failure);
    expect(state.names).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("Private protected invitation");
  });

  it.each(["missing", "deleted", "denied"])("keeps the ordinary project-not-found result for %s access", async (kind) => {
    state.actor = memberId;
    const f = fixture({ projects: kind === "missing" ? [] : [{ id: projectId, owner_id: ownerId,
      deleted_at: kind === "deleted" ? "2026-10-01" : null }], project_invitations: [invitation(2000)] });
    state.service = f.client;
    expect(await loadProjectMembers(auth(f.client), projectId)).toEqual({ ok: false, status: 404, errorKey: "projectNotFound" });
    expect(state.decryptInvitation).not.toHaveBeenCalled(); expect(state.names).not.toHaveBeenCalled();
  });

  it("uses the legacy invitation projection only for a missing encryption schema", async () => {
    const f = fixture({ projects: [{ id: projectId, owner_id: ownerId, deleted_at: null }],
      project_invitations: [invitation(2000)] }, { legacy: true }); state.service = f.client;
    expect(await loadProjectMembers(auth(f.client), projectId)).toMatchObject({ ok: true,
      data: { invitations: [{ id: id(2000), invited_email: "guest2000@example.test" }] } });
    expect(f.calls.filter((call) => call.table === "project_invitations").map((call) => call.select)).toHaveLength(2);
  });

  it.each(["issues", "members", "objectives"])("uses the same complete reader from the ordinary %s GET", async (kind) => {
    const f = fixture({ issues: [issue(1), issue(2)], objectives: [objective(1), objective(2)],
      projects: [{ id: projectId, owner_id: ownerId, deleted_at: null }], project_invitations: [] }, { cap: 1 });
    state.client = state.service = f.client;
    const readers = { issues: loadProjectIssues, members: loadProjectMembers, objectives: loadProjectObjectives };
    const expected = await readers[kind as keyof typeof readers](auth(f.client), projectId);
    expect(expected.ok).toBe(true);
    const route = kind === "issues" ? await import("@/app/api/projects/[id]/issues/route")
      : kind === "members" ? await import("@/app/api/projects/[id]/members/route")
      : await import("@/app/api/projects/[id]/objectives/route");
    const response = await route.GET(new Request(`https://example.test/api/projects/${projectId}/${kind}`) as never,
      { params: Promise.resolve({ id: projectId }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expected.ok ? expected.data : null);
  });

  it("keeps localized GET errors and does not publish an earlier successful issue batch", async () => {
    const f = fixture({ issues: [issue(1), issue(2)] }, { cap: 1, failTable: "issues", failAt: 2 }); state.client = f.client;
    const { GET } = await import("@/app/api/projects/[id]/issues/route");
    const response = await GET(new Request("https://example.test") as never, { params: Promise.resolve({ id: projectId }) });
    expect(response.status).toBe(500); expect(await response.json()).toEqual({ error: "databaseError" });
  });

  it("does not read any project data when ordinary authentication rejects", async () => {
    state.denied = true; const f = fixture({ issues: [issue(1)] }); state.client = f.client;
    const { GET } = await import("@/app/api/projects/[id]/issues/route");
    expect((await GET(new Request("https://example.test") as never, { params: Promise.resolve({ id: projectId }) })).status).toBe(401);
    expect(f.calls).toEqual([]);
  });
});
