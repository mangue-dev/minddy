import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sidebar = readFileSync("components/app-sidebar.tsx", "utf8");
const actions = readFileSync("components/app-top-actions.tsx", "utf8");
const topBar = readFileSync("components/app-top-bar.tsx", "utf8");
const windowButtons = readFileSync("components/desktop-window-buttons.tsx", "utf8");
describe("primary sidebar chrome", () => {
  it("keeps the inbox badge anchored to its icon in the global bar", () => {
    expect(actions.includes('className="relative flex size-4 shrink-0"')).toBe(true);
    expect(actions.includes('data-inbox-trigger={inboxTrigger || undefined}')).toBe(true);
  });
  it("moves creation actions into the shared-height inset without duplicating them", () => {
    expect(sidebar.includes('sidebar-brand-row relative flex h-[var(--app-content-header-height)]')).toBe(true);
    expect(sidebar.match(/<SidebarQuickActions/g)).toHaveLength(1);
    expect(sidebar.includes('<SidebarBrand')).toBe(false);
    expect(sidebar.includes('<SidebarTopActions')).toBe(false);
    expect(sidebar.includes('pt-[calc((var(--app-content-header-height)-2.25rem)/2)]')).toBe(true);
  });
  it("keeps native controls outside the rail and hidden navigation", () => {
    expect(sidebar.includes('useHoldWindowButtons')).toBe(false);
    expect(topBar.includes('WindowButtonDecoys')).toBe(false);
  });
  it("keeps the macOS buttons visible under dialogs, palettes and drawers", () => {
    expect(windowButtons.includes("useHoldWindowButtons")).toBe(false);
    expect(windowButtons.includes("useAnyModalOpen")).toBe(false);
  });
});
