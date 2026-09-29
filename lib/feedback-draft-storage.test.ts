import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { FeedbackDraftStorage, LegacyFeedbackDraft } from "./feedback-draft-storage";
import type { FeedbackDraftSnapshot } from "./feedback-draft";

const fixture = () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
  return { values, storage };
};
const snapshot = (ciphertext = "authenticated-ciphertext"): FeedbackDraftSnapshot => ({ format: "minddy-feedback-draft-v1", nonce: "a4bc9d54-b13d-4277-98bf-2fbb6d8b7cd1", expiresAt: Date.now() + 10000, ciphertext });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("uses the browser fetch receiver when sealing and restoring a guest draft", async () => {
  const { storage } = fixture();
  const value = { title: "Guest draft", body: "Recoverable content" };
  const request = vi.fn<typeof fetch>(async function (this: unknown, _url, init) {
    if (this !== globalThis) throw new TypeError("Illegal invocation");
    return JSON.parse(init!.body as string).operation === "seal"
      ? Response.json({ snapshot: snapshot() }) : Response.json({ value });
  });
  vi.stubGlobal("fetch", request);
  const store = new FeedbackDraftStorage("board", storage);
  await store.save(value);
  expect(await store.load()).toEqual(value);
  expect(request).toHaveBeenCalledTimes(2);
});

it("does not persist private feedback text through the composer persistence entrypoint", async () => {
  const source = readFileSync("app/f/[token]/feedback-board-client.tsx", "utf8");
  expect(source).toContain("new FeedbackDraftStorage(token, localStorage)");
  expect(source).toContain("const value = latestDraft.current;");
  expect(source).toContain("store().save(value)");
  expect(source).not.toContain("localStorage.setItem");
  const { storage, values } = fixture();
  const request = vi.fn<typeof fetch>(async () => Response.json({ snapshot: snapshot() }));
  await new FeedbackDraftStorage("board", storage, request).save({ title: "PRIVATE_FEEDBACK_DRAFT_SENTINEL", body: "PRIVATE_FEEDBACK_BODY_SENTINEL" });
  expect([...values.values()].join()).not.toContain("PRIVATE_FEEDBACK");
  expect(request.mock.calls[0][1]).toMatchObject({ credentials: "same-origin", cache: "no-store", keepalive: true });
});

it("restores after a new controller is created, but requires explicit legacy recovery", async () => {
  const { storage, values } = fixture();
  const value = { title: "self-authored title", body: "self-authored body" };
  const request = vi.fn<typeof fetch>(async (_url, init) => JSON.parse(init!.body as string).operation === "seal"
    ? Response.json({ snapshot: snapshot() }) : Response.json({ value }));
  await new FeedbackDraftStorage("board", storage, request).save(value);
  expect(await new FeedbackDraftStorage("board", storage, request).load()).toEqual(value);
  values.set("mdy-feedback-draft:board", JSON.stringify(value));
  await expect(new FeedbackDraftStorage("board", storage, request).load()).rejects.toBeInstanceOf(LegacyFeedbackDraft);
});

it("does not resurrect cleared drafts or overwrite newer edits with late server responses", async () => {
  const { storage, values } = fixture();
  const pending: ((response: Response) => void)[] = [];
  const request = vi.fn<typeof fetch>(() => new Promise((resolve) => pending.push(resolve)));
  const store = new FeedbackDraftStorage("board", storage, request);
  const earlier = store.save({ title: "earlier", body: "" });
  const newer = store.save({ title: "newer", body: "" });
  pending[1](Response.json({ snapshot: snapshot("newer") })); await newer;
  pending[0](Response.json({ snapshot: snapshot("earlier") })); await earlier;
  expect([...values.values()].join()).toContain("newer");
  const late = store.save({ title: "late", body: "" });
  store.clear(); pending[2](Response.json({ snapshot: snapshot("late") })); await late;
  expect(values.size).toBe(0);
});

it("reports persistence failures and deletes expired envelopes without attempting to open them", async () => {
  const { storage, values } = fixture();
  const request = vi.fn<typeof fetch>(async () => new Response(null, { status: 503 }));
  const store = new FeedbackDraftStorage("board", storage, request);
  await expect(store.save({ title: "private", body: "" })).rejects.toThrow("unavailable");
  expect(values.size).toBe(0);
  values.set(store.key, JSON.stringify({ ...snapshot(), expiresAt: Date.now() - 1 }));
  expect(await new FeedbackDraftStorage("board", storage, request).load()).toBeNull();
  expect(values.size).toBe(0); expect(request).toHaveBeenCalledTimes(1);
});

it("does not redisplay old drafts from an open that completes after a newer save or clear", async () => {
  const { storage, values } = fixture();
  const pending: ((response: Response) => void)[] = [];
  const request = vi.fn<typeof fetch>(() => new Promise((resolve) => pending.push(resolve)));
  const store = new FeedbackDraftStorage("board", storage, request);
  values.set(store.key, JSON.stringify(snapshot("old")));
  const opening = store.load(); await vi.waitFor(() => expect(pending).toHaveLength(1));
  const saving = store.save({ title: "new", body: "" });
  pending[1](Response.json({ snapshot: snapshot("new") })); await saving;
  pending[0](Response.json({ value: { title: "old", body: "" } }));
  expect(await opening).toBeNull();
  const cleared = store.load(); await vi.waitFor(() => expect(pending).toHaveLength(3));
  store.clear(); pending[2](Response.json({ value: { title: "new", body: "" } }));
  expect(await cleared).toBeNull(); expect(values.size).toBe(0);
});
