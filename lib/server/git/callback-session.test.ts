import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-324 — le maillon que les trois callbacks de forge avaient sauté : le
 * `state` dit où l'on va, la session dit qui revient. Deux tests portent tout le
 * correctif : « une absence de session n'autorise rien » et « un `state` d'un
 * autre compte ne vaut pas identité ».
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

  it("refuse une session absente face à un state valide", () => {
    expect(sessionMatchesState(null, "user-1")).toBe(false);
  });

  it("refuse un state sans utilisateur face à une session valide", () => {
    expect(sessionMatchesState("user-1", null)).toBe(false);
  });

  it("refuse deux identifiants différents — c'est l'attaque", () => {
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

  it("rend null — pas une exception — si Supabase est injoignable", async () => {
    getClaims.mockRejectedValue(new Error("fetch failed"));
    const session = await readForgeCallbackSession({} as never);
    expect(session.userId).toBeNull();
  });
});
