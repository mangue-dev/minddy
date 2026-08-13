import { describe, expect, it } from "vitest";
import {
  DESKTOP_PROMPT_DISMISSED_META_KEY,
  isMacPlatform,
  resolveDesktopPromptDismissed,
  shouldOfferDesktopApp,
} from "./install-prompt";

describe("resolveDesktopPromptDismissed", () => {
  it("est faux par défaut — on n'a rien écarté tant qu'on n'a rien dit", () => {
    expect(resolveDesktopPromptDismissed(undefined)).toBe(false);
    expect(resolveDesktopPromptDismissed(null)).toBe(false);
    expect(resolveDesktopPromptDismissed({})).toBe(false);
  });

  it("n'accepte que le VRAI booléen", () => {
    expect(resolveDesktopPromptDismissed({ [DESKTOP_PROMPT_DISMISSED_META_KEY]: true })).toBe(true);
    // Une valeur héritée d'un autre format ne doit pas cacher la proposition
    // pour toujours sur un malentendu.
    expect(resolveDesktopPromptDismissed({ [DESKTOP_PROMPT_DISMISSED_META_KEY]: "true" })).toBe(false);
    expect(resolveDesktopPromptDismissed({ [DESKTOP_PROMPT_DISMISSED_META_KEY]: 1 })).toBe(false);
  });
});

describe("isMacPlatform", () => {
  it("reconnaît un Mac par le champ non déprécié", () => {
    expect(isMacPlatform({ uaDataPlatform: "macOS", maxTouchPoints: 0 })).toBe(true);
    expect(isMacPlatform({ uaDataPlatform: "Windows", maxTouchPoints: 0 })).toBe(false);
    expect(isMacPlatform({ uaDataPlatform: "Linux", maxTouchPoints: 0 })).toBe(false);
  });

  it("retombe sur `platform` — c'est le seul chemin de Safari", () => {
    expect(isMacPlatform({ platform: "MacIntel", maxTouchPoints: 0 })).toBe(true);
    expect(isMacPlatform({ platform: "Win32", maxTouchPoints: 0 })).toBe(false);
  });

  it("retombe enfin sur l'user agent", () => {
    expect(
      isMacPlatform({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" })
    ).toBe(true);
    expect(isMacPlatform({ userAgent: "Mozilla/5.0 (X11; Linux x86_64)" })).toBe(false);
  });

  /**
   * Le piège qui justifie tout le module : depuis iPadOS 13 un iPad se déclare
   * `MacIntel` avec un user agent de Macintosh. Sans le test tactile, on lui
   * proposerait un `.dmg`.
   */
  it("ne prend PAS un iPad pour un Mac", () => {
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

  it("propose sur un Mac, dans un navigateur, à qui n'a rien écarté", () => {
    expect(shouldOfferDesktopApp(mac)).toBe(true);
  });

  it("se tait dans l'app elle-même", () => {
    expect(shouldOfferDesktopApp({ ...mac, inDesktopApp: true })).toBe(false);
  });

  it("se tait hors macOS — il n'y a pas de version à proposer", () => {
    expect(shouldOfferDesktopApp({ ...mac, isMac: false })).toBe(false);
  });

  it("se tait une fois écartée, et pour toujours", () => {
    expect(shouldOfferDesktopApp({ ...mac, dismissed: true })).toBe(false);
  });
});
