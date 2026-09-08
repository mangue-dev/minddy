import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { oauthCallbackUrl } from "@/lib/oauth-callback-url";
import { parseDesktopAuthLink } from "@/lib/desktop/auth-link";

const { cookies, createServerClient } = vi.hoisted(() => ({
  cookies: vi.fn(() => { throw new Error("The browser cookie store must not be read"); }),
  createServerClient: vi.fn(() => { throw new Error("The browser must not exchange the code"); }),
}));
vi.mock("next/headers", () => ({ cookies }));
vi.mock("@supabase/ssr", () => ({ createServerClient }));
vi.mock("@/lib/server/auth-arrival", () => ({
  buildAuthFailureRedirect: vi.fn(),
  completeAuthArrival: vi.fn(),
}));

import { GET } from "@/app/auth/callback/route";

beforeEach(() => vi.clearAllMocks());

describe("desktop preview OAuth callback", () => {
  it("relays through production with the desktop nonce and destination intact", async () => {
    const callback = oauthCallbackUrl(
      "https://preview.minddy.app",
      "/settings?tab=account",
      "desktop-turn",
    );
    expect(callback.origin).toBe("https://www.minddy.app");
    expect(callback.pathname).toBe("/auth/callback");
    expect(callback.searchParams.get("desktop")).toBe("1");
    expect(callback.searchParams.get("turn")).toBe("desktop-turn");

    // Simulate the provider returning while the system browser has a session.
    callback.searchParams.set("code", "provider-code");
    const response = await GET(new NextRequest(callback, {
      headers: { cookie: "sb-session=existing-browser-session" },
    }));
    expect(parseDesktopAuthLink(response.headers.get("location")!)).toEqual({
      kind: "code",
      code: "provider-code",
      turn: "desktop-turn",
      next: "/settings?tab=account",
    });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(cookies).not.toHaveBeenCalled();
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it.each([
    "https://www.minddy.app",
    "http://localhost:3000",
    "http://127.0.0.1:49152",
    "https://tickets.example.com",
    "https://preview.minddy.app.example.com",
  ])("keeps the desktop callback on its own server at %s", (origin) => {
    const callback = oauthCallbackUrl(origin, undefined, "desktop-turn");
    expect(callback.origin).toBe(origin);
    expect(callback.searchParams.get("desktop")).toBe("1");
    expect(callback.searchParams.get("next")).toBeNull();
  });

  it("keeps browser OAuth on preview where its PKCE verifier lives", () => {
    const callback = oauthCallbackUrl("https://preview.minddy.app", "/settings");
    expect(callback.origin).toBe("https://preview.minddy.app");
    expect(callback.searchParams.get("next")).toBe("/settings");
    expect(callback.searchParams.has("desktop")).toBe(false);
    expect(callback.searchParams.has("turn")).toBe(false);
  });

  it("discards external destinations before returning to the desktop", () => {
    const callback = oauthCallbackUrl(
      "https://preview.minddy.app", "https://other.example", "desktop-turn",
    );
    expect(callback.searchParams.has("next")).toBe(false);
  });

  it("returns provider errors to the desktop without using the browser session", async () => {
    const callback = oauthCallbackUrl("https://preview.minddy.app", undefined, "desktop-turn");
    callback.searchParams.set("error", "access_denied");
    const response = await GET(new NextRequest(callback));
    expect(parseDesktopAuthLink(response.headers.get("location")!)).toEqual({
      kind: "error", error: "oauth_denied", reason: "access_denied",
    });
    expect(cookies).not.toHaveBeenCalled();
    expect(createServerClient).not.toHaveBeenCalled();
  });
});
