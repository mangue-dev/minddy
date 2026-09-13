import { describe, expect, it } from "vitest";
import { createHomeTab, normalizeAppTabPatch, reconcileAppTabs, selectTabAfterClose, sortAppTabs } from "./app-tabs";

describe("application tabs", () => {
  it("creates independent Home tabs even when destinations and names match", () => {
    const a = createHomeTab("owner");
    const b = createHomeTab("owner");
    expect(a.href).toBe("/home");
    expect(a.id).not.toBe(b.id);
    expect(reconcileAppTabs([a, b], "owner")).toHaveLength(2);
  });
  it("refuses the final close and chooses an adjacent survivor", () => {
    const a = createHomeTab("owner", undefined, 0);
    const b = createHomeTab("owner", undefined, 1);
    const c = createHomeTab("owner", undefined, 2);
    expect(selectTabAfterClose([a], a.id, a.id)).toBe(a.id);
    expect(selectTabAfterClose([a, b, c], b.id, b.id)).toBe(c.id);
    expect(selectTabAfterClose([a, b, c], c.id, c.id)).toBe(b.id);
    expect(selectTabAfterClose([a, b], b.id, a.id)).toBe(a.id);
  });
  it("sorts pinned tabs first without changing their relative order", () => {
    const tabs = Array.from({ length: 1501 }, (_, i) => ({ ...createHomeTab("owner", undefined, i), pinned: i % 2 === 0 }));
    const sorted = sortAppTabs(tabs);
    expect(sorted).toHaveLength(1501);
    expect(sorted.filter((t) => t.pinned).map((t) => t.position)).toEqual(tabs.filter((t) => t.pinned).map((t) => t.position));
  });
  it("isolates owners, prefers canonical revisions, and retains inaccessible destinations", () => {
    const a = createHomeTab("owner");
    const newer = { ...a, revision: 2, custom_name: "Focus" };
    expect(reconcileAppTabs([newer, a, createHomeTab("other")], "owner")).toEqual([newer]);
    expect(reconcileAppTabs([{ ...a, href: "/login" }], "owner")[0].href).toBe("/home");
  });
  it("resets blank names and validates patch fields", () => {
    expect(normalizeAppTabPatch({ custom_name: "   " })).toEqual({ custom_name: null });
    expect(normalizeAppTabPatch({ custom_name: "x".repeat(201) })).toBeNull();
    expect(normalizeAppTabPatch({ pinned: "true" })).toBeNull();
    expect(normalizeAppTabPatch({ user_id: "other" })).toBeNull();
  });
});
