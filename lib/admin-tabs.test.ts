import { describe, expect, it } from "vitest";

import { giftSectionVisible, visibleAdminTabs } from "./admin-tabs";

describe("visibleAdminTabs", () => {
  it("shows every tab while the capabilities are unknown", () => {
    expect(visibleAdminTabs(null)).toEqual(["overview", "users", "finances", "models"]);
  });

  it("keeps finances when OpenRouter is linked", () => {
    expect(visibleAdminTabs(true)).toContain("finances");
  });

  it("drops the finances tab without an OpenRouter key", () => {
    expect(visibleAdminTabs(false)).toEqual(["overview", "users", "models"]);
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
