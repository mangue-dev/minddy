import { describe, expect, it } from "vitest";
import { PROFILE_SETUP_META_KEY, needsProfileSetup, suggestedName } from "./first-run";

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
