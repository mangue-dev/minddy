import { describe, expect, it } from "vitest";
import { SWIPE_ACTION_DISTANCE, swipeAction } from "./inbox-row";

describe("swipeAction (MIN-975)", () => {
  it("toggles read when swiped right far enough, and deletes when swiped left", () => {
    expect(swipeAction(SWIPE_ACTION_DISTANCE, 0)).toBe("toggle-read");
    expect(swipeAction(-SWIPE_ACTION_DISTANCE, 0)).toBe("delete");
  });

  it("springs back on a short, slow swipe", () => {
    expect(swipeAction(SWIPE_ACTION_DISTANCE - 1, 100)).toBeNull();
    expect(swipeAction(-40, -100)).toBeNull();
  });

  it("acts on a flick, but not on a tremor or a flick back towards the start", () => {
    expect(swipeAction(30, 900)).toBe("toggle-read");
    expect(swipeAction(-30, -900)).toBe("delete");
    expect(swipeAction(10, 900)).toBeNull();
    expect(swipeAction(40, -900)).toBeNull();
  });
});
