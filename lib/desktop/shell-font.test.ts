import { describe, expect, it } from "vitest";

import {
  desktopShellFontDataUrlFromBytes,
  desktopShellFontPath,
} from "./shell-font";

describe("desktop shell font", () => {
  it("resolves the packaged font from the application resources", () => {
    expect(
      desktopShellFontPath({
        isPackaged: true,
        resourcesPath: "/Applications/minddy/Resources",
        sourceDirectory: "/ignored/desktop/src",
      }),
    ).toBe("/Applications/minddy/Resources/fonts/inter-latin.woff2");
  });

  it("resolves the development font from the repository application assets", () => {
    expect(
      desktopShellFontPath({
        isPackaged: false,
        resourcesPath: "/ignored/resources",
        sourceDirectory: "/repo/desktop/src",
      }),
    ).toBe("/repo/app/fonts/inter-latin.woff2");
  });

  it("encodes font bytes as a WOFF2 data URL", () => {
    expect(desktopShellFontDataUrlFromBytes(new Uint8Array([0, 1, 2]))).toBe(
      "data:font/woff2;base64,AAEC",
    );
  });
});
