import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

beforeEach(() => {
  vi.stubEnv("MINDDY_PUBLIC_APP_URL", "https://tickets.example.test");
  vi.stubEnv("MINDDY_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("MINDDY_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network request"); }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function request(host: string, path: string) {
  return new NextRequest(`https://${host}${path}`, { headers: { host } });
}

describe("application host routing", () => {
  it.each(["/", "/f/board-token", "/share/view-token", "/p/page-token"])(
    "rejects an unconfigured host at %s without a database lookup or rewrite",
    async (path) => {
      const response = await proxy(request("feedback.example.test", path));
      expect(response.status).toBe(404);
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each(["tickets.example.test", "www.minddy.app", "feedback.minddy.app"])(
    "serves public token paths on application host %s without a rewrite",
    async (host) => {
      for (const path of ["/f/board-token", "/share/view-token", "/p/page-token"]) {
        const response = await proxy(request(host, path));
        expect(response.status).toBe(200);
        expect(response.headers.get("x-middleware-rewrite")).toBeNull();
        expect(response.headers.get("x-robots-tag")).toBe("noindex");
      }
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});
