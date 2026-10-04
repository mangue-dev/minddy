// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createHomeTab } from "@/lib/app-tabs";
import { AppTabsSession, type AppTabsTransport } from "@/lib/app-tabs-session";
import { activateShortcutTab, navigationShortcut } from "./navigation-shortcuts";
import { CHEATSHEET, resolveKeyToken } from "./shortcuts";

const chord = (init: KeyboardEventInit) => new KeyboardEvent("keydown", {
  metaKey: true, shiftKey: true, ...init,
});

describe("Mod+Shift navigation shortcut parsing", () => {
  it.each([
    ["US", "!@#$%^&*()"],
    ["French AZERTY unshifted symbols", '&é"\'(-è_çà'],
    ["French AZERTY digits", "1234567890"],
    ["German", '!"§$%&/()='],
    ["Spanish", '!"·$%&/()=' ],
  ])("maps all ten number-row keys on %s keyboards", (_layout, keys) => {
    [...keys].forEach((key, index) => {
      for (const modifier of [{ metaKey: false, ctrlKey: true }, { metaKey: true }]) {
        expect(navigationShortcut(chord({ key, code: `Digit${(index + 1) % 10}`, ...modifier })))
          .toEqual({ kind: "tab-index", index });
      }
    });
  });

  it("accepts Control and numeric keys without a physical code", () => {
    expect(navigationShortcut(chord({ key: "0", metaKey: false, ctrlKey: true })))
      .toEqual({ kind: "tab-index", index: 9 });
  });

  it.each([
    ["ArrowLeft", "tab-step", -1], ["ArrowRight", "tab-step", 1],
    ["ArrowUp", "sidebar-step", -1], ["ArrowDown", "sidebar-step", 1],
  ])("routes %s", (key, kind, direction) => {
    expect(navigationShortcut(chord({ key }))).toEqual({ kind, direction });
  });

  it.each([
    { shiftKey: false }, { metaKey: false }, { altKey: true },
    { repeat: true }, { isComposing: true }, { key: "x", code: "KeyX" },
  ])("ignores unrelated modifiers, repeats and composition: %j", (override) => {
    expect(navigationShortcut(chord({ key: "!", code: "Digit1", ...override }))).toBeNull();
  });

  it("ignores extension keydown events without keyboard properties", () => {
    expect(navigationShortcut(new Event("keydown") as KeyboardEvent)).toBeNull();
  });

  it("documents the numbered shortcut and all four directions", () => {
    const shortcuts = CHEATSHEET.flatMap((section) => section.shortcuts);
    expect(shortcuts.find((shortcut) => shortcut.id === "nav.numberedTab")?.keys)
      .toEqual([["Ctrl", "⇧", "1–9, 0"]]);
    for (const [id, key] of [
      ["previousTab", "←"], ["nextTab", "→"],
      ["previousSidebarOption", "↑"], ["nextSidebarOption", "↓"],
    ]) {
      expect(shortcuts.find((shortcut) => shortcut.id === `nav.${id}`)?.keys)
        .toEqual([["mod", "⇧", key]]);
    }
  });

  it.each(["MacIntel", "Win32", "Linux x86_64"])("advertises Control for numbered tabs on %s", (platform) => {
    vi.stubGlobal("navigator", { platform, userAgent: platform });
    try {
      const numbered = CHEATSHEET.flatMap((section) => section.shortcuts)
        .find((shortcut) => shortcut.id === "nav.numberedTab")!;
      expect(numbered.keys.map((step) => step.map(resolveKeyToken)))
        .toEqual([["Ctrl", "⇧", "1–9, 0"]]);
      for (const digit of [3, 4, 5]) {
        expect(navigationShortcut(chord({
          metaKey: false, ctrlKey: true, key: String(digit), code: `Digit${digit}`,
        }))).toEqual({ kind: "tab-index", index: digit - 1 });
      }
    } finally { vi.unstubAllGlobals(); }
  });
});

describe("shortcut tab activation", () => {
  const tabId = (index: number) => `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  async function setup() {
    const tabs = Array.from({ length: 11 }, (_, index) => ({
      ...createHomeTab("owner", tabId(index), index),
      pinned: index < 2, href: index === 0 ? "/home" : `/all?tab=${index}`,
    }));
    const transport: AppTabsTransport = {
      create: vi.fn(), patch: vi.fn(), close: vi.fn(), move: vi.fn(),
    };
    const session = new AppTabsSession("owner", transport);
    session.receive(tabs);
    await session.initialize("/home");
    session.navigate = vi.fn();
    return session;
  }

  it("uses pinned and overflow order, and wraps across every tab", async () => {
    const session = await setup();
    try {
      expect(activateShortcutTab(session, { kind: "tab-index", index: 9 })).toBe(true);
      await vi.waitFor(() => expect(session.getSnapshot().activeId).toBe(tabId(9)));
      activateShortcutTab(session, { kind: "tab-step", direction: 1 });
      await vi.waitFor(() => expect(session.getSnapshot().activeId).toBe(tabId(10)));
      activateShortcutTab(session, { kind: "tab-step", direction: 1 });
      await vi.waitFor(() => expect(session.getSnapshot().activeId).toBe(tabId(0)));
      activateShortcutTab(session, { kind: "tab-step", direction: -1 });
      await vi.waitFor(() => expect(session.getSnapshot().activeId).toBe(tabId(10)));
      activateShortcutTab(session, { kind: "tab-index", index: 0 });
      await vi.waitFor(() => expect(session.getSnapshot().activeId).toBe(tabId(0)));
    } finally { session.dispose(); }
  });

  it("honors departure guards and ignores more navigation while saving", async () => {
    const session = await setup();
    let finish!: (allowed: boolean) => void;
    session.registerDeparture(() => new Promise((resolve) => { finish = resolve; }));
    try {
      activateShortcutTab(session, { kind: "tab-index", index: 1 });
      await vi.waitFor(() => expect(session.getSnapshot().busy).toBe(true));
      expect(activateShortcutTab(session, { kind: "tab-step", direction: 1 })).toBe(false);
      finish(false);
      await vi.waitFor(() => expect(session.getSnapshot().busy).toBe(false));
      expect(session.getSnapshot().activeId).toBe(tabId(0));
      expect(session.navigate).not.toHaveBeenCalled();
    } finally { session.dispose(); }
  });

  it("leaves missing sessions, empty lists and unavailable indices alone", async () => {
    expect(activateShortcutTab(null, { kind: "tab-index", index: 0 })).toBe(false);
    const session = await setup();
    try {
      expect(activateShortcutTab(session, { kind: "tab-index", index: 15 })).toBe(false);
      session.receive([session.getSnapshot().tabs[0]]);
      expect(activateShortcutTab(session, { kind: "tab-index", index: 1 })).toBe(false);
      expect(session.getSnapshot().activeId).toBe(tabId(0));
    } finally { session.dispose(); }
  });
});
