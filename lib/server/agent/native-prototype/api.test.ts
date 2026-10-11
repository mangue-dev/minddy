import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { nativeAccountRoute, nativeLoginCode } from "./api";
import { NativePrototypeError } from "./connections";

const auth = vi.hoisted(() => ({ getAuthedUser: vi.fn() }));
vi.mock("@/lib/server/api-auth", () => auth);
vi.mock("./connections", () => ({
  NativePrototypeError: class extends Error {
    constructor(readonly code: string) { super(code); }
  },
}));

const context = (engine = "codex", attemptId?: string) => ({
  params: Promise.resolve({ engine, attemptId }),
});
const request = () => new NextRequest("https://minddy.example/api/account/agent-connections/codex/login", { method: "POST" });
function expectPrivate(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("cdn-cache-control")).toBe("no-store");
  expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
  expect(response.headers.get("pragma")).toBe("no-cache");
}
beforeEach(() => {
  vi.clearAllMocks();
  auth.getAuthedUser.mockResolvedValue({ ok: true, user: { id: "owner" } });
  vi.stubEnv("MINDDY_NATIVE_AGENT_PROTOTYPE", undefined);
  vi.stubEnv("MINDDY_NATIVE_AGENT_PROTOTYPE_USER_IDS", undefined);
});
afterEach(() => vi.unstubAllEnvs());

it("does no native work by default or for an unlisted account", async () => {
  const work = vi.fn();
  const route = nativeAccountRoute(work);
  for (const flag of [undefined, "true"]) {
    vi.stubEnv("MINDDY_NATIVE_AGENT_PROTOTYPE", flag);
    vi.stubEnv("MINDDY_NATIVE_AGENT_PROTOTYPE_USER_IDS", "another-owner");
    const response = await route(request(), context());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ errorCode: "private_prototype_unavailable" });
    expectPrivate(response);
  }
  expect(work).not.toHaveBeenCalled();
});

it.each([401, 403, 503])("keeps inherited authentication denials private (%i)", async (status) => {
  const response = NextResponse.json({ error: "Authentication unavailable" }, { status });
  auth.getAuthedUser.mockResolvedValue({ ok: false, response });
  const work = vi.fn();
  const incoming = new NextRequest("https://minddy.example/api/account/agent-connections/codex/login", {
    method: "POST", headers: { origin: "https://foreign.example" },
  });
  const result = await nativeAccountRoute(work)(incoming, context());
  expect(auth.getAuthedUser).toHaveBeenCalledWith(incoming);
  expect(result.status).toBe(status);
  expect(await result.json()).toEqual({ error: "Authentication unavailable" });
  expectPrivate(result);
  expect(work).not.toHaveBeenCalled();
});

it("takes the owner from authentication and rejects unsupported engines", async () => {
  vi.stubEnv("MINDDY_NATIVE_AGENT_PROTOTYPE", "true");
  vi.stubEnv("MINDDY_NATIVE_AGENT_PROTOTYPE_USER_IDS", " owner ");
  const work = vi.fn().mockResolvedValue({ status: "connected" });
  const incoming = new NextRequest("https://minddy.example/api/account/agent-connections/codex/login?userId=another-owner", {
    method: "POST", headers: { "x-user-id": "another-owner" },
  });
  const route = nativeAccountRoute(work);
  const result = await route(incoming, context("claude_code", "attempt-one"));
  expect(work).toHaveBeenCalledWith(incoming, "owner", "claude_code", "attempt-one");
  expectPrivate(result);
  expect(await result.json()).toEqual({ status: "connected" });
  const unsupported = await route(incoming, context("opencode"));
  expect(unsupported.status).toBe(400);
  expect(await unsupported.json()).toEqual({ errorCode: "private_prototype_unavailable" });
  expectPrivate(unsupported);
  expect(work).toHaveBeenCalledTimes(1);
});

it("returns sanitized native and unknown errors without stack traces or transcripts", async () => {
  vi.stubEnv("MINDDY_NATIVE_AGENT_PROTOTYPE", "true");
  vi.stubEnv("MINDDY_NATIVE_AGENT_PROTOTYPE_USER_IDS", "owner");
  const work = vi.fn()
    .mockRejectedValueOnce(new NativePrototypeError("connection_busy"))
    .mockRejectedValueOnce(new Error("native-access-token-secret"))
    .mockResolvedValueOnce(undefined);
  const route = nativeAccountRoute(work);
  const busy = await route(request(), context());
  expect(busy.status).toBe(409);
  expect(await busy.json()).toEqual({ errorCode: "connection_busy" });
  expectPrivate(busy);
  const failure = await route(request(), context());
  expect(failure.status).toBe(400);
  expect(await failure.json()).toEqual({ errorCode: "test_failed" });
  expectPrivate(failure);
  const empty = await route(request(), context());
  expect(empty.status).toBe(204);
  expect(await empty.text()).toBe("");
  expectPrivate(empty);
});

function codeRequest(body: string) {
  return new NextRequest("https://minddy.example/api/account/agent-connections/claude_code/login/one", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body,
  });
}
it("accepts an approval code only, rejecting owner injection and arbitrary inputs", async () => {
  expect(await nativeLoginCode(codeRequest('{"code":"native-approval-code"}'))).toBe("native-approval-code");
  for (const body of [
    '{"code":"approval","userId":"another-owner"}',
    '{"code":"approval","command":"cat credentials"}',
    '{"credentials":"secret"}', '{"code":123}', '["approval"]', 'null',
  ]) {
    await expect(nativeLoginCode(codeRequest(body))).rejects.toMatchObject({ code: "login_failed" });
  }
});

it("bounds actual streamed bytes even when Content-Length is absent", async () => {
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(2048));
      controller.enqueue(new Uint8Array(2049));
    }, cancel,
  });
  const incoming = { body } as unknown as NextRequest;
  await expect(nativeLoginCode(incoming)).rejects.toMatchObject({ code: "login_failed" });
  expect(cancel).toHaveBeenCalledOnce();
});

it("rejects missing or malformed code bodies without exposing their contents at the route boundary", async () => {
  vi.stubEnv("MINDDY_NATIVE_AGENT_PROTOTYPE", "true");
  vi.stubEnv("MINDDY_NATIVE_AGENT_PROTOTYPE_USER_IDS", "owner");
  await expect(nativeLoginCode(request())).rejects.toMatchObject({ code: "login_failed" });
  const result = await nativeAccountRoute(async (incoming) => nativeLoginCode(incoming))(
    codeRequest("native-token-secret malformed JSON"), context("claude_code"),
  );
  expect(await result.json()).toEqual({ errorCode: "test_failed" });
  expectPrivate(result);
});
