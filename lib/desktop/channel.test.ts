import { afterEach, describe, expect, it, vi } from "vitest";

import { DESKTOP_PREVIEW_ORIGIN, DESKTOP_STABLE_ORIGIN } from "@/lib/desktop/config";
import {
  desktopChannelForOrigin,
  desktopOriginForChannel,
  parseDesktopChannel,
} from "@/lib/desktop/channel";

describe("parseDesktopChannel", () => {
  it("recognizes the only channel that is not the default", () => {
    expect(parseDesktopChannel("preview")).toBe("preview");
    expect(parseDesktopChannel("stable")).toBe("stable");
  });

  // What matters here is not the validation, it is the MEANING of the withdrawal: a
  // fichier illisible doit ramener quelqu'un en production, jamais l'y bloquer
  // ailleurs.
  it("falls back to stable for everything else", () => {
    for (const raw of [undefined, null, "", "PREVIEW", "beta", 1, {}, []]) {
      expect(parseDesktopChannel(raw)).toBe("stable");
    }
  });
});

describe("desktopOriginForChannel", () => {
  it("donne la production au stable et la preview au preview", () => {
    expect(desktopOriginForChannel("stable")).toBe(DESKTOP_STABLE_ORIGIN);
    expect(desktopOriginForChannel("preview")).toBe(DESKTOP_PREVIEW_ORIGIN);
  });

  it("laisse l'origine de dév gagner sur le canal", async () => {
    vi.stubEnv("MINDDY_DESKTOP_ORIGIN", "http://localhost:3000");
    vi.resetModules();
    const { desktopOriginForChannel: withOverride } = await import("@/lib/desktop/channel");
    expect(withOverride("preview")).toBe("http://localhost:3000");
    expect(withOverride("stable")).toBe("http://localhost:3000");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

describe("desktopChannelForOrigin", () => {
  it("reads the channel from the page origin", () => {
    expect(desktopChannelForOrigin(DESKTOP_STABLE_ORIGIN)).toBe("stable");
    expect(desktopChannelForOrigin(DESKTOP_PREVIEW_ORIGIN)).toBe("preview");
  });

  // `null` is what removes the switch from the dev settings screen.
  it("rend null hors des deux canaux", () => {
    expect(desktopChannelForOrigin("http://localhost:3000")).toBeNull();
    expect(desktopChannelForOrigin("https://minddy.app")).toBeNull();
    expect(desktopChannelForOrigin("")).toBeNull();
  });
});
