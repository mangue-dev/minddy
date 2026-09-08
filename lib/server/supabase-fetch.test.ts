import { afterEach, describe, expect, it, vi } from "vitest";
import { supabaseServerFetch, supabaseServerFetchWithTimeout } from "./supabase-fetch";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("server Supabase transport", () => {
  it("routes a streaming request internally without changing credentials, path, or signed response URLs", async () => {
    vi.stubEnv("MINDDY_PUBLIC_SUPABASE_URL", "http://localhost:8000");
    vi.stubEnv("SUPABASE_INTERNAL_URL", "http://kong:8000");
    const response = new Response('{"signedURL":"http://localhost:8000/storage/v1/object/sign/example"}');
    const forwarded: Request[] = [];
    const transport = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      forwarded.push(request);
      expect(request.url).toBe("http://kong:8000/storage/v1/object/test?upsert=true");
      expect(request.method).toBe("POST");
      expect(request.headers.get("authorization")).toBe("Bearer fixture");
      expect(await request.text()).toBe("attachment bytes");
      return response;
    });
    vi.stubGlobal("fetch", transport);
    const controller = new AbortController();
    const input = new Request("http://localhost:8000/storage/v1/object/test?upsert=true", {
      method: "POST", headers: { authorization: "Bearer fixture" }, body: "attachment bytes", signal: controller.signal,
    });
    expect(await supabaseServerFetch(input)).toBe(response);
    controller.abort();
    expect(forwarded[0].signal.aborted).toBe(true);
  });

  it("leaves managed deployments and unrelated request origins unchanged", async () => {
    const transport = vi.fn<typeof fetch>(async () => new Response("ok"));
    vi.stubGlobal("fetch", transport);
    vi.stubEnv("MINDDY_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_INTERNAL_URL", "");
    await supabaseServerFetch("https://project.supabase.co/auth/v1/user");
    expect(transport.mock.calls[0][0]).toBe("https://project.supabase.co/auth/v1/user");
    vi.stubEnv("SUPABASE_INTERNAL_URL", "http://kong:8000");
    await supabaseServerFetch("https://other.example.test/resource");
    expect(transport.mock.calls[1][0]).toBe("https://other.example.test/resource");
  });

  it("rejects internal endpoints containing credentials or paths before sending a request", async () => {
    const transport = vi.fn();
    vi.stubGlobal("fetch", transport);
    vi.stubEnv("MINDDY_PUBLIC_SUPABASE_URL", "http://localhost:8000");
    for (const endpoint of ["http://user:password@kong:8000", "http://kong:8000/path", "file:///tmp"]) {
      vi.stubEnv("SUPABASE_INTERNAL_URL", endpoint);
      expect(() => supabaseServerFetch("http://localhost:8000/auth/v1/user")).toThrow("HTTP(S) origin");
    }
    expect(transport).not.toHaveBeenCalled();
  });
});


it("preserves the existing auth timeout wrapper and caller cancellation", async () => {
  const transport = vi.fn<typeof fetch>(async () => new Response("ok"));
  vi.stubGlobal("fetch", transport);
  vi.stubEnv("MINDDY_PUBLIC_SUPABASE_URL", "http://localhost:8000");
  vi.stubEnv("SUPABASE_INTERNAL_URL", "http://kong:8000");
  const controller = new AbortController();
  await supabaseServerFetchWithTimeout("http://localhost:8000/auth/v1/user", { signal: controller.signal });
  expect(String(transport.mock.calls[0][0])).toBe("http://kong:8000/auth/v1/user");
  const signal = transport.mock.calls[0][1]?.signal;
  expect(signal).not.toBe(controller.signal);
  controller.abort();
  expect(signal?.aborted).toBe(true);
});
