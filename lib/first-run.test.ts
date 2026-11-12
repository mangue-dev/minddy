import { describe, expect, it } from "vitest";
import { PROFILE_SETUP_META_KEY, PROFILE_SETUP_SINCE, firstRunPendingFromCookies, needsProfileSetup, suggestedName } from "./first-run";

describe("needsProfileSetup", () => {
  it("asks an account created since the screen exists", () => {
    expect(needsProfileSetup({ created_at: "2026-11-20T10:00:00Z", user_metadata: {} })).toBe(true);
  });

  it("asks an account from a sign-in service too, whose name is only a suggestion", () => {
    expect(needsProfileSetup({ created_at: "2026-11-20T10:00:00Z", user_metadata: { full_name: "Ana" } })).toBe(true);
  });

  it("stops once the profile is confirmed", () => {
    expect(needsProfileSetup({ created_at: "2026-11-20T10:00:00Z", user_metadata: { [PROFILE_SETUP_META_KEY]: true } })).toBe(false);
  });

  it("leaves older accounts and missing sessions alone", () => {
    expect(needsProfileSetup({ created_at: "2026-10-01T10:00:00Z", user_metadata: {} })).toBe(false);
    expect(needsProfileSetup({ user_metadata: {} })).toBe(false);
    expect(needsProfileSetup(null)).toBe(false);
  });
});

describe("suggestedName", () => {
  it("prefers the name chosen in minddy, then the service's", () => {
    expect(suggestedName({ display_name: "Ana", full_name: "Ana Lima" })).toBe("Ana");
    expect(suggestedName({ full_name: " Ana Lima " })).toBe("Ana Lima");
    expect(suggestedName({ name: "ana" })).toBe("ana");
  });

  it("starts empty without a name", () => {
    expect(suggestedName({})).toBe("");
    expect(suggestedName(null)).toBe("");
  });
});

describe("firstRunPendingFromCookies", () => {
  // The session cookie as @supabase/ssr writes it: base64url JSON, split in chunks.
  const cookie = (user: Record<string, unknown>, chunk = 0) => {
    const value = "base64-" + Buffer.from(JSON.stringify({ access_token: "a", user })).toString("base64url");
    if (!chunk) return `theme=dark; sb-abc-auth-token=${value}`;
    return `sb-abc-auth-token.1=${value.slice(chunk)}; sb-abc-auth-token.0=${value.slice(0, chunk)}`;
  };
  const fresh = { created_at: "2026-11-20T10:00:00Z", user_metadata: {} };

  it("covers the app for a new account until its profile and tour are done", () => {
    expect(firstRunPendingFromCookies(cookie(fresh), PROFILE_SETUP_SINCE)).toBe(true);
    expect(firstRunPendingFromCookies(cookie({ ...fresh, user_metadata: { profile_setup_done: true } }), PROFILE_SETUP_SINCE)).toBe(true);
    expect(firstRunPendingFromCookies(cookie({ ...fresh, user_metadata: { profile_setup_done: true, onboarding_dismissed: true } }), PROFILE_SETUP_SINCE)).toBe(false);
  });

  it("reads a session split over several cookies", () => {
    expect(firstRunPendingFromCookies(cookie(fresh, 20), PROFILE_SETUP_SINCE)).toBe(true);
  });

  it("leaves older accounts, no session and unreadable cookies alone", () => {
    expect(firstRunPendingFromCookies(cookie({ ...fresh, created_at: "2026-10-01T10:00:00Z" }), PROFILE_SETUP_SINCE)).toBe(false);
    expect(firstRunPendingFromCookies("theme=dark", PROFILE_SETUP_SINCE)).toBe(false);
    expect(firstRunPendingFromCookies("sb-abc-auth-token=base64-%%%", PROFILE_SETUP_SINCE)).toBe(false);
  });

  it("runs from its own source, as the inline script does", () => {
    const run = new Function(`return (${firstRunPendingFromCookies.toString()})(arguments[0], arguments[1]);`);
    expect(run(cookie(fresh), PROFILE_SETUP_SINCE)).toBe(true);
  });
});
