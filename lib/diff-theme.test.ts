import { describe, expect, it } from "vitest";

import { DIFF_UNSAFE_CSS } from "./diff-theme";

describe("diff interaction styles", () => {
  it("keeps code selectable inside the diff renderer shadow root", () => {
    expect(DIFF_UNSAFE_CSS).toContain("user-select: text !important");
    expect(DIFF_UNSAFE_CSS).toContain("-webkit-user-select: text !important");
  });

  it("forces the application surface through the renderer shadow root", () => {
    expect(DIFF_UNSAFE_CSS).toContain(
      "--diffs-bg: var(--minddy-diff-bg) !important",
    );
    expect(DIFF_UNSAFE_CSS).toContain(
      "background-color: var(--minddy-diff-bg) !important",
    );
  });
});
