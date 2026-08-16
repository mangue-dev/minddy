import { afterEach, describe, expect, it, vi } from "vitest";
import { CHEATSHEET } from "@/lib/keyboard/shortcuts";
import { filterCheatsheet } from "@/lib/keyboard/filter-cheatsheet";

const translated = {
  sectionTitle: (key: string) => key === "navigation" ? "Navigation" : "General",
  shortcutLabel: (key: string) => ({
    navHome: "Home",
    navInbox: "Inbox",
    search: "Search",
  })[key] ?? key,
};

describe("filterCheatsheet", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps matching shortcuts and removes empty sections", () => {
    const result = filterCheatsheet(CHEATSHEET, "inbox", translated);

    expect(result).toHaveLength(1);
    expect(result[0]?.shortcuts.map(({ id }) => id)).toEqual(["nav.inbox"]);
  });

  it("matches shortcut keys case-insensitively", () => {
    vi.stubGlobal("navigator", { platform: "Win32", userAgent: "Win32" });
    const result = filterCheatsheet(CHEATSHEET, "ctrlk", {
      ...translated,
      shortcutLabel: (key: string) => key,
    });

    expect(result.flatMap(({ shortcuts }) => shortcuts.map(({ id }) => id))).toContain(
      "gen.palette"
    );
  });

  it("returns the complete cheatsheet for an empty query", () => {
    expect(filterCheatsheet(CHEATSHEET, "   ", translated)).toBe(CHEATSHEET);
  });
});
