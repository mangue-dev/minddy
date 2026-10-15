import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sharedFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/supabase-fetch", () => ({ supabaseSharedFetch: sharedFetch }));

const START = Date.parse("2026-10-15T08:00:00.000Z");
const MINUTE = 60 * 1000;
const asymmetric = { alg: "ES256", kid: "key-a" };
const keySet = (kid: string) => ({ keys: [{ kty: "EC", kid, crv: "P-256", x: "x", y: "y" }] });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
let jwks: typeof import("./auth-jwks");

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
  vi.stubEnv("MINDDY_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
  sharedFetch.mockReset();
  sharedFetch.mockImplementation(async () => Response.json(keySet("key-a")));
  jwks = await import("./auth-jwks");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function primed() {
  jwks.noteVerifiedSigningKey(asymmetric);
  await settle();
  sharedFetch.mockClear();
}

describe("shared verification key set", () => {
  it("never fetches for a deployment that signs with a shared secret", async () => {
    jwks.noteVerifiedSigningKey({ alg: "HS256", kid: "legacy" });
    jwks.noteVerifiedSigningKey({ alg: "ES256" });
    await settle();
    expect(await jwks.verificationJwks()).toBeUndefined();
    expect(sharedFetch).not.toHaveBeenCalled();
  });

  it("fetches the public key set once after the first verified asymmetric token", async () => {
    jwks.noteVerifiedSigningKey(asymmetric);
    jwks.noteVerifiedSigningKey(asymmetric);
    await settle();
    expect(sharedFetch).toHaveBeenCalledOnce();
    expect(sharedFetch.mock.calls[0][0]).toBe("https://fixture.supabase.co/auth/v1/.well-known/jwks.json");
    expect(await jwks.verificationJwks()).toEqual(keySet("key-a"));
  });

  it("serves a fresh set without fetching and refreshes it once ahead of expiry", async () => {
    await primed();
    vi.setSystemTime(START + 7 * MINUTE);
    expect(await jwks.verificationJwks()).toEqual(keySet("key-a"));
    expect(sharedFetch).not.toHaveBeenCalled();

    let release!: (response: Response) => void;
    sharedFetch.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    vi.setSystemTime(START + 9 * MINUTE);
    const served = await Promise.all([jwks.verificationJwks(), jwks.verificationJwks(), jwks.verificationJwks()]);
    expect(served).toEqual(Array(3).fill(keySet("key-a")));
    await settle();
    expect(sharedFetch).toHaveBeenCalledOnce();
    release(Response.json(keySet("key-b")));
    await settle();
    expect(await jwks.verificationJwks()).toEqual(keySet("key-b"));
    expect(sharedFetch).toHaveBeenCalledOnce();
  });

  it("makes concurrent requests wait for one fetch once the set is ten minutes old", async () => {
    await primed();
    let release!: (response: Response) => void;
    sharedFetch.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    vi.setSystemTime(START + 10 * MINUTE);
    const waiting = Array.from({ length: 6 }, () => jwks.verificationJwks());
    let delivered = false;
    void Promise.all(waiting).then(() => { delivered = true; });
    await settle();
    expect(delivered).toBe(false);
    expect(sharedFetch).toHaveBeenCalledOnce();
    release(Response.json(keySet("key-b")));
    expect(await Promise.all(waiting)).toEqual(Array(6).fill(keySet("key-b")));
  });

  it("never supplies an expired set when its refresh fails", async () => {
    await primed();
    sharedFetch.mockResolvedValue(new Response("{}", { status: 404 }));
    vi.setSystemTime(START + 11 * MINUTE);
    expect(await jwks.verificationJwks()).toBeUndefined();
    sharedFetch.mockResolvedValue(Response.json({ keys: [] }));
    vi.setSystemTime(START + 12 * MINUTE + 1);
    expect(await jwks.verificationJwks()).toBeUndefined();
    expect(sharedFetch).toHaveBeenCalledTimes(2);
  });

  it("reports an unavailable backend, then leaves lookups to the SDK for a minute", async () => {
    await primed();
    sharedFetch.mockRejectedValue(Object.assign(new Error("timed out"), { name: "TimeoutError" }));
    vi.setSystemTime(START + 10 * MINUTE);
    await expect(jwks.verificationJwks()).rejects.toThrow("timed out");
    vi.setSystemTime(START + 10 * MINUTE + 30_000);
    expect(await jwks.verificationJwks()).toBeUndefined();
    expect(sharedFetch).toHaveBeenCalledOnce();
    sharedFetch.mockResolvedValue(new Response("unavailable", { status: 503 }));
    vi.setSystemTime(START + 11 * MINUTE + 1);
    await expect(jwks.verificationJwks()).rejects.toThrow("jwks_fetch_failed");
  });
});
