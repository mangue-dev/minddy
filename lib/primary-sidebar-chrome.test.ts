import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sidebar = readFileSync("components/app-sidebar.tsx", "utf8");
const topBar = readFileSync("components/app-top-bar.tsx", "utf8");
const windowButtons = readFileSync("components/desktop-window-buttons.tsx", "utf8");
describe("primary sidebar chrome", () => {
  it("keeps native controls outside the rail and hidden navigation", () => {
    expect(sidebar.includes('useHoldWindowButtons')).toBe(false);
    expect(topBar.includes('WindowButtonDecoys')).toBe(false);
  });
  it("keeps the macOS buttons visible under dialogs, palettes and drawers", () => {
    expect(windowButtons.includes("useHoldWindowButtons")).toBe(false);
    expect(windowButtons.includes("useAnyModalOpen")).toBe(false);
  });
});
