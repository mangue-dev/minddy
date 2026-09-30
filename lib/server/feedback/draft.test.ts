import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EncryptedStore } from "../encryption/store";
const fixture = vi.hoisted(() => ({ enabled: true, boardId: "board-a", projectId: "project-a", lookupError: false, store: null as EncryptedStore | null }));
vi.mock("../encryption/registry", () => ({ getEncryptedStore: () => { if (!fixture.store) throw new Error("PRIVATE_ROOT_ERROR_SENTINEL"); return fixture.store; } }));
vi.mock("@/lib/server/feedback/boards", () => ({ getBoardByToken: async () => {
  if (fixture.lookupError) throw new Error("PRIVATE_BOARD_LOOKUP_SENTINEL");
  return { board: { id: fixture.boardId, project_id: fixture.projectId, enabled: fixture.enabled } };
} }));
vi.mock("@/lib/server/request-ip", () => ({ getClientIp: () => "synthetic-ip" }));
const { POST } = await import("@/app/f/[token]/draft/route");
const { sealFeedbackDraft, openFeedbackDraft } = await import("./draft");
let version: number; let keys: Map<number, Buffer>;
const value = { title: "PRIVATE_FEEDBACK_DRAFT_SENTINEL", body: "PRIVATE_FEEDBACK_BODY_SENTINEL" };
const board = { id: "board-a", project_id: "project-a" };
const request = (body: unknown, origin = "https://fixture.invalid") => new NextRequest("https://fixture.invalid/f/board/draft", {
  method: "POST", body: JSON.stringify(body), headers: { host: "fixture.invalid", origin, "Content-Type": "application/json" },
});
const context = { params: Promise.resolve({ token: "synthetic-token" }) };
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.spyOn(console, "info").mockImplementation(() => {});
  fixture.enabled = true; fixture.lookupError = false; fixture.boardId = board.id; fixture.projectId = board.project_id; version = 1;
  keys = new Map([[1, randomBytes(32)], [2, randomBytes(32)]]);
  fixture.store = new EncryptedStore({ current: async () => ({ version, bytes: Buffer.from(keys.get(version)!) }),
    byVersion: async (_scope, historical) => ({ version: historical, bytes: Buffer.from(keys.get(historical)!) }) });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });

it("seals guest drafts and restores historical envelopes using actual authenticated encryption", async () => {
  const response = await POST(request({ operation: "seal", value }), context);
  expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toContain("no-store");
  const { snapshot } = await response.json();
  expect(JSON.stringify(snapshot)).not.toContain("PRIVATE_FEEDBACK");
  expect(JSON.stringify(snapshot)).not.toContain(keys.get(1)!.toString("base64"));
  version = 2;
  // A fresh store has no warmed historical key state.
  fixture.store = new EncryptedStore({ current: async () => ({ version, bytes: Buffer.from(keys.get(version)!) }),
    byVersion: async (_scope, historical) => ({ version: historical, bytes: Buffer.from(keys.get(historical)!) }) });
  const opened = await POST(request({ operation: "open", snapshot }), context);
  expect(await opened.json()).toEqual({ value });
});
it("rejects disabled boards, cross-origin requests, oversized bodies and arbitrary content", async () => {
  fixture.enabled = false; expect((await POST(request({ operation: "seal", value }), context)).status).toBe(404);
  fixture.enabled = true; expect((await POST(request({ operation: "seal", value }, "https://foreign.invalid"), context)).status).toBe(403);
  expect((await POST(request({ operation: "seal", value: { ...value, body: "x".repeat(70 * 1024) } }), context)).status).toBe(413);
  expect((await POST(request({ operation: "seal", value: { arbitrary: "private" } }), context)).status).toBe(400);
});
it("authenticates board, nonce, purpose, historical key, root and expiry rather than trusting metadata", async () => {
  const snapshot = await sealFeedbackDraft(board, value);
  await expect(openFeedbackDraft({ ...board, id: "other-board" }, snapshot)).rejects.toThrow();
  await expect(openFeedbackDraft({ ...board, project_id: "other-project" }, snapshot)).rejects.toThrow();
  await expect(openFeedbackDraft(board, { ...snapshot, nonce: "c4bc9d54-b13d-4277-98bf-2fbb6d8b7cd1" })).rejects.toThrow();
  await expect(openFeedbackDraft(board, { ...snapshot, expiresAt: snapshot.expiresAt + 1 })).rejects.toThrow();
  const envelope = JSON.parse(snapshot.ciphertext); envelope.tag = randomBytes(16).toString("base64url");
  await expect(openFeedbackDraft(board, { ...snapshot, ciphertext: JSON.stringify(envelope) })).rejects.toThrow();
  const original = keys.get(1)!; keys.set(1, randomBytes(32));
  await expect(openFeedbackDraft(board, snapshot)).rejects.toThrow(); keys.set(1, original);
  const foreign = await fixture.store!.encrypt({ expiresAt: snapshot.expiresAt, value }, {
    scope: { kind: "project", id: board.project_id }, table: "feedback_posts", column: "body", rowId: `${board.id}:${snapshot.nonce}`,
  });
  await expect(openFeedbackDraft(board, { ...snapshot, ciphertext: foreign })).rejects.toThrow();
  vi.useFakeTimers(); vi.setSystemTime(snapshot.expiresAt + 1);
  await expect(openFeedbackDraft(board, snapshot)).rejects.toThrow();
});
it("returns controlled errors when the root is unavailable without exposing content or provider exceptions", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  fixture.store = null;
  const response = await POST(request({ operation: "seal", value }), context);
  expect(response.status).toBe(503); expect(await response.text()).not.toContain("PRIVATE");
  expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE");
  fixture.lookupError = true;
  const lookup = await POST(request({ operation: "seal", value }), context);
  expect(lookup.status).toBe(503); expect(await lookup.text()).not.toContain("PRIVATE");
});
it("does not release a draft when the board is disabled while crypto is in flight", async () => {
  fixture.store = new EncryptedStore({ current: async () => {
    fixture.enabled = false;
    return { version, bytes: Buffer.from(keys.get(version)!) };
  }, byVersion: async (_scope, historical) => ({ version: historical, bytes: Buffer.from(keys.get(historical)!) }) });
  const response = await POST(request({ operation: "seal", value }), context);
  expect(response.status).toBe(404); expect(await response.text()).not.toContain("ciphertext");
});
