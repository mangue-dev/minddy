import { describe, expect, it } from "vitest";

import { estimatedDiffBodyHeight } from "./pr-diff-performance";

describe("estimatedDiffBodyHeight", () => {
  it("reserves one rendered row per patch line for normal diffs", () => {
    expect(
      estimatedDiffBodyHeight({
        filename: "src/app.ts",
        status: "modified",
        additions: 2,
        deletions: 1,
        patch: "@@ -1,2 +1,3 @@\n-old\n+new\n+another",
      }),
    ).toBe(120);
  });

  it("caps oversized placeholders while keeping the scroll target substantial", () => {
    expect(
      estimatedDiffBodyHeight({
        filename: "generated.json",
        status: "modified",
        additions: 10_000,
        deletions: 0,
        patch: Array.from({ length: 10_000 }, (_, index) => `+${index}`).join("\n"),
      }),
    ).toBe(4_000);
  });
});
