import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ service: null as unknown }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => h.service }));
const { localSnapshotProjectAccess, assertDraftProjectsAccess } = await import("./local-snapshot-access");
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const owned = "33333333-3333-4333-8333-333333333333";
const shared = "44444444-4444-4444-8444-444444444444";
type Project = { id: string; owner_id: string; deleted_at: string | null };
type Member = { project_id: string; user_id: string; role: string };

function fixture() {
  const state = { projects: [
    { id: owned, owner_id: owner, deleted_at: null },
    { id: shared, owner_id: other, deleted_at: null },
  ] as Project[], members: [{ project_id: shared, user_id: owner, role: "member" }] as Member[],
  error: false, calls: [] as { table: string; fields: string; limit: number }[] };
  h.service = {
    from: (table: string) => {
      let fields = ""; let after: string | null = null;
      const conditions = new Map<string, unknown>();
      const query = {
        select: (selection: string) => { fields = selection; return query; },
        eq: (key: string, value: unknown) => { conditions.set(key, value); return query; },
        is: (key: string, value: unknown) => { conditions.set(key, value); return query; },
        gt: (_key: string, value: string) => { after = value; return query; },
        order: () => query,
        limit: async (limit: number) => {
          state.calls.push({ table, fields, limit });
          if (state.error) return { data: null, error: { code: "unavailable" } };
          if (table === "projects") return { data: state.projects.filter((project) =>
            project.owner_id === conditions.get("owner_id") && project.deleted_at === null &&
            (after === null || project.id > after)).sort((a, b) => a.id.localeCompare(b.id)).slice(0, limit), error: null };
          return { data: state.members.filter((member) => member.user_id === conditions.get("user_id"))
            .map((member) => ({ ...member, project: state.projects.find((project) => project.id === member.project_id) }))
            .filter((member) => member.project?.deleted_at === null && (after === null || member.project_id > after))
            .sort((a, b) => a.project_id.localeCompare(b.project_id)).slice(0, limit), error: null };
        },
      };
      return query;
    },
  };
  return state;
}
beforeEach(() => { h.service = null; });

describe("local snapshot current project access", () => {
  it("reads only bounded opaque access fields and produces a stable fingerprint", async () => {
    const state = fixture();
    const first = await localSnapshotProjectAccess(owner);
    state.projects.reverse(); state.members.reverse();
    expect(await localSnapshotProjectAccess(owner)).toEqual(first);
    expect(first.projectIds).toEqual(new Set([owned, shared]));
    expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    for (const call of state.calls) {
      expect(call.fields).not.toMatch(/name|encrypted_content|\*/);
      expect(call.limit).toBe(300);
    }
  });
  it.each(["membership", "owner", "role", "trash", "erase"])(
    "changes the proof when current %s access changes", async (change) => {
      const state = fixture();
      const original = await localSnapshotProjectAccess(owner);
      if (change === "membership") state.members = [];
      if (change === "owner") state.projects[0].owner_id = other;
      if (change === "role") state.members[0].role = "reader";
      if (change === "trash") state.projects[1].deleted_at = "2026-09-29T00:00:00Z";
      if (change === "erase") state.projects.splice(1, 1);
      expect((await localSnapshotProjectAccess(owner)).fingerprint).not.toBe(original.fingerprint);
    });
  it("does not seal drafts targeting a removed, trashed, or foreign project", async () => {
    const state = fixture();
    await expect(assertDraftProjectsAccess(owner, [{ projectId: owned }, { projectId: shared }])).resolves.toBeUndefined();
    state.members = [];
    await expect(assertDraftProjectsAccess(owner, [{ projectId: shared }])).rejects.toThrow("unavailable");
    state.projects[0].deleted_at = "2026-09-29T00:00:00Z";
    await expect(assertDraftProjectsAccess(owner, [{ projectId: owned }])).rejects.toThrow("unavailable");
    await expect(assertDraftProjectsAccess(other, [{ projectId: "foreign" }])).rejects.toThrow("unavailable");
  });
  it("fails closed when access cannot be read", async () => {
    const state = fixture(); state.error = true;
    await expect(localSnapshotProjectAccess(owner)).rejects.toThrow("Unable to verify");
    await expect(assertDraftProjectsAccess(owner, [{ projectId: owned }])).rejects.toThrow();
  });
  it("paginates past the first access batch", async () => {
    const state = fixture();
    state.projects = Array.from({ length: 301 }, (_, index) => ({
      id: `33333333-3333-4333-8333-${index.toString().padStart(12, "0")}`,
      owner_id: owner, deleted_at: null,
    }));
    state.members = [];
    const access = await localSnapshotProjectAccess(owner);
    expect(access.projectIds.size).toBe(301);
    expect(state.calls.filter((call) => call.table === "projects")).toHaveLength(2);
  });
});
