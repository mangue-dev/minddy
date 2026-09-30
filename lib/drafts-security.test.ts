// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ fail: false, generation: 0, switchOnRestore: false, claims: [] as boolean[] }));
vi.mock("./local-snapshots", () => ({
  localSnapshotGeneration: () => fixture.generation,
  restoreLocalSnapshot: async (storage: Storage, key: string) => {
    const value = JSON.parse(storage.getItem(key)!).value;
    if (fixture.switchOnRestore) { fixture.generation++; storage.clear(); }
    return value;
  },
  saveLocalSnapshot: async (storage: Storage, key: string, _slot: string, value: unknown, claim = false) => {
    fixture.claims.push(claim);
    await Promise.resolve();
    if (fixture.fail) throw new Error("fixture seal failure");
    storage.setItem(key, JSON.stringify({ format: "minddy-local-v1", value }));
  },
}));
const { upsertDraft, readDrafts, deleteDraft, LegacyDraftRecoveryRequired } = await import("./drafts");
const draft = (id: string) => ({ id, projectId: "synthetic-project", updatedAt: Date.now(), title: id,
  description: "PRIVATE_DRAFT_SENTINEL", status: "todo" as const, priority: "none" as const, effort: null,
  assignee_id: null, objective_id: null, due_date: null, category_ids: [], resources: [] });
beforeEach(() => { localStorage.clear(); fixture.fail = false; fixture.generation = 0; fixture.switchOnRestore = false; fixture.claims = []; });
it("fences the entire draft mutation across an account switch, not only each request", async () => {
  await upsertDraft("issue", draft("old-account"));
  fixture.switchOnRestore = true;
  await expect(upsertDraft("issue", draft("old-editor"))).rejects.toThrow("account changed");
  expect(localStorage.getItem("minddy:drafts:issue")).toBeNull();
});
it("serializes concurrent draft mutations without losing a recoverable draft", async () => {
  await Promise.all([upsertDraft("issue", draft("first")), upsertDraft("issue", draft("second"))]);
  expect((await readDrafts("issue")).map((item) => item.id).sort()).toEqual(["first", "second"]);
  await Promise.all([deleteDraft("issue", "first"), upsertDraft("issue", draft("third"))]);
  expect((await readDrafts("issue")).map((item) => item.id).sort()).toEqual(["second", "third"]);
});
it("requires explicit legacy recovery and preserves the original when sealing fails", async () => {
  const original = JSON.stringify([draft("legacy")]);
  localStorage.setItem("minddy:drafts:issue", original);
  await expect(readDrafts("issue")).rejects.toBeInstanceOf(LegacyDraftRecoveryRequired);
  fixture.fail = true;
  await expect(readDrafts("issue", true)).rejects.toThrow();
  expect(localStorage.getItem("minddy:drafts:issue")).toBe(original);
  fixture.fail = false;
  expect(await readDrafts("issue", true)).toHaveLength(1);
  expect(fixture.claims).toEqual([true, true]);
});
it("keeps the persisted snapshot on an unsuccessful new save and expires old drafts", async () => {
  await upsertDraft("issue", draft("retained"));
  const original = localStorage.getItem("minddy:drafts:issue");
  fixture.fail = true;
  await expect(upsertDraft("issue", draft("new"))).rejects.toThrow();
  expect(localStorage.getItem("minddy:drafts:issue")).toBe(original);
  fixture.fail = false;
  await upsertDraft("issue", { ...draft("old"), updatedAt: Date.now() - 31 * 24 * 60 * 60 * 1000 });
  expect((await readDrafts("issue")).map((item) => item.id)).toEqual(["retained"]);
});
