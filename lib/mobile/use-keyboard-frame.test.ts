import { describe, expect, it } from "vitest";

import { keyboardFrameStyle } from "./use-keyboard-frame";

describe("keyboardFrameStyle", () => {
  it("leaves the column in place without a keyboard", () => {
    expect(keyboardFrameStyle({ height: null, top: 0, duration: 0 })).toBeUndefined();
  });

  it("fits the column between the screen's sides by default", () => {
    const style = keyboardFrameStyle({ height: 400, top: 0, duration: 250 });
    expect(style).toMatchObject({ position: "fixed", insetInline: 0, width: "auto", top: 0, height: 400 });
  });

  it("keeps the side insets its parent cleared, so it does not move sideways", () => {
    // iPhone Duo: the status bar stands on the right side, 84px wide. A
    // `w-full` column given a left inset kept its full width and moved right.
    const style = keyboardFrameStyle(
      { height: 400, top: 0, duration: 250 },
      "var(--safe-inline-start) var(--safe-inline-end)",
    );
    expect(style).toMatchObject({ insetInline: "var(--safe-inline-start) var(--safe-inline-end)", width: "auto" });
  });
});
