import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_PENDING_COOKIE, decodePendingOtp } from "@/lib/auth-otp-pending";

/**
 * MIN-345 — la fixation de session par le callback web.
 *
 * L'attaque tient en une phrase : l'attaquant demande un lien pour SON compte
 * et l'envoie à sa victime. Si `GET /auth/callback?token_hash=…` ouvre une
 * session, la victime travaille désormais dans le compte de l'attaquant, qui
 * lit tout ce qu'elle y écrit.
 *
 * Ce que ce fichier tient, et qu'aucune relecture ne tient : **aucun `GET` ne
 * consomme le jeton**, et le `POST` qui le consomme ne part que d'ici.
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

/** Le magasin de cookies du serveur, celui que `next/headers` rend. */
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

/** Le cookie d'attente tel que la réponse le pose, décodé. */
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
    // Le jeton quitte l'URL : plus rien à fuiter dans un `Referer`.
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
