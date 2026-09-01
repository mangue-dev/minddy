import { describe, expect, it } from "vitest";

import { DIFF_UNSAFE_CSS } from "./diff-theme";

describe("diff interaction styles", () => {
  it("keeps code selectable inside the diff renderer shadow root", () => {
    expect(DIFF_UNSAFE_CSS).toContain("user-select: text !important");
    expect(DIFF_UNSAFE_CSS).toContain("-webkit-user-select: text !important");
  });
});
