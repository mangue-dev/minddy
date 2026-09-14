import { expect, it } from "vitest";
import { APP_TOP_BAR_HEIGHT, appTopBarNavigationWidth } from "./app-chrome-layout";
it("matches the fixed sidebar width and shrinks to its controls when navigation is hidden", () => {
  expect(APP_TOP_BAR_HEIGHT).toBe(44);
  expect(appTopBarNavigationWidth(false)).toBe(320);
  expect(appTopBarNavigationWidth(true)).toBe("auto");
});
