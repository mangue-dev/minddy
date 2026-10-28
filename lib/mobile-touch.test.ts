import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { THEME_PRESETS } from "./theme-presets";

/**
 * MIN-284 — finger comfort, checked where it lives.
 *
 * The primitives of `components/ui/` carry their own touch behavior under a
 * coarse pointer (components/ui/touch-target.ts): 44 px targets, press
 * feedback, no tap delay. `app/globals.css` keeps what is page-wide: the safe
 * areas revealed by the root layout's `viewport-fit=cover`, the tap highlight
 * and the zoom-on-focus guard of hand-written fields.
 *
 * None of this is visible from a development workstation: a renamed
 * `data-slot`, a lost class or a changed size breaks nothing with a mouse, and
 * the app becomes difficult to use on a phone. This test rereads the sources
 * and fails the second they stop saying the same thing. The instruction is then
 * to UPDATE the code to keep the behavior, not to relax the test.
 */

const REPO = process.cwd();
const UI = (name: string) => join(REPO, `components/ui/${name}.tsx`);
const GLOBALS = join(REPO, "app/globals.css");
const TOKENS = join(REPO, "app/tokens.css");
const TOUCH = join(REPO, "components/ui/touch-target.ts");
const LAYOUT = join(REPO, "app/layout.tsx");

const read = (path: string) => readFileSync(path, "utf8");

describe("safe areas", () => {
  it("renders the page full bleed from the root layout", () => {
    const layout = read(LAYOUT);
    // Without `cover`, the window is confined to the safe area and all seven
    // `env(safe-area-inset-*)` values in the repository are 0. This line enables
    // all the safe-area work already written.
    expect(layout).toContain("export const viewport: Viewport");
    expect(layout).toContain('viewportFit: "cover"');
    // And the software keyboard shrinks the LAYOUT viewport, otherwise the
    // anchored composers (pull request, agent session) go behind it.
    expect(layout).toContain('interactiveWidget: "resizes-content"');
  });

  it("does not restrict zoom in the root layout", () => {
    // A `maximumScale` or `userScalable: false` slipped here would be a
    // accessibility flaw, and no MIN-284 patch needs it.
    // We are looking for the KEY, not the mention in this comment that explains
    // why it is intentionally absent.
    const layout = read(LAYOUT);
    expect(layout).not.toContain("maximumScale:");
    expect(layout).not.toContain("userScalable:");
  });

  it("caps centered dialogs above the notch and the home indicator", () => {
    // A tall box that reaches its ceiling must not end under the home
    // indicator once 100dvh extends under it: both insets come off the cap, and
    // the box stays centered (the `translate` is untouched).
    for (const file of ["dialog", "alert-dialog"]) {
      expect(read(UI(file))).toContain(
        "max-h-[calc(100dvh_-_2rem_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))]",
      );
    }
  });

  it("keeps announcing which edge a sheet is attached to", () => {
    // `data-side` is the only way to know WHICH edge a drawer is attached to,
    // and therefore which inset to apply.
    expect(read(UI("sheet"))).toContain("data-side={side}");
    const css = read(GLOBALS);
    expect(css).toContain('[data-slot="sheet-content"][data-side="bottom"]');
    expect(css).toContain('[data-slot="sheet-content"][data-side="top"]');
  });

  it("clears the notch and the landscape edges around the shell", () => {
    expect(read(GLOBALS)).toMatch(
      /\.app-shell \{\s*padding-top: env\(safe-area-inset-top\);/,
    );
  });
});

describe("touch targets", () => {
  it("keeps every button size under 44 px, so the hit area is still needed", () => {
    const button = read(UI("button"));
    // The six sizes of `buttonVariants`, in Tailwind units (1 = 0.25rem = 4px).
    // The day one of them reaches 11 (44px), the extended target becomes
    // unnecessary for that size: it is time to revisit the rule, not keep it
    // out of habit.
    const heights = [
      /default:\s*\n?\s*"h-9 /, // 36
      /sm: "h-8 /, // 32
      /lg: "h-10 /, // 40
      /icon: "size-9 p-0"/, // 36
      /"icon-sm": "size-8 p-0"/, // 32
      /"icon-lg": "size-10 p-0"/, // 40
    ];
    for (const height of heights) expect(button).toMatch(height);
  });

  it("keeps the attributes the button's touch classes are keyed on", () => {
    const button = read(UI("button"));
    expect(button).toContain('data-slot="button"');
    // `data-variant` carries the exclusion for inline links, whose target would
    // otherwise overflow into the paragraph.
    expect(button).toContain("data-variant={variant}");
    expect(button).toContain("link:");
  });

  it("grows the button target without moving its drawing", () => {
    const touch = read(TOUCH);
    // `max()` does the sorting: values above 44 keep their size, and the rest
    // grow to it. No height is hard-coded, so a primitive size change needs no
    // adjustment — only the test above will notice it.
    expect(touch).toMatch(/COARSE_BUTTON_HIT_AREA =\s*"[^"]*not-data-\[variant=link\]:pointer-coarse:after:w-\[max\(100%,44px\)\]/);
    expect(touch).toContain("not-data-[variant=link]:pointer-coarse:after:h-[max(100%,44px)]");
    expect(read(UI("button"))).toMatch(/`\$\{COARSE_BUTTON_TOUCH_ACTION\} \$\{COARSE_BUTTON_HIT_AREA\} \$\{COARSE_BUTTON_PRESS\}/);
    // The button keeps the positioning supplied by its utilities: `relative` is
    // deliberately set in `@layer base`, so a Tailwind `absolute` can win — also
    // under a coarse pointer.
    const tokens = read(TOKENS);
    expect(tokens).toMatch(/@layer base \{[\s\S]*?\[data-slot="button"\] \{\s*position: relative;/);
    expect(tokens).not.toMatch(/@media \(pointer: coarse\) \{\s*\[data-slot="button"\]/);
  });

  it("keeps the geometry the isolated controls' targets are computed on", () => {
    // The checkbox REUSES its own pseudo-element: on a 16 px square, a -14 px
    // inset gives 16 + 2×14 = 44. If its base size changes, the inset no longer
    // produces 44 px.
    const checkbox = read(UI("checkbox"));
    expect(checkbox).toContain('data-slot="checkbox"');
    expect(checkbox).toMatch(/size-4 .*after:absolute after:-inset-x-3 after:-inset-y-2 pointer-coarse:after:-inset-\[14px\]/);

    // The slider thumb and the switch carry no `::after` of their own, so the
    // centered hit area is the only one.
    const slider = read(UI("slider"));
    expect(slider).toContain('data-slot="slider-thumb"');
    expect(slider).toMatch(/className=\{`relative block h-4 w-0 [^`]*\$\{COARSE_HIT_AREA\}/);
    const switchUi = read(UI("switch"));
    expect(switchUi).toContain('data-slot="switch"');
    expect(switchUi).toMatch(/h-5 w-\[34px\]/);
    expect(switchUi).toContain("${COARSE_HIT_AREA}");
    expect(switchUi.replace(/\$\{COARSE_HIT_AREA\}/g, "")).not.toContain("after:");
    expect(read(TOUCH)).toMatch(/COARSE_HIT_AREA =\s*"[^"]*pointer-coarse:after:w-\[max\(100%,44px\)\]/);
  });

  it("grows the tab target through `::before`, never `::after`", () => {
    // The active-tab indicator is drawn by an `after:` utility, so we do not put
    // ours in the same place.
    //
    // This trait MOVED: it is no longer on the
    // trigger but on an indicator that slides from one tab to another
    // (`data-slot="tabs-indicator"`, the `line` variant that minddy uses
    // everywhere). The trigger's `::after` is therefore free today. **We keep
    // `::before` anyway**: it costs nothing and keeps us resilient if the
    // indicator ever moves back.
    const tabs = read(UI("tabs"));
    expect(tabs).toContain('data-slot="tabs-indicator"');
    expect(tabs).toMatch(/after:absolute .*after:bg-foreground/);
    expect(tabs).toContain("pointer-coarse:before:absolute pointer-coarse:before:inset-y-1/2 pointer-coarse:before:inset-x-0 pointer-coarse:before:-my-[22px]");
  });

  it("grows list rows for real", () => {
    // A row cannot overflow onto its neighbor without expanding the actual
    // row: that is the only place where we change its real height.
    expect(read(TOUCH)).toContain('COARSE_ROW = "pointer-coarse:min-h-11 '); // 11 × 4 = 44 px
    const rows: Record<string, number> = { "dropdown-menu": 4, select: 1, command: 1 };
    for (const [file, count] of Object.entries(rows)) {
      expect(read(UI(file)).split("max-[1199px]:min-h-10 ${COARSE_ROW}").length - 1).toBe(count);
    }
  });

  it("keeps dropdown options compact in desktop layout", () => {
    // The rows keep their touch height until 1200 px; in the desktop layout
    // (a touch-capable wide screen included) their padding stays dense, even
    // over a call site's own padding.
    const menu = read(UI("dropdown-menu"));
    expect(menu).toContain("max-[1199px]:min-h-10");
    expect(menu.split("${COARSE_ROW} app-desktop:py-1.5!").length - 1).toBe(4);
  });
});

describe("touch feedback", () => {
  it("presses the button down, and only under a finger", () => {
    // Under `pointer: coarse` only, so the mouse experience is unchanged, and
    // never when the user requests reduced motion (`motion-safe`).
    expect(read(TOUCH)).toContain(
      '"data-[slot=button]:not-data-[variant=link]:pointer-coarse:motion-safe:not-disabled:not-aria-disabled:active:[scale:0.97]"',
    );
  });

  it("lets the button animate that press", () => {
    // `transition-all` comes from the primitive: without it, the `scale` would jump
    // instead of animating. Nothing in globals.css would provide that transition.
    expect(read(UI("button"))).toContain("transition-all");
  });

  it("turns off the browser's gray tap highlight", () => {
    // The browser highlight appears late and exceeds the border radius — it is
    // unnecessary now that a press has its own feedback.
    expect(read(GLOBALS)).toContain("-webkit-tap-highlight-color: transparent;");
  });

  it("lifts the double-tap delay on what gets tapped", () => {
    // …and ONLY there: the double-tap-to-zoom must remain available on
    // the content (a capture, a table, a block of code).
    expect(read(TOUCH)).toContain('COARSE_TOUCH_ACTION = "pointer-coarse:touch-manipulation"');
    for (const file of ["switch", "checkbox", "tabs", "select", "dropdown-menu", "command", "button"]) {
      expect(read(UI(file))).toMatch(/touch-manipulation|COARSE_(ROW|TOUCH_ACTION|BUTTON_TOUCH_ACTION)/);
    }
    expect(read(GLOBALS)).not.toMatch(/^(html|body)[^{]*\{[^}]*touch-action/m);
  });

  it("leaves the primitives' touch behavior to the primitives", () => {
    // globals.css must not patch these slots from the outside again: change
    // the component instead.
    const css = read(GLOBALS).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const slot of ["button", "checkbox", "switch", "switch-thumb", "slider-thumb", "tabs-trigger", "select-item", "command-item", "dropdown-menu-item"]) {
      expect(css).not.toContain(`[data-slot="${slot}"]`);
    }
  });
});

describe("other touch pitfalls", () => {
  it("keeps every field at 16 px or more under a finger", () => {
    // Under 16 px, iOS zooms into a field and does not zoom back out when focus
    // ends. The primitives handle this for their fields; the rule covers fields in the
    // handwritten product and any future ones.
    expect(read(UI("input"))).toContain("text-base");
    expect(read(UI("input"))).toContain("md:text-sm");
    const css = read(GLOBALS);
    expect(css).toMatch(/textarea:not\(\.title-field\),\s*select \{\s*font-size: 16px;/);
    // Anything that has no text to enter stays out.
    for (const type of ["checkbox", "radio", "range", "submit"]) {
      expect(css).toContain(`[type="${type}"]`);
    }
  });

  it("leaves title fields out of the floor only because they are larger", () => {
    // The floor would shrink a title (a page title read 16 px on a phone):
    // every `title-field` must carry a size of 18 px (`text-lg`) or more.
    const files = execSync("git grep -l 'title-field' -- components", { encoding: "utf8" })
      .split("\n").filter(Boolean);
    for (const file of files) {
      for (const match of read(file).matchAll(/className="([^"]*\btitle-field\b[^"]*)"/g)) {
        // `text-lg` and up, or an arbitrary rem size from 1.125rem (18 px).
        expect(match[1], file).toMatch(/\btext-(lg|xl|[2-9]xl|\[(1\.(1[2-9]|[2-9])\d*|[2-9](\.\d+)?)rem\])(?![\w-])/);
      }
    }
  });

  it("disables app viewport bounce without changing public page scrolling", () => {
    const css = read(GLOBALS);
    // Scope the viewport policy to the app, including its portaled surfaces.
    expect(css).toMatch(
      /html\[data-app-shell\] \{\s*--app-overscroll: none;\s*overscroll-behavior: none;/,
    );
    expect(css).not.toMatch(/^(html|body)\s*\{[^}]*overscroll-behavior/m);
  });

  it("keeps Tailwind's `hover:` variants away from touch", () => {
    // This eliminates the need to override hundreds of `hover:` utilities in
    // the app one by one — only handwritten `:hover` rules remain to be covered.
    // If a Tailwind update regressed, hover would remain stuck after every tap,
    // everywhere.
    // We aim for the DEFINITION of the variant in the bundle, not a string of the
    // compiled sheet: `i.static("hover", …)` wraps `&:hover` in
    // `@media (hover: hover)`. That wrapper exempts us from overriding hundreds
    // of `hover:` utilities in the repository one by one.
    const tw = readFileSync(
      join(REPO, "node_modules/tailwindcss/dist/lib.js"),
      "utf8",
    );
    expect(tw).toContain('H("&:hover",[B("@media","(hover: hover)"');
  });

  it("neutralizes hand-written `:hover` rules under a finger", () => {
    const css = read(GLOBALS);
    // Every `:hover` rule in this file that paints something must have a
    // counterpart under `@media (hover: none)`, or it remains stuck after a tap.
    expect(css).toContain("@media (hover: none)");
    for (const selector of [
      ".page-editor .page-details-toggle:hover",
      ".page-block-comment-badge:hover",
      ".scratchpad-editor .ProseMirror .scratchpad-section-copy:hover",
    ]) {
      // Twice: the original rule, and its neutralization.
      expect(css.split(selector).length - 1).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps the status bar on the actual theme, with colors that follow the tokens", () => {
    // The BODY of the pre-paint script lives in lib/theme-script.ts (pure
    // module); the component only injects it.
    const script = read(join(REPO, "lib/theme-script.ts"));
    expect(script).toContain('name","theme-color"');
    // The observer keeps the tag current when we switch themes or palettes.
    expect(script).toContain("MutationObserver");

    // The Minddy defaults are a manual CONVERSION of the design tokens,
    // which `theme-color` cannot read through `var()`. If a token changes,
    // these must be recalculated — this test prevents discovering that on a
    // phone. The other palettes' chrome colors are checked against
    // app/theme-presets.css by lib/theme-presets.test.ts.
    const tokens = read(join(REPO, "app/tokens.css"));
    expect(tokens).toContain("--background: oklch(0.975 0.006 266);"); // light
    expect(tokens).toContain("--background: oklch(0.135 0.003 250);"); // dark
    expect(THEME_PRESETS["minddy-light"].chromeColor).toBe("#f5f7fb");
    expect(THEME_PRESETS["minddy-dark"].chromeColor).toBe("#070809");
  });
});
