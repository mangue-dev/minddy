import { expect, it } from "vitest";
import { APP_TOP_BAR_HEIGHT, appTopBarNavigationWidth } from "./app-chrome-layout";
it("matches docked sidebar widths and ignores a hidden secondary sidebar", () => {
  expect(APP_TOP_BAR_HEIGHT).toBe(44);
  expect(appTopBarNavigationWidth(false, false)).toBe(256);
  expect(appTopBarNavigationWidth(false, true)).toBe(376);
  expect(appTopBarNavigationWidth(true, false)).toBe(256);
  expect(appTopBarNavigationWidth(true, true)).toBe(256);
});
