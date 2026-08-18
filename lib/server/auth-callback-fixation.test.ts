import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_PENDING_COOKIE, decodePendingOtp } from "@/lib/auth-otp-pending";

/**
 * MIN-345 — session fixation by the web callback.
 *
 * The attack is in one sentence: the attacker requests a link for HIS account
 * and sends it to his victim. If `GET /auth/callback?token_hash=…` opens a
 * session, the victim now works in the attacker's account, who
 * reads everything she writes there.
 *
 * What this file holds, and no reread holds: **no `GET` ne
 * consumes the token**, and the `POST` that consumes it only leaves from here.
 */

const verifyOtp = vi.fn(async () => ({
  data: { user: { id: "user-1", created_at: "", user_metadata: {} } },
  error: null as { message: string } | null,
}));
const exchangeCodeForSession = vi.fn(async () => ({
  data: { user: { id: "user-1", created_at: "", user_metadata: {} } },
  error: null as { message: string } | null,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { verifyOtp, exchangeCodeForSession } }),
}));

/** The server's cookie store, the one that `next/headers` renders. */
const store = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      store.has(name) ? { name, value: store.get(name)! } : undefined,
    getAll: () => [...store].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      store.set(name, value);
    },
  }),
}));

const arrivals: string[] = [];
vi.mock("@/lib/server/auth-arrival", async () => {
  const { NextResponse } = await import("next/server");
  return {
    completeAuthArrival: async (_user: unknown, channel: string) => {
      arrivals.push(channel);
    },
    buildAuthFailureRedirect: (origin: string, reason: string) =>
      NextResponse.redirect(`${origin}/login?reason=${reason}`),
  };
});

const { GET } = await import("@/app/auth/callback/route");
const { POST } = await import("@/app/auth/confirm/complete/route");

const ORIGIN = "https://www.minddy.app";

function get(query: string): Promise<Response> {
  return GET(
    new NextRequest(`${ORIGIN}/auth/callback${query}`, {
      headers: { host: "www.minddy.app" },
    })
  ) as unknown as Promise<Response>;
}

function post(headers: Record<string, string>): Promise<Response> {
  return POST(
    new NextRequest(`${ORIGIN}/auth/confirm/complete`, {
      method: "POST",
      headers: { host: "www.minddy.app", ...headers },
    })
  ) as unknown as Promise<Response>;
}

/** The wait cookie as the response asks, decoded. */
function pendingFrom(response: Response) {
  const raw = response.headers.get("set-cookie") ?? "";
  const value = /mdy_auth_pending=([^;]*)/.exec(raw)?.[1];
  return decodePendingOtp(value ? decodeURIComponent(value) : null);
}

beforeEach(() => {
  store.clear();
  arrivals.length = 0;
  verifyOtp.mockClear();
  exchangeCodeForSession.mockClear();
});

describe("GET /auth/callback", () => {
  it("ne consomme PAS le jeton d'un lien e-mail — il le met en attente", async () => {
    const response = await get("?token_hash=th_attacker&type=magiclink");

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(arrivals).toEqual([]);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/auth/confirm`);
    // The token leaves the URL: nothing more to leak in a `Referer`.
    expect(response.headers.get("location")).not.toContain("th_attacker");
    expect(pendingFrom(response)).toEqual({
      tokenHash: "th_attacker",
      type: "magiclink",
      next: "/home",
    });
  });

  it("garde le tour OAuth direct — le vérificateur PKCE le lie déjà à ce navigateur", async () => {
    const response = await get("?code=abc");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(arrivals).toEqual(["oauth"]);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/home`);
  });
});

describe("POST /auth/confirm/complete", () => {
  it("ouvre la session quand le cookie d'attente et l'origine sont là", async () => {
    const pending = await get("?token_hash=th_1&type=signup&next=/home");
    store.set(
      AUTH_PENDING_COOKIE,
      decodeURIComponent(/mdy_auth_pending=([^;]*)/.exec(
        pending.headers.get("set-cookie") ?? ""
      )![1])
    );

    const response = await post({ origin: ORIGIN });
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "th_1", type: "signup" });
    expect(arrivals).toEqual(["email_confirmation"]);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/home`);
  });

  it("ne connecte personne sans cookie d'attente — un POST tiers arrive les mains vides", async () => {
    const response = await post({ origin: ORIGIN });
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(`${ORIGIN}/auth/confirm`);
  });

  it("ne connecte personne depuis une autre origine, cookie ou pas", async () => {
    store.set(
      AUTH_PENDING_COOKIE,
      Buffer.from(JSON.stringify({ h: "th_1", t: "magiclink", n: "/home" })).toString(
        "base64url"
      )
    );

    const response = await post({ origin: "https://evil.example" });
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(`${ORIGIN}/login`);
  });

  it("efface le jeton en attente dès qu'il a servi", async () => {
    store.set(
      AUTH_PENDING_COOKIE,
      Buffer.from(JSON.stringify({ h: "th_1", t: "magiclink", n: "/home" })).toString(
        "base64url"
      )
    );

    await post({ origin: ORIGIN });
    expect(store.get(AUTH_PENDING_COOKIE)).toBe("");
  });
});
