import { describe, expect, it } from "vitest";
import {
  DESKTOP_PROMPT_DISMISSED_META_KEY,
  isAndroidPlatform,
  isIosPlatform,
  isLinuxPlatform,
  isMacPlatform,
  isWindowsPlatform,
  resolveInstallPlatform,
  resolveDesktopPromptDismissed,
  shouldOfferDesktopApp,
  WINDOWS_STORE_DEEP_LINK,
} from "./install-prompt";

describe("resolveDesktopPromptDismissed", () => {
  it("is false by default — nothing has been dismissed until stated otherwise", () => {
    expect(resolveDesktopPromptDismissed(undefined)).toBe(false);
    expect(resolveDesktopPromptDismissed(null)).toBe(false);
    expect(resolveDesktopPromptDismissed({})).toBe(false);
  });

  it("accepts only the boolean true", () => {
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

  it("does not infer a platform from an empty probe", () => {
    expect(isMacPlatform({})).toBe(false);
  });
});

describe("isLinuxPlatform", () => {
  it("recognizes Linux from user-agent client hints", () => {
    expect(isLinuxPlatform({ uaDataPlatform: "Linux" })).toBe(true);
    expect(isLinuxPlatform({ uaDataPlatform: "Windows" })).toBe(false);
  });

  it("falls back to navigator.platform and the user agent", () => {
    expect(isLinuxPlatform({ platform: "Linux x86_64" })).toBe(true);
    expect(isLinuxPlatform({ userAgent: "Mozilla/5.0 (X11; Linux x86_64)" })).toBe(true);
    expect(isLinuxPlatform({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" })).toBe(false);
  });
});

describe("isWindowsPlatform", () => {
  it("recognizes Windows from user-agent client hints", () => {
    expect(isWindowsPlatform({ uaDataPlatform: "Windows" })).toBe(true);
    expect(isWindowsPlatform({ uaDataPlatform: "macOS" })).toBe(false);
  });

  it("falls back to navigator.platform and the user agent", () => {
    expect(isWindowsPlatform({ platform: "Win32" })).toBe(true);
    expect(isWindowsPlatform({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" })).toBe(true);
    expect(isWindowsPlatform({ userAgent: "Mozilla/5.0 (X11; Linux x86_64)" })).toBe(false);
  });
});

describe("mobile platforms", () => {
  it("recognizes iPhone and iPad without confusing desktop Macs", () => {
    expect(isIosPlatform({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" })).toBe(true);
    expect(isIosPlatform({ platform: "MacIntel", maxTouchPoints: 5 })).toBe(true);
    expect(isIosPlatform({ platform: "MacIntel", maxTouchPoints: 0 })).toBe(false);
  });

  it("recognizes Android without confusing desktop Linux", () => {
    expect(isAndroidPlatform({ uaDataPlatform: "Android" })).toBe(true);
    expect(isAndroidPlatform({ platform: "Linux armv8l", userAgent: "Mozilla/5.0 (Linux; Android 15)" })).toBe(true);
    expect(isAndroidPlatform({ platform: "Linux x86_64" })).toBe(false);
  });
});

describe("resolveInstallPlatform", () => {
  it.each([
    [{ uaDataPlatform: "macOS", maxTouchPoints: 0 }, "macos"],
    [{ uaDataPlatform: "Windows" }, "windows"],
    [{ uaDataPlatform: "Linux" }, "linux"],
    [{ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" }, "ios"],
    [{ platform: "Linux armv8l", userAgent: "Mozilla/5.0 (Linux; Android 15)" }, "android"],
    [{}, "unsupported"],
  ] as const)("resolves %o as %s", (probe, expected) => {
    expect(resolveInstallPlatform(probe)).toBe(expected);
  });

  it("keeps an iPad out of the macOS download path", () => {
    expect(
      resolveInstallPlatform({
        platform: "MacIntel",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        maxTouchPoints: 5,
      }),
    ).toBe("ios");
  });

  it("uses the immutable Microsoft Store product deep link", () => {
    expect(WINDOWS_STORE_DEEP_LINK).toBe("ms-windows-store://pdp/?ProductId=9P181CDLRFBC");
  });
});

describe("shouldOfferDesktopApp", () => {
  const mac = { inDesktopApp: false, isMac: true, dismissed: false };

  it("offers on a Mac in a browser to someone who has dismissed nothing", () => {
    expect(shouldOfferDesktopApp(mac)).toBe(true);
  });

  it("offers on Linux in a browser to someone who has dismissed nothing", () => {
    expect(shouldOfferDesktopApp({ ...mac, isMac: false, isLinux: true })).toBe(true);
  });

  it("stays silent inside the app itself", () => {
    expect(shouldOfferDesktopApp({ ...mac, inDesktopApp: true })).toBe(false);
  });

  it("stays silent on unsupported desktop platforms", () => {
    expect(shouldOfferDesktopApp({ ...mac, isMac: false, isLinux: false })).toBe(false);
  });

  it("stays silent once dismissed, forever", () => {
    expect(shouldOfferDesktopApp({ ...mac, dismissed: true })).toBe(false);
  });
});
