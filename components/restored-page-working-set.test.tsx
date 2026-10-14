import { Suspense, type ReactElement } from "react";
import { createRequestStore } from "next/dist/server/async-storage/request-store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RestoredPageBootstrapRecord } from "@/lib/restored-page-bootstrap-types";
import { RestoredPageWorkingSet } from "./restored-page-working-set";

const mocks = vi.hoisted(() => ({ headers: vi.fn(), client: vi.fn(), authorize: vi.fn(), start: vi.fn(), recordView: vi.fn(() => null) }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/supabase-server", () => ({ createServerSupabase: mocks.client }));
vi.mock("@/lib/server/api-auth", () => ({ authorizeUserClient: mocks.authorize }));
vi.mock("@/lib/server/restored-page-working-set", () => ({ startRestoredPageWorkingSet: mocks.start }));
vi.mock("./restored-page-bootstrap-record", () => ({ RestoredPageBootstrapRecordView: mocks.recordView }));

const client = { identity: "request-bound-client" };
const authorized = { ok: true, user: { id: "verified-owner" }, supabase: client, claims: { session_id: "verified-test-session" } };
const documentHeaders = { "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" };
const missingDocumentMetadata: Record<string, string>[] = [
  {}, { "sec-fetch-dest": "document" }, { "sec-fetch-mode": "navigate" },
  { "sec-fetch-dest": "empty", "sec-fetch-mode": "cors" },
  { "sec-fetch-dest": "document", "sec-fetch-mode": "cors" },
  { "sec-fetch-dest": "iframe", "sec-fetch-mode": "navigate" },
];
const record: RestoredPageBootstrapRecord = { kind: "issues", ownerId: "verified-owner", projectId: "authorized-project", complete: true, data: [] };
type RecordProps = { read: Promise<RestoredPageBootstrapRecord | null> };
function readBoundary(boundary: ReactElement<{ children: ReactElement<RecordProps> }>) {
  const child = boundary.props.children;
  return (child.type as (props: RecordProps) => Promise<ReactElement<{ record: RestoredPageBootstrapRecord }> | null>)(child.props);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

/** Use the installed framework's userland header view, not a recreated hidden list. */
function frameworkHeaders(raw: Headers) {
  return createRequestStore({ phase: "render", headers: raw, onUpdateCookies: undefined,
    url: { pathname: "/all", search: "" }, rootParams: {},
    implicitTags: { tags: [], expirationsByCacheKind: new Map() }, resumeDataCache: null, previewProps: undefined,
    isHmrRefresh: false, serverComponentsHmrCache: undefined, hmrRefreshHash: undefined, fallbackParams: null }).headers;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.headers.mockResolvedValue(new Headers(documentHeaders));
  mocks.client.mockResolvedValue(client);
  mocks.authorize.mockResolvedValue(authorized);
  mocks.start.mockResolvedValue(null);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No bootstrap component may create internal HTTP or forge work"));
});
afterEach(() => { vi.restoreAllMocks(); });

describe("initial-document-only server bootstrap", () => {
  it.each([["purpose", "prefetch"], ["sec-purpose", "prefetch;prerender"]])(
    "does not authenticate or read resources for a request carrying %s", async (name, value) => {
    mocks.headers.mockResolvedValue(new Headers({ ...documentHeaders, [name]: value }));
    expect(await RestoredPageWorkingSet()).toBeNull();
    expect(mocks.client).not.toHaveBeenCalled(); expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled(); expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each(missingDocumentMetadata)("does no client, authorization or resource work without positive main-document metadata: %j", async (values) => {
    mocks.headers.mockResolvedValue(new Headers(values));
    expect(await RestoredPageWorkingSet()).toBeNull();
    expect(mocks.client).not.toHaveBeenCalled(); expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled(); expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects an actual filtered Flight request even though userland cannot see its internal headers", async () => {
    const raw = new Headers({ rsc: "1", "next-router-prefetch": "1", "sec-fetch-dest": "empty", "sec-fetch-mode": "cors" });
    const userland = frameworkHeaders(raw);
    expect(raw.has("rsc")).toBe(true); expect(raw.has("next-router-prefetch")).toBe(true);
    expect(userland.has("rsc")).toBe(false); expect(userland.get("next-router-prefetch")).toBeNull();
    mocks.headers.mockResolvedValue(userland);
    expect(await RestoredPageWorkingSet()).toBeNull();
    expect(mocks.client).not.toHaveBeenCalled(); expect(mocks.authorize).not.toHaveBeenCalled(); expect(mocks.start).not.toHaveBeenCalled();
  });

  it("admits ordinary document metadata through the actual framework view and preserves the live guard", async () => {
    mocks.headers.mockResolvedValue(frameworkHeaders(new Headers(documentHeaders)));
    await RestoredPageWorkingSet();
    expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(client);
    expect(mocks.start).toHaveBeenCalledExactlyOnceWith(authorized);
  });

  it("requires successful live authorization before reading canonical tabs or resource data", async () => {
    mocks.authorize.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
    expect(await RestoredPageWorkingSet()).toBeNull();
    expect(mocks.client).toHaveBeenCalledTimes(1);
    expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(client);
    expect(mocks.start).not.toHaveBeenCalled(); expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("fails closed if the live guard throws and emits only a fixed failure code", async () => {
    mocks.authorize.mockRejectedValue(new Error("Private live authorization details"));
    expect(await RestoredPageWorkingSet()).toBeNull();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(vi.mocked(console.error).mock.calls).toEqual([["[restored-page-bootstrap] unavailable"]]);
  });

  it("returns separate Suspense boundaries before pending records settle and resolves each child independently", async () => {
    const slow = deferred<RestoredPageBootstrapRecord | null>(), fast = deferred<RestoredPageBootstrapRecord | null>();
    mocks.start.mockResolvedValue({ records: [slow.promise, fast.promise] });
    const boundaries = await RestoredPageWorkingSet();
    expect(boundaries).toHaveLength(2);
    expect(mocks.start).toHaveBeenCalledExactlyOnceWith(authorized);
    expect(boundaries!.map((boundary) => boundary.type)).toEqual([Suspense, Suspense]);
    expect(boundaries!.map((boundary) => boundary.props.fallback)).toEqual([null, null]);
    expect(new Set(boundaries!.map((boundary) => boundary.key)).size).toBe(2);
    let slowSettled = false;
    const slowElement = readBoundary(boundaries![0]);
    void slowElement.then(() => { slowSettled = true; });
    const fastElement = readBoundary(boundaries![1]);
    fast.resolve(record);
    const completed = await fastElement;
    expect(completed?.type).toBe(mocks.recordView);
    expect(completed?.props.record).toBe(record);
    expect(slowSettled).toBe(false);
    slow.resolve(null);
    expect(await slowElement).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("returns no records for an empty working set and isolates a failed startup without exposing its error", async () => {
    expect(await RestoredPageWorkingSet()).toBeNull();
    mocks.start.mockRejectedValueOnce(new Error("Private canonical row details"));
    expect(await RestoredPageWorkingSet()).toBeNull();
    expect(vi.mocked(console.error).mock.calls).toEqual([["[restored-page-bootstrap] unavailable"]]);
  });
});
