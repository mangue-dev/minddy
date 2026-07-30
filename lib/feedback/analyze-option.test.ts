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

  // Aucune coercition : ces valeurs-là sont des bugs d'intégration, pas des
  // intentions à deviner — et se tromper publie du non-modéré sur un board public.
  it.each([["false"], ["true"], [0], [1], [null], [{}], [[]], ["yes"], ["no"]])(
    "rejects %p",
    (value) => {
      expect(readAnalyzeOption(value)).toEqual({ ok: false, error: "invalid_analyze" });
    }
  );
});
