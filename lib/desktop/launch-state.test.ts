import { describe, expect, it } from "vitest";

import { desktopLaunchFlag, parseDesktopLaunchState, type DesktopLaunchState } from "./launch-state";
import { notificationCapabilitiesForPlatform } from "./notification-capabilities";
import { desktopWindowMaterial } from "./window-material";

const state: DesktopLaunchState = {
  version: "0.31.0",
  integratedWindowChrome: true,
  notificationCapabilities: notificationCapabilitiesForPlatform("win32", true, false, true),
  windowMaterial: desktopWindowMaterial("win32", "10.0.22631", { enabled: true, reducedTransparency: true }),
};

describe("desktop launch state", () => {
  it("round-trips through the renderer command line among other switches", () => {
    expect(parseDesktopLaunchState(["--type=renderer", desktopLaunchFlag(state), "--other"])).toEqual(state);
  });

  it("falls back to the most limited value of each malformed or missing field", () => {
    const limited = {
      version: "",
      integratedWindowChrome: false,
      notificationCapabilities: notificationCapabilitiesForPlatform("aix", false),
      windowMaterial: null,
    };
    expect(parseDesktopLaunchState([])).toEqual(limited);
    expect(parseDesktopLaunchState(["--minddy-launch=%7Bnot-json"])).toEqual(limited);
    const forged = encodeURIComponent(
      JSON.stringify({
        version: 31,
        integratedWindowChrome: "yes",
        notificationCapabilities: { ...state.notificationCapabilities, backgroundTransport: "fcm" },
        windowMaterial: { kind: "mica" },
      }),
    );
    expect(parseDesktopLaunchState([`--minddy-launch=${forged}`])).toEqual(limited);
  });
});
