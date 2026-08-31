import { describe, expect, it } from "vitest";

import {
  desktopLocalRunDiffId,
  parseDesktopLocalRunDiff,
} from "./local-run-diff";

describe("desktop local run diff request", () => {
  it("accepts an opaque run id", () => {
    expect(desktopLocalRunDiffId({ runId: "01234567-89ab-cdef-0123-456789abcdef" }))
      .toBe("01234567-89ab-cdef-0123-456789abcdef");
  });

  it("rejects paths and malformed values", () => {
    expect(desktopLocalRunDiffId({ runId: "../secrets" })).toBeNull();
    expect(desktopLocalRunDiffId({ runId: "/tmp/run" })).toBeNull();
    expect(desktopLocalRunDiffId({ runId: "a/b" })).toBeNull();
    expect(desktopLocalRunDiffId(null)).toBeNull();
  });

  it("bounds and validates the artifact returned to the renderer", () => {
    const parsed = parseDesktopLocalRunDiff({
      files: [
        { filename: "src/a.ts", status: "modified", additions: 1.6, patch: "@@\n+x" },
        { filename: "", patch: "ignored" },
      ],
      snapshot: true,
    });
    expect(parsed).toEqual({
      files: [{
        filename: "src/a.ts",
        status: "modified",
        additions: 2,
        deletions: 0,
        patch: "@@\n+x",
      }],
      truncated: false,
      snapshot: true,
    });
  });
});
