import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { CookieOptions } from "@supabase/ssr";

/**
 * MIN-351 — WHAT THE PROXY SAYS IN RENDERING, AND WHAT IT REPORTS TO THE BROWSER.
 *
 * Two faults which only have their address in common, `proxy.ts` :
 *
 * - **Trust headers were not sanitized.** `x-minddy-public`,
 * `x-minddy-locale`, `x-minddy-route` are proxy assertions that the
 * root layout and next-intl take at their word. Nothing prevented the client from
 * sending them himself: a `curl -H 'x-minddy-public: 1'` and the rendering of a
 * app page switched to the setting of the public site.
 * - **MIN-293 was still alive here.** `readSession` reads the session with a
 * adapter to empty `setAll`: expired token, GoTrue returns a new pair and
 * spins up the refresh token — the proxy SPENT it then threw it away. The navigator kept the old one, dead. This is the silent disconnection
 *, corrected on the route side and not on the proxy side.
 *
 * What we are mocking: `@supabase/ssr`, the only network boundary. Everything else —
 * the real proxy, its branches, its headers — executes.
 *
 * How we observe what hits the renderer: `NextResponse.next({ request })`
 * publishes the rewritten request headers as `x-middleware-request-*`, and their
 * list under `x-middleware-override-headers`. This is literally what Next
 * will return to the layout.
 */

type SetAll = (c: { name: string; value: string; options: CookieOptions }[]) => void;

/** What the lib would “render” to write on the next call to getSession. */
let refreshed: { name: string; value: string; options: CookieOptions }[] = [];
let session:
  | {
      user: { id: string; user_metadata?: Record<string, unknown> };
      access_token?: string;
    }
  | null = null;
let sessionError: { name: string; status: number } | null = null;

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: { setAll: SetAll } }) => ({
    auth: {
      getSession: async () => {
        options.cookies.setAll(refreshed);
        return { data: { session }, error: sessionError };
      },
    },
  }),
}));

const { proxy } = await import("@/proxy");

const HOST = "www.minddy.app";

function request(pathname: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`https://${HOST}${pathname}`, {
    headers: { host: HOST, ...headers },
  });
}

function accessToken(userMetadata: Record<string, unknown> = {}): string {
  const payload = Buffer.from(
    JSON.stringify({ user_metadata: userMetadata }),
  ).toString("base64url");
  return `header.${payload}.signature`;
}

/** The request headers that the proxy lets pass until rendering. */
function forwardedHeaders(response: { headers: Headers }): Record<string, string> {
  const names = response.headers.get("x-middleware-override-headers");
  if (!names) return {};
  return Object.fromEntries(
    names
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => [n, response.headers.get(`x-middleware-request-${n}`) ?? ""]),
  );
}

beforeEach(() => {
  vi.stubEnv("MINDDY_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("MINDDY_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  refreshed = [];
  session = null;
  sessionError = null;
});

describe("backend outage fallback", () => {
  it.each(["/", "/login", "/home"])(
    "redirects %s to the retryable recovery page on a Supabase 522",
    async (pathname) => {
      sessionError = { name: "AuthRetryableFetchError", status: 522 };

      const response = await proxy(request(pathname));
      const location = new URL(response.headers.get("location")!);

      expect(response.status).toBe(307);
      expect(location.pathname).toBe("/server-unavailable");
      expect(location.searchParams.get("retry")).toBe(pathname);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    },
  );

  it("serves the recovery page without querying Supabase again", async () => {
    sessionError = { name: "AuthRetryableFetchError", status: 522 };

    const response = await proxy(
      request("/server-unavailable?retry=%2Fhome&locale=fr"),
    );

    expect(response.status).toBe(200);
    expect(forwardedHeaders(response)["x-minddy-locale"]).toBe("fr");
    expect(forwardedHeaders(response)["x-minddy-public"]).toBe("1");
  });

  it("keeps normal authentication failures on the sign-in path", async () => {
    sessionError = { name: "AuthApiError", status: 401 };

    const response = await proxy(request("/home"));
    const location = new URL(response.headers.get("location")!);

    expect(location.pathname).toBe("/login");
  });
});

describe("trusted headers sent by the client", () => {
  it.each([
    ["/login", "une route publique"],
    ["/home", "une route de l'app"],
    ["/f/tok", "un board public"],
  ])("n'atteint pas le rendu sur %s (%s)", async (pathname) => {
    // /home is protected: a session, otherwise we redirect to /login.
    session = { user: { id: "u1" } };

    const response = await proxy(
      request(pathname, {
        "x-minddy-public": "1",
        "x-minddy-locale": "fr",
        "x-minddy-route": "pricing",
        "x-minddy-theme": "dark",
      }),
    );

    const forwarded = forwardedHeaders(response);
    expect(forwarded["x-minddy-locale"]).toBeUndefined();
    expect(forwarded["x-minddy-route"]).toBeUndefined();
    expect(forwarded["x-minddy-theme"]).toBeUndefined();
    // `/f/` is a public site: the proxy sets the flag ITSELF. What
    // counts is that it comes from him — hence the systematic cleaning, including
    // where the final value is the same.
    if (!pathname.startsWith("/f/")) {
      expect(forwarded["x-minddy-public"]).toBeUndefined();
    }
  });

  it("lets the proxy set its own on a localized public page", async () => {
    const response = await proxy(request("/fr/tarifs", { "x-minddy-public": "0" }));
    const forwarded = forwardedHeaders(response);

    expect(forwarded["x-minddy-public"]).toBe("1");
    expect(forwarded["x-minddy-locale"]).toBe("fr");
    expect(forwarded["x-minddy-route"]).toBe("pricing");
  });
});

describe("cookies refreshed while reading the session (MIN-293)", () => {
  const OPTIONS = { path: "/", sameSite: "lax" as const };

  beforeEach(() => {
    refreshed = [
      { name: "sb-access-token", value: "neuf", options: OPTIONS },
      { name: "sb-refresh-token", value: "aussi-neuf", options: OPTIONS },
    ];
  });

  it("returns the /login response for a signed-out visitor", async () => {
    const response = await proxy(request("/login"));

    expect(response.cookies.get("sb-access-token")?.value).toBe("neuf");
    expect(response.cookies.get("sb-refresh-token")?.value).toBe("aussi-neuf");
  });

  it("returns the REDIRECT to /home for an already signed-in visitor", async () => {
    session = { user: { id: "u1" } };

    const response = await proxy(request("/login"));

    expect(response.status).toBe(307);
    expect(response.cookies.get("sb-access-token")?.value).toBe("neuf");
  });

  it("returns the landing page served to a signed-out visitor", async () => {
    const response = await proxy(request("/"));

    expect(response.cookies.get("sb-access-token")?.value).toBe("neuf");
  });

  it("porte `Secure` en production, pas en développement", async () => {
    const response = await proxy(request("/login"));
    // The test runs in NODE_ENV=test: the flag follows `production`, like the
    // three more cookies handwritten by the repository.
    expect(response.cookies.get("sb-access-token")?.secure).toBe(
      process.env.NODE_ENV === "production",
    );
  });
});

describe("account theme header (x-minddy-theme)", () => {
  it.each(["light", "dark", "system"] as const)(
    "asserts the saved theme on app routes: %s",
    async (theme) => {
      session = {
        user: { id: "u1", user_metadata: { theme } },
        access_token: accessToken({ theme }),
      };

      const response = await proxy(request("/home"));

      expect(forwardedHeaders(response)["x-minddy-theme"]).toBe(theme);
    },
  );

  it("asserts nothing when the account never chose a theme", async () => {
    session = { user: { id: "u1" } };

    const response = await proxy(request("/home"));

    expect(forwardedHeaders(response)["x-minddy-theme"]).toBeUndefined();
  });

  it("treats an invalid metadata value as no theme at all", async () => {
    session = {
      user: { id: "u1", user_metadata: { theme: "neon" } },
    };

    const response = await proxy(request("/home"));

    expect(forwardedHeaders(response)["x-minddy-theme"]).toBeUndefined();
  });

  it("never asserts it on public pages", async () => {
    session = { user: { id: "u1", user_metadata: { theme: "dark" } } };

    const response = await proxy(request("/fr/tarifs"));

    expect(forwardedHeaders(response)["x-minddy-theme"]).toBeUndefined();
    expect(forwardedHeaders(response)["x-minddy-public"]).toBe("1");
  });

  it("keeps the refreshed session cookies across the response rebuild (MIN-293)", async () => {
    // Asserting the theme rebuilds the NextResponse; a naive rebuild drops
    // the cookies the session read has just rotated, and the next refresh
    // dies in refresh_token_not_found.
    const OPTIONS = { path: "/", sameSite: "lax" as const };
    refreshed = [
      { name: "sb-access-token", value: "neuf", options: OPTIONS },
      { name: "sb-refresh-token", value: "aussi-neuf", options: OPTIONS },
    ];
    session = {
      user: { id: "u1", user_metadata: { theme: "light" } },
      access_token: accessToken({ theme: "light" }),
    };

    const response = await proxy(request("/home"));

    expect(forwardedHeaders(response)["x-minddy-theme"]).toBe("light");
    expect(response.cookies.get("sb-access-token")?.value).toBe("neuf");
    expect(response.cookies.get("sb-refresh-token")?.value).toBe("aussi-neuf");
    // The other proxy assertions survive the rebuild too.
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("never reads the unverified user object returned by getSession", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    session = {
      user: new Proxy(
        { id: "u1", user_metadata: { theme: "dark" } },
        {
          get(target, property) {
            console.warn("unverified session.user was read");
            return target[property as keyof typeof target];
          },
        },
      ),
      access_token: accessToken({ theme: "dark" }),
    };

    const response = await proxy(request("/home"));

    expect(forwardedHeaders(response)["x-minddy-theme"]).toBe("dark");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
