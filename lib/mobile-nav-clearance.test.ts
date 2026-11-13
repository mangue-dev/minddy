import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** The shell's reserved space must match the fixed mobile navigation geometry. */

const REPO = process.cwd();
const APP_SHELL = join(REPO, "components/app-shell.tsx");
const MOBILE_NAV = join(REPO, "components/mobile-navigation.tsx");
const GLOBALS = join(REPO, "app/globals.css");

const read = (path: string) => readFileSync(path, "utf8");

describe("mobile navigation bar clearance", () => {
  it("the AppShell keeps no reserve below <main>: content scrolls under the bar", () => {
    expect(read(APP_SHELL)).not.toContain("max-desktop:pb-");
  });

  it("reserves three rem for buttons plus the safe bottom anchor", () => {
    const nav = read(MOBILE_NAV);
    // Bottom anchoring of the bar…
    expect(nav).toContain("pb-[max(1rem,env(safe-area-inset-bottom))]");
    // …and height of the fixed navigation bar.
    expect(nav).toContain("grid h-12");
  });

  it("globals.css reproduces this geometry exactly", () => {
    const css = read(GLOBALS);
    expect(css).toContain(
      "--mobile-nav-height: calc(3rem + max(1rem, env(safe-area-inset-bottom)));",
    );
    expect(css).toContain(
      "--mobile-nav-clearance: calc(var(--mobile-nav-height) + 0.75rem);",
    );
    // Each full-height column scrolling in the shell's <main> ends with the
    // bar's room, and a composer docked under one sits above the bar instead.
    expect(css).toMatch(
      /\.app-shell main :is\(\.overflow-y-auto, \.overflow-auto\):is\(\.flex-1, \.h-full\)::after \{[^}]*height: var\(--mobile-nav-clearance\);/,
    );
    expect(css).toMatch(
      /\.app-shell main :is\(\.dock-above-nav, \[data-keyboard-dock\]\) \{\s*margin-bottom: var\(--mobile-nav-clearance\);/,
    );
  });

  it("keeps a 1024px width fallback for dependency chrome", () => {
    expect(read(GLOBALS)).toMatch(
      /@theme \{\s*--breakpoint-desktop: 1024px;/,
    );
  });

  it("synchronizes cached dependency chrome with the runtime layout", () => {
    const css = read(GLOBALS);
    expect(css).toContain(':root[data-app-layout="desktop"]');
    expect(css).toContain(':root[data-app-layout="mobile"]');
    expect(css).toContain(".app-shell .desktop\\:flex");
    expect(css).toContain(".app-shell .desktop\\:hidden");
  });

  it("the shell carries the class targeted by the rule", () => {
    expect(read(join(REPO, "components/app-shell-chrome.tsx"))).toContain(
      'className="app-shell"',
    );
  });
});
