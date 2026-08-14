import { afterEach, describe, expect, it, vi } from "vitest";

import { DESKTOP_PREVIEW_ORIGIN, DESKTOP_STABLE_ORIGIN } from "@/lib/desktop/config";
import {
  desktopChannelForOrigin,
  desktopOriginForChannel,
  parseDesktopChannel,
} from "@/lib/desktop/channel";

describe("parseDesktopChannel", () => {
  it("reconnaît le seul canal qui ne soit pas le défaut", () => {
    expect(parseDesktopChannel("preview")).toBe("preview");
    expect(parseDesktopChannel("stable")).toBe("stable");
  });

  // Ce qui compte ici n'est pas la validation, c'est le SENS du repli : un
  // fichier illisible doit ramener quelqu'un en production, jamais l'y bloquer
  // ailleurs.
  it("retombe sur le stable pour tout le reste", () => {
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
  it("lit le canal sur l'origine de la page", () => {
    expect(desktopChannelForOrigin(DESKTOP_STABLE_ORIGIN)).toBe("stable");
    expect(desktopChannelForOrigin(DESKTOP_PREVIEW_ORIGIN)).toBe("preview");
  });

  // `null` est ce qui retire l'interrupteur de l'écran de réglages en dév.
  it("rend null hors des deux canaux", () => {
    expect(desktopChannelForOrigin("http://localhost:3000")).toBeNull();
    expect(desktopChannelForOrigin("https://minddy.app")).toBeNull();
    expect(desktopChannelForOrigin("")).toBeNull();
  });
});
