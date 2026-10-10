import { afterEach, expect, it, vi } from "vitest";
import {
  cancelNativeLogin, fetchNativeConnections, NativePrototypeRequestError,
  readNativeLogin, startNativeLogin, submitNativeLoginCode,
} from "./native-agent-prototype-api";

afterEach(() => vi.unstubAllGlobals());

it("keeps approval responses out of caches and sends codes only in request bodies", async () => {
  const fetcher = vi.fn().mockImplementation(async () => new Response('{"status":"waiting"}'));
  vi.stubGlobal("fetch", fetcher);
  await fetchNativeConnections();
  await startNativeLogin("claude_code");
  await readNativeLogin("claude_code", "attempt/one");
  await submitNativeLoginCode("claude_code", "attempt/one", "approval-code");
  for (const [url, init] of fetcher.mock.calls) {
    expect(init.cache).toBe("no-store");
    expect(init.credentials).toBe("same-origin");
    expect(url).not.toContain("approval-code");
  }
  expect(fetcher.mock.calls[2][0].endsWith("/login/attempt%2Fone")).toBe(true);
  expect(fetcher.mock.calls[3][1].body).toBe('{"code":"approval-code"}');
});

it("discards raw server messages and accepts only recognized primitive error codes", async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response('{"error":"native-secret","errorCode":"secret-token"}', { status: 500 }))
    .mockResolvedValueOnce(new Response('{"error":"native-secret","errorCode":"connection_busy"}', { status: 409 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(startNativeLogin("codex")).rejects.toMatchObject({
    message: "Native agent request failed", code: null,
  });
  await expect(startNativeLogin("codex")).rejects.toEqual(
    new NativePrototypeRequestError("connection_busy"),
  );
});

it("can cancel a native login while the settings page is closing", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetcher);
  await cancelNativeLogin("codex", "one");
  expect(fetcher).toHaveBeenCalledWith("/api/account/agent-connections/codex/login/one",
    expect.objectContaining({ method: "DELETE", keepalive: true, cache: "no-store" }));
});
