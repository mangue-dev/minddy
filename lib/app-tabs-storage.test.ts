// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { appTabsStorageKey, clearAppTabsWindowState } from "./app-tabs-storage";
afterEach(() => sessionStorage.clear());
it("clears tab restoration on sign-out while retaining unrelated session state", () => {
  sessionStorage.setItem(appTabsStorageKey("first"), "private view");
  sessionStorage.setItem(appTabsStorageKey("second"), "another view");
  sessionStorage.setItem("unrelated", "keep");
  clearAppTabsWindowState();
  expect(sessionStorage.getItem(appTabsStorageKey("first"))).toBeNull();
  expect(sessionStorage.getItem(appTabsStorageKey("second"))).toBeNull();
  expect(sessionStorage.getItem("unrelated")).toBe("keep");
});
