import { describe, expect, it } from "vitest";

import { reviewedFileCount, setFileReviewed } from "./pr-file-review";

describe("pull request file review progress", () => {
  it("tracks optional file markers without mutating prior progress", () => {
    const initial = new Set(["app/first.ts"]);
    const updated = setFileReviewed(initial, "app/second.ts", true);

    expect(initial).toEqual(new Set(["app/first.ts"]));
    expect(updated).toEqual(new Set(["app/first.ts", "app/second.ts"]));
    expect(setFileReviewed(updated, "app/first.ts", false)).toEqual(
      new Set(["app/second.ts"]),
    );
  });

  it("counts only files that still exist in the current diff", () => {
    expect(
      reviewedFileCount(
        [{ filename: "app/first.ts" }, { filename: "app/second.ts" }],
        new Set(["app/first.ts", "removed.ts"]),
      ),
    ).toBe(1);
  });
});
