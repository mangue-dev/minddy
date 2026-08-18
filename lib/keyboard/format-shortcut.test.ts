import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatModShiftShortcut,
  formatModShortcut,
  resolveKeyToken,
} from "@/lib/keyboard/shortcuts";

/**
 * The platform is read on `navigator`, which does not exist in environment:
 * "node"` : on le pose le temps du test. `platform` is read-only on a
 * true `Navigator`, hence the minimal object rather than a `vi.spyOn`.
 */
function withPlatform(platform: string, run: () => void) {
  vi.stubGlobal("navigator", { platform, userAgent: platform });
  try {
    run();
  } finally {
    vi.unstubAllGlobals();
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("resolveKeyToken", () => {
  it("rend ⌘ sur un Mac et Ctrl ailleurs", () => {
    withPlatform("MacIntel", () => expect(resolveKeyToken("mod")).toBe("⌘"));
    withPlatform("Win32", () => expect(resolveKeyToken("mod")).toBe("Ctrl"));
  });

  it("laisse passer tout ce qui n'est pas « mod »", () => {
    withPlatform("MacIntel", () => expect(resolveKeyToken("⇧")).toBe("⇧"));
  });
});

describe("formatModShortcut", () => {
  it("colle sur un Mac, sépare d'un « + » ailleurs", () => {
    withPlatform("MacIntel", () => expect(formatModShortcut("K")).toBe("⌘K"));
    withPlatform("Win32", () => expect(formatModShortcut("K")).toBe("Ctrl+K"));
  });
});

describe("formatModShiftShortcut", () => {
  it("écrit ⌘⇧L sur un Mac", () => {
    withPlatform("MacIntel", () =>
      expect(formatModShiftShortcut("L")).toBe("⌘⇧L")
    );
  });

  // The point of the existence of this function: outside Mac we want the MOT
  // “Shift” and a second “+”, not the ⇧ symbol in the middle of a sentence
  // Windows — what `formatModShortcut("⇧L")` would have given.
  it("écrit Ctrl+Shift+L ailleurs, en toutes lettres", () => {
    withPlatform("Win32", () =>
      expect(formatModShiftShortcut("L")).toBe("Ctrl+Shift+L")
    );
    withPlatform("Linux x86_64", () =>
      expect(formatModShiftShortcut("L")).toBe("Ctrl+Shift+L")
    );
  });
});
