import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-324 — the link that the three forge callbacks had skipped: the
 * `state` says where we are going, the session says who is coming back. Two tests carry all the
 * correction: "an absence of session authorizes nothing" and "a `state` of a
 * other account does not constitute identity".
 */

const getClaims = vi.fn();
const collected: { name: string; value: string }[] = [];

vi.mock("@/lib/server/api-auth", () => ({
  createSupabaseWithCookieSink: () => ({
    supabase: { auth: { getClaims } },
    collect: () => {},
    applyCookies: <T,>(response: T) => response,
  }),
}));

const { readForgeCallbackSession, sessionMatchesState } = await import(
  "./callback-session"
);

beforeEach(() => {
  vi.clearAllMocks();
  collected.length = 0;
});

describe("sessionMatchesState", () => {
  it("refuse deux absences : ne pas savoir qui revient n'autorise personne", () => {
    expect(sessionMatchesState(null, null)).toBe(false);
    expect(sessionMatchesState(undefined, undefined)).toBe(false);
    expect(sessionMatchesState("", "")).toBe(false);
  });

  it("rejects a missing session with a valid state", () => {
    expect(sessionMatchesState(null, "user-1")).toBe(false);
  });

  it("rejects a state without a user with a valid session", () => {
    expect(sessionMatchesState("user-1", null)).toBe(false);
  });

  it("rejects two different identifiers — that is the attack", () => {
    expect(sessionMatchesState("victime", "attaquant")).toBe(false);
  });

  it("accepte l'égalité", () => {
    expect(sessionMatchesState("user-1", "user-1")).toBe(true);
  });
});

describe("readForgeCallbackSession", () => {
  it("rend le `sub` des claims", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    const session = await readForgeCallbackSession({} as never);
    expect(session.userId).toBe("user-1");
  });

  it("rend null quand il n'y a pas de session", async () => {
    getClaims.mockResolvedValue({ data: null, error: { message: "no session" } });
    const session = await readForgeCallbackSession({} as never);
    expect(session.userId).toBeNull();
  });

  it("returns null — not an exception — when Supabase is unreachable", async () => {
    getClaims.mockRejectedValue(new Error("fetch failed"));
    const session = await readForgeCallbackSession({} as never);
    expect(session.userId).toBeNull();
  });
});
