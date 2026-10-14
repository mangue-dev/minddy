import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppTab } from "@/lib/app-tabs";
import type { Page } from "@/lib/pages";
import type { RestoredPageBootstrapRecord } from "@/lib/restored-page-bootstrap-types";
import type { AuthedResult } from "./api-auth";
import { boundedRestoredPageReads, restoredPageDestinations, startRestoredPageWorkingSet } from "./restored-page-working-set";

const mocks = vi.hoisted(() => ({ tabs: vi.fn(), page: vi.fn(), pages: vi.fn(), issues: vi.fn(), members: vi.fn(), objectives: vi.fn() }));
vi.mock("./app-tabs", () => ({ listAppTabs: mocks.tabs }));
vi.mock("./pages", () => ({ getPage: mocks.page, listPages: mocks.pages }));
vi.mock("./project-working-set-readers", () => ({ loadProjectIssues: mocks.issues, loadProjectMembers: mocks.members, loadProjectObjectives: mocks.objectives }));

const id = (value: number) => `00000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
const ownerId = id(900), projectA = id(0xaaa), projectB = id(0xbbb), projectC = id(0xccc);
const pageA = id(0xddd), pageB = id(0xeee), pageC = id(0xfff);
const href = (projectId: string, pageId: string) => `/projects/${projectId}/pages/${pageId}`;
const tab = (value: number, location: string, patch: Partial<AppTab> = {}): AppTab => ({ id: id(value), user_id: ownerId,
  href: location, custom_name: null, pinned: false, position: value, revision: 1,
  created_at: "2026-10-14T00:00:00Z", updated_at: "2026-10-14T00:00:00Z", ...patch });
const page = (pageId: string, projectId = projectA, patch: Partial<Page> = {}): Page => ({ id: pageId, project_id: projectId,
  parent_id: null, title: "Authorized document", icon: null, content: { type: "doc", content: [{ type: "paragraph" }] }, version: 3,
  position: "a0", created_by: ownerId, updated_by: ownerId, updated_kind: "human", created_at: "2026-10-14T00:00:00Z",
  updated_at: "2026-10-14T00:00:00Z", deleted_at: null, deleted_by: null, deleted_root_id: null, parent_block_removed: false,
  favorite: false, ...patch });
const auth = { ok: true, user: { id: ownerId, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {},
  created_at: "2026-10-14T00:00:00Z" }, claims: { session_id: "verified-test-session" },
  supabase: {} as SupabaseClient } satisfies Extract<AuthedResult, { ok: true }>;
const record = (pageId: string): RestoredPageBootstrapRecord => ({ kind: "page", ownerId, projectId: projectA, pageId,
  complete: true, data: page(pageId) });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.tabs.mockResolvedValue([tab(1, href(projectA, pageA)), tab(2, href(projectB, pageB))]);
  mocks.page.mockImplementation(async (pageId: string) => ({ ok: true, page: page(pageId, pageId === pageB ? projectB : projectA) }));
  mocks.pages.mockResolvedValue({ ok: true, pages: [] });
  mocks.issues.mockResolvedValue({ ok: true, data: [] });
  mocks.members.mockResolvedValue({ ok: true, data: { members: [], invitations: [] } });
  mocks.objectives.mockResolvedValue({ ok: true, data: [] });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Bootstrap must use ordinary readers without HTTP or forge fan-out"));
});
afterEach(() => { vi.restoreAllMocks(); });

describe("canonical restored Page selection", () => {
  it("uses the newest valid owner revision, canonical tab order and at most two distinct explicit Page routes", () => {
    const rows = [
      tab(8, href(projectC, pageC), { user_id: id(999), pinned: true, position: -100 }),
      tab(7, href(projectC, pageC), { revision: 0, pinned: true }),
      tab(6, href(projectC, pageC), { revision: 1.5, pinned: true }),
      tab(5, href(projectC, pageC), { id: "malformed", pinned: true }),
      tab(1, href(projectC, pageC), { revision: 1, position: -10 }),
      tab(1, `${href(projectB, pageB)}?tab=history#anchor`, { revision: 2, position: 20, pinned: true }),
      tab(3, href(projectB, pageB), { position: 21 }),
      tab(2, href(projectA, pageA), { position: 30 }),
      tab(4, href(projectC, pageC), { position: 40 }),
    ];
    expect(restoredPageDestinations(rows, ownerId)).toEqual([{ projectId: projectB, pageId: pageB }, { projectId: projectA, pageId: pageA }]);
    expect(rows[4].href).toBe(href(projectC, pageC));
  });

  it("rejects aliases, implicit trees, external routes and noncanonical UUID spellings", () => {
    const locations = ["/all", "/pull-requests?pr=selected", `/projects/${projectA}/pages`,
      `/projects/${projectA}/pages/last-visited`, `/projects/not-a-uuid/pages/${pageA}`,
      href(projectA.toUpperCase(), pageA), href(projectA, pageA.toUpperCase()),
      `https://example.test${href(projectA, pageA)}`, `//example.test${href(projectA, pageA)}`];
    expect(restoredPageDestinations(locations.map((location, index) => tab(index + 1, location)), ownerId)).toEqual([]);
  });
});

describe("independently bounded record reads", () => {
  it("admits two readers and lets fast records settle while an earlier body remains pending", async () => {
    const gates = Array.from({ length: 5 }, () => deferred<RestoredPageBootstrapRecord | null>());
    const started: number[] = [];
    let active = 0, maximum = 0;
    const reads = gates.map((gate, index) => () => {
      started.push(index); active++; maximum = Math.max(maximum, active);
      return gate.promise.finally(() => { active--; });
    });
    const records = boundedRestoredPageReads(reads);
    expect(started).toEqual([0, 1]);
    let firstSettled = false;
    void records[0].then(() => { firstSettled = true; });
    const second = record(pageB);
    gates[1].resolve(second);
    expect(await records[1]).toBe(second);
    expect(firstSettled).toBe(false);
    expect(started).toEqual([0, 1, 2]);
    for (const gate of gates) gate.resolve(null);
    expect(await Promise.all(records)).toEqual([null, second, null, null, null]);
    expect(maximum).toBe(2); expect(active).toBe(0);
    expect(boundedRestoredPageReads([])).toEqual([]);
  });

  it("isolates synchronous and asynchronous failures as null without publishing private errors", async () => {
    const accepted = record(pageA);
    const results = boundedRestoredPageReads([
      () => { throw new Error("Private document content in a reader failure"); },
      async () => { throw new Error("Private query information in a rejected read"); },
      async () => accepted,
    ]);
    expect(await Promise.all(results)).toEqual([null, null, accepted]);
    expect(vi.mocked(console.error).mock.calls).toEqual([
      ["[restored-page-bootstrap] resource_failed"], ["[restored-page-bootstrap] resource_failed"],
    ]);
  });
});

describe("ordinary authorized bootstrap records", () => {
  it("starts exactly ten complete records for two projects and preserves ordinary DTO identity", async () => {
    const firstBody = page(pageA), secondBody = page(pageB, projectB);
    mocks.page.mockImplementation(async (pageId: string) => ({ ok: true, page: pageId === pageA ? firstBody : secondBody }));
    const workingSet = await startRestoredPageWorkingSet(auth);
    expect(workingSet?.records).toHaveLength(10);
    const records = await Promise.all(workingSet!.records);
    expect(records.map((value) => value?.kind)).toEqual(["page", "page", "pages", "pages", "issues", "members", "objectives", "issues", "members", "objectives"]);
    expect(records[0]).toEqual({ kind: "page", ownerId, projectId: projectA, pageId: pageA, complete: true, data: firstBody });
    expect(records[0]?.data).toBe(firstBody); expect(records[1]?.data).toBe(secondBody);
    expect(records.every((value) => value?.ownerId === ownerId && value.complete)).toBe(true);
    expect(mocks.tabs).toHaveBeenCalledExactlyOnceWith(auth.supabase, ownerId);
    expect(mocks.page.mock.calls).toEqual([[pageA, ownerId], [pageB, ownerId]]);
    expect(mocks.pages.mock.calls).toEqual([[projectA, ownerId], [projectB, ownerId]]);
    for (const reader of [mocks.issues, mocks.members, mocks.objectives]) expect(reader.mock.calls).toEqual([[auth, projectA], [auth, projectB]]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("reuses one project's four shared ordinary records for two different bodies", async () => {
    mocks.tabs.mockResolvedValue([tab(1, href(projectA, pageA)), tab(2, href(projectA, pageB)), tab(3, href(projectA, pageA))]);
    mocks.page.mockImplementation(async (pageId: string) => ({ ok: true, page: page(pageId) }));
    const result = await startRestoredPageWorkingSet(auth);
    expect(result?.records).toHaveLength(6);
    await Promise.all(result!.records);
    expect(mocks.pages).toHaveBeenCalledExactlyOnceWith(projectA, ownerId);
    for (const reader of [mocks.issues, mocks.members, mocks.objectives]) expect(reader).toHaveBeenCalledExactlyOnceWith(auth, projectA);
  });

  it.each([
    { project_id: projectB }, { id: pageC }, { deleted_at: "2026-10-14T00:00:00Z" },
    { deleted_at: undefined }, { version: 0 }, { version: -1 }, { version: 1.5 }, { version: Number.MAX_SAFE_INTEGER + 1 },
    { version: NaN }, { version: Infinity }, { version: undefined },
  ])("rejects a mismatched, deleted or invalid-version Page body: %j", async (patch) => {
    mocks.tabs.mockResolvedValue([tab(1, href(projectA, pageA))]);
    mocks.page.mockResolvedValue({ ok: true, page: page(pageA, projectA, patch) });
    const result = await startRestoredPageWorkingSet(auth);
    const records = await Promise.all(result!.records);
    expect(records[0]).toBeNull();
    expect(records.slice(1).every((value) => value?.complete)).toBe(true);
  });

  it("keeps denied resources null independently and does not retry an ordinary authorization failure", async () => {
    mocks.tabs.mockResolvedValue([tab(1, href(projectA, pageA))]);
    mocks.page.mockResolvedValue({ ok: false, status: 404 });
    mocks.pages.mockResolvedValue({ ok: false, status: 404 });
    mocks.members.mockResolvedValue({ ok: false, status: 404, errorKey: "projectNotFound" });
    const result = await startRestoredPageWorkingSet(auth);
    const records = await Promise.all(result!.records);
    expect(records.map((value) => value?.kind ?? null)).toEqual([null, null, "issues", null, "objectives"]);
    expect(mocks.page).toHaveBeenCalledTimes(1); expect(mocks.members).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("does no resource work for missing destinations or an unavailable canonical tab read", async () => {
    mocks.tabs.mockResolvedValue([tab(1, "/home"), tab(2, "/pull-requests?pr=selected")]);
    expect(await startRestoredPageWorkingSet(auth)).toBeNull();
    mocks.tabs.mockRejectedValueOnce(new Error("Private tab data in transport error"));
    expect(await startRestoredPageWorkingSet(auth)).toBeNull();
    for (const reader of [mocks.page, mocks.pages, mocks.issues, mocks.members, mocks.objectives]) expect(reader).not.toHaveBeenCalled();
    expect(vi.mocked(console.error).mock.calls).toEqual([["[restored-page-bootstrap] tabs_unavailable"]]);
  });
});
