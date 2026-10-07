import { describe, expect, it } from "vitest";
import { mobileSidebarWidth, sidebarGestureIntent, sidebarGestureSettlesOpen } from "./mobile-sidebar-reveal";

describe("mobile sidebar reveal geometry and gestures", () => {
  it("uses most of a narrow phone while keeping wider screens close to desktop width", () => {
    expect(mobileSidebarWidth(320)).toBe(296);
    expect(mobileSidebarWidth(390)).toBe(351);
    expect(mobileSidebarWidth(767)).toBe(360);
    for (const width of [280, 320, 390, 480, 600, 767]) expect(mobileSidebarWidth(width)).toBeLessThan(width);
  });
  it("leaves tap jitter and vertical scrolling to their original controls", () => {
    expect(sidebarGestureIntent(4, 3)).toBe("pending");
    expect(sidebarGestureIntent(10, 30)).toBe("vertical");
    expect(sidebarGestureIntent(30, 10)).toBe("horizontal");
    expect(sidebarGestureIntent(-30, 10)).toBe("horizontal");
  });
  it("settles slow drags by distance and decisive swipes by direction", () => {
    expect(sidebarGestureSettlesOpen(170, 320, 0.1)).toBe(true);
    expect(sidebarGestureSettlesOpen(150, 320, 0.1)).toBe(false);
    expect(sidebarGestureSettlesOpen(30, 320, 0.6)).toBe(true);
    expect(sidebarGestureSettlesOpen(290, 320, -0.6)).toBe(false);
  });
});
