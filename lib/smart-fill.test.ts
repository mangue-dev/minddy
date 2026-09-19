import { describe, expect, it } from "vitest";

import {
  resolveSmartFill,
  resolveSmartFillScope,
  SMART_FILL_CREATED_META_KEY,
  SMART_FILL_META_KEY,
  SMART_FILL_TRIAGE_META_KEY,
} from "./smart-fill";

/**
 * The default, and that alone — but it's the detail that decides whether the feature
 * exists for a new account. An account has NO metadata as long as it has
 * touched nothing: reading the absence as a refusal would turn off Smart-fill for everyone
 * except those who turned it on by hand.
 */
describe("resolveSmartFill", () => {
  it("is enabled for an account that has never configured anything", () => {
    expect(resolveSmartFill(undefined)).toBe(true);
    expect(resolveSmartFill(null)).toBe(true);
    expect(resolveSmartFill({})).toBe(true);
  });

  it("n'est coupé que par un false explicite", () => {
    expect(resolveSmartFill({ [SMART_FILL_META_KEY]: false })).toBe(false);
    expect(resolveSmartFill({ [SMART_FILL_META_KEY]: true })).toBe(true);
  });

  it("ignores a value of another type instead of trusting it", () => {
    // A metadata is free JSON: `"false"` is a string, not a refusal.
    expect(resolveSmartFill({ [SMART_FILL_META_KEY]: "false" })).toBe(true);
    expect(resolveSmartFill({ [SMART_FILL_META_KEY]: 0 })).toBe(true);
  });

  it("is not determined by the neighboring preference", () => {
    expect(resolveSmartFill({ auto_assign_on_start: false })).toBe(true);
  });
});

describe("resolveSmartFillScope", () => {
  it("enables both automatic scopes by default", () => {
    expect(resolveSmartFillScope(undefined, "created")).toBe(true);
    expect(resolveSmartFillScope({}, "triage")).toBe(true);
  });

  it("lets each automatic scope be disabled independently", () => {
    const meta = {
      [SMART_FILL_CREATED_META_KEY]: false,
      [SMART_FILL_TRIAGE_META_KEY]: true,
    };
    expect(resolveSmartFillScope(meta, "created")).toBe(false);
    expect(resolveSmartFillScope(meta, "triage")).toBe(true);
  });

  it("keeps the master switch authoritative", () => {
    const meta = {
      [SMART_FILL_META_KEY]: false,
      [SMART_FILL_CREATED_META_KEY]: true,
      [SMART_FILL_TRIAGE_META_KEY]: true,
    };
    expect(resolveSmartFillScope(meta, "created")).toBe(false);
    expect(resolveSmartFillScope(meta, "triage")).toBe(false);
  });
});
