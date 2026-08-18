import { describe, expect, it } from "vitest";
import { desktopUserAgentSuffix, withDesktopUserAgent } from "./config";

/** Electron's default user agent, noted in a real window (MIN-291):
 * it ALREADY has `<nom de l'app>/<version>`, in the middle, before `Chrome/…`. */
const ELECTRON_DEFAULT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) minddy-desktop/0.1.0 Chrome/150.0.7871.224 Electron/43.4.0 Safari/537.36";

describe("withDesktopUserAgent", () => {
  it("ne redouble pas ce qu'Electron a déjà posé", () => {
    const ua = withDesktopUserAgent(ELECTRON_DEFAULT, "0.1.0");
    expect(ua).toBe(ELECTRON_DEFAULT);
    expect(ua.match(/minddy-desktop\//g)).toHaveLength(1);
  });

  it("l'ajoute quand il n'y est pas", () => {
    const bare = "Mozilla/5.0 (Macintosh) Chrome/150.0 Safari/537.36";
    expect(withDesktopUserAgent(bare, "1.2.3")).toBe(
      `${bare} minddy-desktop/1.2.3`
    );
  });

  it("distingue les versions — un suffixe d'une autre version n'en tient pas lieu", () => {
    expect(withDesktopUserAgent(ELECTRON_DEFAULT, "0.2.0")).toBe(
      `${ELECTRON_DEFAULT} minddy-desktop/0.2.0`
    );
  });

  it("nomme l'app, pas le moteur", () => {
    expect(desktopUserAgentSuffix("9.9.9")).toBe("minddy-desktop/9.9.9");
  });
});
