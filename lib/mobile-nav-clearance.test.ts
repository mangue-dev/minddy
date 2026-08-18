import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Clearing the mobile navbar is a contract between TWO
 * packages. mango-ui sets the geometry — the height of the floating pill and the
 * reserve that the AppShell leaves under the content — and `app/globals.css` the
 * recalculates to realign this reserve on what the pill really occupies
 * (`--mobile-nav-clearance`), instead of the third too much that it occupies reserved.
 *
 * Nothing connects the two at execution: they are copied numbers. A bump
 * of mango-ui which changes the height pill, or which abandons its reserve, does not
 * break ANYTHING visible - the anchored field screens (composed of a pull
 * request, that of an agent session) are content to rest in the wrong
 * place, a few tens of pixels too high or over the bar. This is
 * exactly the kind of drift that you don't see from a dev workstation, where the
 * moving bar does not exist.
 *
 * Hence this test: it rereads the two sources and fails the second they no longer say the same thing. The instruction is then to UPDATE globals.css
 * according to mangue-ui, not to relax the test.
 */

const REPO = process.cwd();
const APP_SHELL = join(REPO, "node_modules/mangue-ui/src/components/shell/app-shell.tsx");
const MOBILE_NAV = join(REPO, "node_modules/mangue-ui/src/components/shell/mobile-nav.tsx");
const GLOBALS = join(REPO, "app/globals.css");

const read = (path: string) => readFileSync(path, "utf8");

describe("mobile navigation bar clearance", () => {
  it("mangue-ui always reserves a fixed height below the content under `desktop`", () => {
    // The rule in globals.css only makes sense because there is something to it
    // correct: a low padding set by the AppShell, and only on mobile.
    expect(read(APP_SHELL)).toContain(
      "max-desktop:pb-[calc(6rem+env(safe-area-inset-bottom))]",
    );
  });

  it("la pilule mesure toujours 3rem de boutons + son ancrage bas", () => {
    const nav = read(MOBILE_NAV);
    // Bottom anchoring of the bar…
    expect(nav).toContain("pb-[max(1rem,env(safe-area-inset-bottom))]");
    // …and height of a pill button (MobileNavItem).
    expect(nav).toMatch(/inline-flex h-12 w-12 items-center/);
  });

  it("globals.css reproduces this geometry exactly", () => {
    const css = read(GLOBALS);
    expect(css).toContain(
      "--mobile-nav-height: calc(3rem + max(1rem, env(safe-area-inset-bottom)));",
    );
    expect(css).toContain(
      "--mobile-nav-clearance: calc(var(--mobile-nav-height) + 0.75rem);",
    );
    // The AppShell reserve is indeed the one that is overwritten, on the <main> of
    // shell and under the same breakpoint (768px = --breakpoint-desktop).
    expect(css).toMatch(
      /@media \(width < 768px\) \{\s*\.app-shell main \{\s*padding-bottom: var\(--mobile-nav-clearance\);/,
    );
  });

  it("l'application redéfinit `desktop` à 768 px", () => {
    expect(read(GLOBALS)).toMatch(
      /@theme \{\s*--breakpoint-desktop: 768px;/,
    );
  });

  it("forces desktop chrome between 768 and 1200 px even when the dependency is cached", () => {
    const css = read(GLOBALS);
    expect(css).toContain("@media (768px <= width < 1200px)");
    expect(css).toContain(".app-shell .desktop\\:flex");
    expect(css).toContain(".app-shell .desktop\\:hidden");
  });

  it("the shell carries the class targeted by the rule", () => {
    expect(read(join(REPO, "components/app-shell-chrome.tsx"))).toContain(
      'className="app-shell"',
    );
  });
});
