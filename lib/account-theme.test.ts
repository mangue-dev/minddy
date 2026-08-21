import { describe, expect, it } from "vitest";
import {
  ACCOUNT_THEME_HEADER,
  ACCOUNT_THEME_META_KEY,
  ACCOUNT_THEMES,
  isAccountTheme,
  resolveAccountTheme,
  resolveStoredAccountTheme,
} from "./account-theme";

describe("isAccountTheme", () => {
  it("accepts exactly the three documented values", () => {
    for (const value of ACCOUNT_THEMES) {
      expect(isAccountTheme(value)).toBe(true);
    }
  });

  it("refuses junk, other types and case variants", () => {
    expect(isAccountTheme("Light")).toBe(false);
    expect(isAccountTheme("DARK")).toBe(false);
    expect(isAccountTheme("auto")).toBe(false);
    expect(isAccountTheme("")).toBe(false);
    expect(isAccountTheme(null)).toBe(false);
    expect(isAccountTheme(undefined)).toBe(false);
    expect(isAccountTheme(42)).toBe(false);
    expect(isAccountTheme({})).toBe(false);
  });
});

describe("resolveAccountTheme", () => {
  it("reads the saved theme off user_metadata", () => {
    expect(resolveAccountTheme({ [ACCOUNT_THEME_META_KEY]: "dark" })).toBe(
      "dark",
    );
    expect(resolveAccountTheme({ [ACCOUNT_THEME_META_KEY]: "system" })).toBe(
      "system",
    );
  });

  it("returns null when the account never expressed a preference", () => {
    // An absence must stay an absence — not a silent "system".
    expect(resolveAccountTheme(undefined)).toBeNull();
    expect(resolveAccountTheme({})).toBeNull();
    expect(resolveAccountTheme({ [ACCOUNT_THEME_META_KEY]: "neon" })).toBeNull();
    expect(resolveAccountTheme({ [ACCOUNT_THEME_META_KEY]: 3 })).toBeNull();
  });
});

describe("resolveStoredAccountTheme", () => {
  const storageOf = (value: string | null) => ({
    getItem: (_key: string) => value,
  });

  it("reads the device cache (what mango-ui persists)", () => {
    expect(resolveStoredAccountTheme(storageOf("light"))).toBe("light");
    expect(resolveStoredAccountTheme(storageOf("dark"))).toBe("dark");
    expect(resolveStoredAccountTheme(storageOf("system"))).toBe("system");
  });

  it("returns null without a stored or valid value", () => {
    // Fresh device, private browsing, or a legacy key holding junk.
    expect(resolveStoredAccountTheme(storageOf(null))).toBeNull();
    expect(resolveStoredAccountTheme(storageOf("blue"))).toBeNull();
    expect(resolveStoredAccountTheme(null)).toBeNull();
    expect(resolveStoredAccountTheme(undefined)).toBeNull();
  });

  it("survives a throwing localStorage", () => {
    const throwing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(resolveStoredAccountTheme(throwing)).toBeNull();
  });
});

describe("header contract", () => {
  it("stays inside the proxy's trusted x-minddy namespace", () => {
    // Anything outside `x-minddy-` would NOT be stripped from client requests
    // by the proxy (TRUST_HEADER_PREFIX), i.e. spoofable.
    expect(ACCOUNT_THEME_HEADER.startsWith("x-minddy-")).toBe(true);
  });
});
