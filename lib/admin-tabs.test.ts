import { describe, expect, it } from "vitest";

import { giftSectionVisible, resolveAdminTab, visibleAdminTabs } from "./admin-tabs";

describe("visibleAdminTabs", () => {
  it("shows every tab while the capabilities are unknown", () => {
    expect(visibleAdminTabs(null)).toEqual(["accounts", "costs", "models"]);
  });

  it("keeps costs when OpenRouter is linked", () => {
    expect(visibleAdminTabs(true)).toContain("costs");
  });

  it("drops the costs tab without an OpenRouter key", () => {
    expect(visibleAdminTabs(false)).toEqual(["accounts", "models"]);
  });
});

describe("resolveAdminTab (MIN-829)", () => {
  it("sends the spend-guard notification's finances tab to costs", () => {
    expect(resolveAdminTab("finances")).toBe("costs");
  });

  it("sends the former overview and users tabs to accounts", () => {
    expect(resolveAdminTab("overview")).toBe("accounts");
    expect(resolveAdminTab("users")).toBe("accounts");
  });

  it("keeps current tabs and ignores unknown values", () => {
    expect(resolveAdminTab("models")).toBe("models");
    expect(resolveAdminTab("billing")).toBeNull();
    expect(resolveAdminTab(null)).toBeNull();
  });
});

describe("giftSectionVisible", () => {
  it("stays visible while billing state is unknown", () => {
    expect(giftSectionVisible(null, false)).toBe(true);
  });

  it("follows the billing capability", () => {
    expect(giftSectionVisible(true, false)).toBe(true);
    expect(giftSectionVisible(false, false)).toBe(false);
  });

  it("always stays for an override in progress", () => {
    expect(giftSectionVisible(false, true)).toBe(true);
  });
});
