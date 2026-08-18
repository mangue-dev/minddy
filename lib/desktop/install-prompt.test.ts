import { describe, expect, it } from "vitest";
import {
  DESKTOP_PROMPT_DISMISSED_META_KEY,
  isMacPlatform,
  resolveDesktopPromptDismissed,
  shouldOfferDesktopApp,
} from "./install-prompt";

describe("resolveDesktopPromptDismissed", () => {
  it("is false by default — nothing has been dismissed until stated otherwise", () => {
    expect(resolveDesktopPromptDismissed(undefined)).toBe(false);
    expect(resolveDesktopPromptDismissed(null)).toBe(false);
    expect(resolveDesktopPromptDismissed({})).toBe(false);
  });

  it("n'accepte que le VRAI booléen", () => {
    expect(resolveDesktopPromptDismissed({ [DESKTOP_PROMPT_DISMISSED_META_KEY]: true })).toBe(true);
    // A value inherited from another format must not hide the proposition
    // forever on a misunderstanding.
    expect(resolveDesktopPromptDismissed({ [DESKTOP_PROMPT_DISMISSED_META_KEY]: "true" })).toBe(false);
    expect(resolveDesktopPromptDismissed({ [DESKTOP_PROMPT_DISMISSED_META_KEY]: 1 })).toBe(false);
  });
});

describe("isMacPlatform", () => {
  it("recognizes a Mac from the non-deprecated field", () => {
    expect(isMacPlatform({ uaDataPlatform: "macOS", maxTouchPoints: 0 })).toBe(true);
    expect(isMacPlatform({ uaDataPlatform: "Windows", maxTouchPoints: 0 })).toBe(false);
    expect(isMacPlatform({ uaDataPlatform: "Linux", maxTouchPoints: 0 })).toBe(false);
  });

  it("falls back to `platform` — it is Safari's only path", () => {
    expect(isMacPlatform({ platform: "MacIntel", maxTouchPoints: 0 })).toBe(true);
    expect(isMacPlatform({ platform: "Win32", maxTouchPoints: 0 })).toBe(false);
  });

  it("finally falls back to the user agent", () => {
    expect(
      isMacPlatform({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" })
    ).toBe(true);
    expect(isMacPlatform({ userAgent: "Mozilla/5.0 (X11; Linux x86_64)" })).toBe(false);
  });

  /**
 * The trap that justifies the whole module: since iPadOS 13 an iPad declares itself
 * `MacIntel` with a Macintosh user agent. Without the touch test, we would
 * offer a `.dmg`.
 */
  it("does NOT mistake an iPad for a Mac", () => {
    expect(
      isMacPlatform({
        platform: "MacIntel",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        maxTouchPoints: 5,
      })
    ).toBe(false);
  });

  it("ne conclut rien d'une sonde vide", () => {
    expect(isMacPlatform({})).toBe(false);
  });
});

describe("shouldOfferDesktopApp", () => {
  const mac = { inDesktopApp: false, isMac: true, dismissed: false };

  it("offers on a Mac in a browser to someone who has dismissed nothing", () => {
    expect(shouldOfferDesktopApp(mac)).toBe(true);
  });

  it("stays silent inside the app itself", () => {
    expect(shouldOfferDesktopApp({ ...mac, inDesktopApp: true })).toBe(false);
  });

  it("se tait hors macOS — il n'y a pas de version à proposer", () => {
    expect(shouldOfferDesktopApp({ ...mac, isMac: false })).toBe(false);
  });

  it("stays silent once dismissed, forever", () => {
    expect(shouldOfferDesktopApp({ ...mac, dismissed: true })).toBe(false);
  });
});
