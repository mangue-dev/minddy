import { describe, expect, it } from "vitest";
import { readAnalyzeOption } from "./analyze-option";

describe("readAnalyzeOption", () => {
  it("defaults to true when the field is absent", () => {
    expect(readAnalyzeOption(undefined)).toEqual({ ok: true, analyze: true });
  });

  it("takes an explicit boolean", () => {
    expect(readAnalyzeOption(true)).toEqual({ ok: true, analyze: true });
    expect(readAnalyzeOption(false)).toEqual({ ok: true, analyze: false });
  });

  // No coercion: these values ​​are integration bugs, not
  // intentions to guess — and being wrong publishes unmoderated material on a public board.
  it.each([["false"], ["true"], [0], [1], [null], [{}], [[]], ["yes"], ["no"]])(
    "rejects %p",
    (value) => {
      expect(readAnalyzeOption(value)).toEqual({ ok: false, error: "invalid_analyze" });
    }
  );
});
