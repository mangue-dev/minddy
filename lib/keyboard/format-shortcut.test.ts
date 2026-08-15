import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatModShiftShortcut,
  formatModShortcut,
  resolveKeyToken,
} from "@/lib/keyboard/shortcuts";

/**
 * La plateforme est lue sur `navigator`, qui n'existe pas en `environment:
 * "node"` : on le pose le temps du test. `platform` est en lecture seule sur un
 * vrai `Navigator`, d'où l'objet minimal plutôt qu'un `vi.spyOn`.
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

  // Le point de l'existence de cette fonction : hors Mac on veut le MOT
  // « Shift » et un second « + », pas le symbole ⇧ au milieu d'une phrase
  // Windows — ce qu'aurait donné `formatModShortcut("⇧L")`.
  it("écrit Ctrl+Shift+L ailleurs, en toutes lettres", () => {
    withPlatform("Win32", () =>
      expect(formatModShiftShortcut("L")).toBe("Ctrl+Shift+L")
    );
    withPlatform("Linux x86_64", () =>
      expect(formatModShiftShortcut("L")).toBe("Ctrl+Shift+L")
    );
  });
});
