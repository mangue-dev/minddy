import { describe, expect, it } from "vitest";
import { buildThemeScript } from "./theme-script";

/**
 * The anti-FOUC script runs BEFORE React exists: a regression is only visible
 * as a flash of the wrong theme. So the test EXECUTES the generated body
 * against a stub DOM, and asserts the resolution order end to end:
 * account theme > device cache (localStorage) > server default.
 */

interface ScriptEnv {
  storedTheme: string | null;
  /** Whether `prefers-color-scheme` resolves to dark in this fake OS. */
  osPrefersDark: boolean;
  localStorageThrows?: boolean;
}

interface RunResult {
  htmlHasDarkClass: boolean;
  themeColor: string | null;
  /** What the script mirrored back into localStorage, if anything. */
  storedAfter: string | null;
}

function run(scriptBody: string, env: ScriptEnv): RunResult {
  const classes = new Set<string>();
  let themeColor: string | null = null;
  const metaTag = {
    setAttribute(name: string, value: string) {
      if (name === "content") themeColor = value;
    },
  };
  const storage = new Map<string, string>();
  if (env.storedTheme !== null) storage.set("mangue-ui-theme", env.storedTheme);

  const sandbox: Record<string, unknown> = {
    document: {
      documentElement: {
        classList: {
          toggle: (name: string, force: boolean) => {
            if (force) classes.add(name);
            else classes.delete(name);
          },
          contains: (name: string) => classes.has(name),
        },
      },
      querySelector: () => null,
      createElement: () => metaTag,
      head: { appendChild: () => {} },
    },
    matchMedia: () => ({ matches: env.osPrefersDark }),
    MutationObserver: class {
      observe() {}
    },
    localStorage: env.localStorageThrows
      ? {
          getItem() {
            throw new Error("SecurityError");
          },
          setItem() {
            throw new Error("SecurityError");
          },
        }
      : {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => void storage.set(key, value),
        },
  };

  const keys = Object.keys(sandbox);
  const values = Object.values(sandbox);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- under test: the exact string shipped to <head>
  new Function(...keys, `"use strict";${scriptBody}`)(...values);

  return {
    htmlHasDarkClass: classes.has("dark"),
    themeColor,
    storedAfter: storage.get("mangue-ui-theme") ?? null,
  };
}

describe("buildThemeScript — resolution order", () => {
  it("applies the ACCOUNT theme over a stale device cache", () => {
    // Device A cached "dark"; the account has since chosen light elsewhere.
    const run1 = run(buildThemeScript({ defaultTheme: "dark", accountTheme: "light" }), {
      storedTheme: "dark",
      osPrefersDark: true,
    });
    expect(run1.htmlHasDarkClass).toBe(false);
    expect(run1.themeColor).toBe("#f5f7fb");
  });

  it("mirrors the account theme back into localStorage", () => {
    // Without this, mango-ui's provider reads the stale cache on mount and
    // flips <html> back right after hydration — a flash of the wrong theme.
    const result = run(
      buildThemeScript({ defaultTheme: "dark", accountTheme: "light" }),
      { storedTheme: "dark", osPrefersDark: true },
    );
    expect(result.storedAfter).toBe("light");
  });

  it("keeps an explicit dark account theme even on a light OS", () => {
    const result = run(
      buildThemeScript({ defaultTheme: "system", accountTheme: "dark" }),
      { storedTheme: null, osPrefersDark: false },
    );
    expect(result.htmlHasDarkClass).toBe(true);
    expect(result.themeColor).toBe("#070809");
  });

  it("follows the system preference for a 'system' account theme", () => {
    const darkOs = run(
      buildThemeScript({ defaultTheme: "dark", accountTheme: "system" }),
      { storedTheme: "light", osPrefersDark: true },
    );
    expect(darkOs.htmlHasDarkClass).toBe(true);
    const lightOs = run(
      buildThemeScript({ defaultTheme: "dark", accountTheme: "system" }),
      { storedTheme: "light", osPrefersDark: false },
    );
    expect(lightOs.htmlHasDarkClass).toBe(false);
  });
});

describe("buildThemeScript — anonymous visitors (no account theme)", () => {
  it("reads the device cache first, then falls back to the server default", () => {
    const cached = run(buildThemeScript({ defaultTheme: "dark" }), {
      storedTheme: "light",
      osPrefersDark: true,
    });
    expect(cached.htmlHasDarkClass).toBe(false);
    // And it does NOT rewrite the visitor's cache.
    expect(cached.storedAfter).toBe("light");

    const fallback = run(buildThemeScript({ defaultTheme: "dark" }), {
      storedTheme: null,
      osPrefersDark: false,
    });
    expect(fallback.htmlHasDarkClass).toBe(true);

    // Public pages follow the OS when nothing is stored (MIN-60).
    const publicFallback = run(buildThemeScript({ defaultTheme: "system" }), {
      storedTheme: null,
      osPrefersDark: false,
    });
    expect(publicFallback.htmlHasDarkClass).toBe(false);
  });

  it("falls back safely when localStorage itself is unreadable", () => {
    // The catch branch must resolve the DEFAULT, not hardcode dark: a signed-in
    // user with a light account would otherwise flash dark on every load.
    const lightDefault = run(
      buildThemeScript({ defaultTheme: "light", accountTheme: "light" }),
      { storedTheme: null, osPrefersDark: true, localStorageThrows: true },
    );
    expect(lightDefault.htmlHasDarkClass).toBe(false);

    const systemDefault = run(buildThemeScript({ defaultTheme: "system" }), {
      storedTheme: null,
      osPrefersDark: true,
      localStorageThrows: true,
    });
    expect(systemDefault.htmlHasDarkClass).toBe(true);
  });
});
