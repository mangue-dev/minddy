import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EncryptedStore } from "./encryption/store";

const fixture = vi.hoisted(() => ({ owner: "synthetic-owner", access: "synthetic-access", authorized: true, store: null as EncryptedStore | null }));
vi.mock("./local-snapshot-access", () => ({ localSnapshotProjectAccess: async () => ({ fingerprint: fixture.access }), assertDraftProjectsAccess: async () => {} }));
vi.mock("./encryption/registry", () => ({ getEncryptedStore: () => {
  if (!fixture.store) throw new Error("synthetic missing root");
  return fixture.store;
} }));
vi.mock("@/lib/server/api-auth", () => ({ getAuthedUser: async () => fixture.authorized
  ? { ok: true, user: { id: fixture.owner } }
  : { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) } }));
const { POST } = await import("@/app/api/me/local-snapshots/route");
const { sealLocalSnapshot, openLocalSnapshot } = await import("./local-snapshots");
let version: number;
let materials: Map<number, Buffer>;

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  fixture.owner = "synthetic-owner"; fixture.access = "synthetic-access"; fixture.authorized = true; version = 1;
  materials = new Map([[1, randomBytes(32)], [2, randomBytes(32)]]);
  fixture.store = new EncryptedStore({
    current: async () => ({ version, bytes: Buffer.from(materials.get(version)!) }),
    byVersion: async (_scope, historical) => ({ version: historical, bytes: Buffer.from(materials.get(historical)!) }),
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const request = (body: unknown) => new NextRequest("https://fixture.invalid/api/me/local-snapshots", {
  method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
});

it("rejects saving and restoring the removed error-history slot", async () => {
  for (const operation of ["seal", "open"]) {
    const response = await POST(request({ operation, slot: "status-history", value: ["Failure"] }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_snapshot_request" });
  }
});

it("authenticates before processing client content and never leaks failures", async () => {
  fixture.authorized = false;
  expect((await POST(request({ operation: "seal", slot: "issue-drafts", value: "PRIVATE_SENTINEL" }))).status).toBe(401);
  fixture.authorized = true; fixture.store = null;
  const response = await POST(request({ operation: "seal", slot: "issue-drafts", value: "PRIVATE_SENTINEL" }));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("PRIVATE_SENTINEL");
});
it("bounds declared and streamed snapshot requests before parsing their content", async () => {
  const oversized = new NextRequest("https://fixture.invalid/api/me/local-snapshots", {
    method: "POST", body: "synthetic", headers: { "Content-Length": String(9 * 1024 * 1024) },
  });
  expect((await POST(oversized)).status).toBe(413);
  const chunked = new NextRequest("https://fixture.invalid/api/me/local-snapshots", {
    method: "POST", body: "x".repeat(8 * 1024 * 1024 + 1),
  });
  expect((await POST(chunked)).status).toBe(413);
});

it("keeps keys on the server and restores historical snapshots after rotation", async () => {
  const value = [{ title: "PRIVATE_SNAPSHOT_SENTINEL" }];
  const response = await POST(request({ operation: "seal", slot: "issue-drafts", value }));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  const { snapshot } = await response.json();
  expect(JSON.stringify(snapshot)).not.toContain("PRIVATE_SNAPSHOT_SENTINEL");
  expect(JSON.stringify(snapshot)).not.toContain(materials.get(1)!.toString("base64"));
  version = 2;
  const opened = await POST(request({ operation: "open", slot: "issue-drafts", snapshot }));
  expect(await opened.json()).toEqual({ value });
});

it("rejects wrong owners, purposes, roots, corruption and expiry", async () => {
  const sealed = await sealLocalSnapshot(fixture.owner, "issue-drafts", ["private"]);
  await expect(openLocalSnapshot("another-owner", "issue-drafts", sealed)).rejects.toThrow();
  await expect(openLocalSnapshot(fixture.owner, "query-cache", sealed)).rejects.toThrow();
  const envelope = JSON.parse(sealed.ciphertext);
  envelope.tag = randomBytes(16).toString("base64url");
  await expect(openLocalSnapshot(fixture.owner, "issue-drafts", { ...sealed, ciphertext: JSON.stringify(envelope) })).rejects.toThrow();
  const original = materials.get(1)!; materials.set(1, randomBytes(32));
  await expect(openLocalSnapshot(fixture.owner, "issue-drafts", sealed)).rejects.toThrow();
  materials.set(1, original);
  vi.useFakeTimers(); vi.setSystemTime(sealed.expiresAt + 1);
  await expect(openLocalSnapshot(fixture.owner, "issue-drafts", sealed)).rejects.toThrow("Expired");
});
it("refuses a cached private payload after membership or ownership changes", async () => {
  const sealed = await sealLocalSnapshot(fixture.owner, "query-cache", { private: "PRIVATE_SENTINEL" });
  fixture.access = "revoked-project-access";
  await expect(openLocalSnapshot(fixture.owner, "query-cache", sealed)).rejects.toThrow("access changed");
});
it("retains an account-owned self-authored draft after a project membership changes", async () => {
  const sealed = await sealLocalSnapshot(fixture.owner, "issue-drafts", [{ title: "self-authored draft" }]);
  fixture.access = "revoked-project-access";
  expect(await openLocalSnapshot(fixture.owner, "issue-drafts", sealed)).toEqual([{ title: "self-authored draft" }]);
});
