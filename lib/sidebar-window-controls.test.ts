import { describe, expect, it } from "vitest";
import { WINDOW_BUTTONS_WIDTH } from "./sidebar-window-controls";
import { APP_TOP_BAR_HEIGHT } from "./app-chrome-layout";
import { MACOS_TRAFFIC_LIGHT_POSITION } from "./desktop/window-frame";

describe("application bar native control geometry", () => {
  it("contains all three native controls without overlapping the next action", () => {
    expect(MACOS_TRAFFIC_LIGHT_POSITION.x + 2 * 23 + 14).toBeLessThan(WINDOW_BUTTONS_WIDTH);
    expect(MACOS_TRAFFIC_LIGHT_POSITION.y + 14).toBeLessThan(APP_TOP_BAR_HEIGHT);
    expect(2 * MACOS_TRAFFIC_LIGHT_POSITION.y + 14).toBe(APP_TOP_BAR_HEIGHT);
  });
});
