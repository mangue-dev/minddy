import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * MIN-284 — finger comfort is also a contract between two packages.
 *
 * mangue-ui lives in node_modules, so we do not patch it. `app/globals.css`
 * corrects it REMOTELY by targeting its `data-slot` attributes and geometry:
 * touch targets are enlarged to 44 px, press feedback is restored, and safe
 * areas are made visible by the root layout's `viewport-fit=cover` setting.
 *
 * Nothing connects the two at runtime. A mangue-ui update that renames a
 * `data-slot`, removes `data-side` from a drawer, or changes a dialog's maximum
 * height does not break anything visible from a development workstation. The
 * rules simply stop matching, and the app becomes difficult to use on a phone —
 * exactly the kind of regression no one sees with a mouse.
 *
 * This test rereads both sources and fails the second they no longer say
 * the same thing. As for `lib/mobile-nav-clearance.test.ts`, the instruction is
 * then to UPDATE globals.css to match mangue-ui, not to relax the test.
 */

const REPO = process.cwd();
const UI = (name: string) => join(REPO, `node_modules/mangue-ui/src/components/ui/${name}.tsx`);
const GLOBALS = join(REPO, "app/globals.css");
const LAYOUT = join(REPO, "app/layout.tsx");

const read = (path: string) => readFileSync(path, "utf8");

describe("zones de sécurité", () => {
  it("le root layout rend la page à fond perdu", () => {
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

  it("le root layout ne bride pas le zoom", () => {
    // A `maximumScale` or `userScalable: false` slipped here would be a
    // accessibility flaw, and no MIN-284 patch needs it.
    // We are looking for the KEY, not the mention in this comment that explains
    // why it is intentionally absent.
    const layout = read(LAYOUT);
    expect(layout).not.toContain("maximumScale:");
    expect(layout).not.toContain("userScalable:");
  });

  it("les boîtes de dialogue plafonnent toujours à la hauteur qu'on recalcule", () => {
    // globals.css recomputes this maximum by subtracting the insets. If mangue-ui
    // changes the formula, our rule will no longer correct the right value.
    for (const file of ["dialog", "alert-dialog"]) {
      expect(read(UI(file))).toContain("max-h-[calc(100dvh-2rem)]");
    }
    expect(read(GLOBALS)).toContain(
      "100dvh - 2rem - env(safe-area-inset-top) - env(safe-area-inset-bottom)",
    );
  });

  it("les tiroirs annoncent toujours leur bord", () => {
    // `data-side` is the only way to know WHICH edge a drawer is attached to,
    // and therefore which inset to apply.
    expect(read(UI("sheet"))).toContain("data-side={side}");
    const css = read(GLOBALS);
    expect(css).toContain('[data-slot="sheet-content"][data-side="bottom"]');
    expect(css).toContain('[data-slot="sheet-content"][data-side="top"]');
  });

  it("le shell dégage l'encoche et les bords en paysage", () => {
    expect(read(GLOBALS)).toMatch(
      /\.app-shell \{\s*padding-top: env\(safe-area-inset-top\);/,
    );
  });
});

describe("cibles de toucher", () => {
  it("aucune taille de bouton n'atteint 44 px — la règle a toujours lieu d'être", () => {
    const button = read(UI("button"));
    // The six sizes of `buttonVariants`, in Tailwind units (1 = 0.25rem = 4px).
    // The day one of them reaches 11 (44px), the extended target becomes
    // unnecessary for that size: it is time to revisit the rule, not keep it
    // out of habit.
    const heights = [
      /default:\s*\n?\s*"h-9 /, // 36
      /sm: "h-8 /, // 32
      /lg: "h-10 /, // 40
      /icon: "size-9"/, // 36
      /"icon-sm": "size-8"/, // 32
      /"icon-lg": "size-10"/, // 40
    ];
    for (const height of heights) expect(button).toMatch(height);
  });

  it("le bouton expose toujours les attributs que la règle vise", () => {
    const button = read(UI("button"));
    expect(button).toContain('data-slot="button"');
    // `data-variant` carries the exclusion for inline links, whose target would
    // otherwise overflow into the paragraph.
    expect(button).toContain("data-variant={variant}");
    expect(button).toContain("link:");
  });

  it("globals.css étend la cible sans toucher au dessin", () => {
    const css = read(GLOBALS);
    // `max()` does the sorting: values above 44 keep their size, and the rest
    // grow to it. No height is hard-coded, so a mangue-ui size change needs no
    // adjustment — only the test above will notice it.
    expect(css).toContain("width: max(100%, 44px)");
    expect(css).toContain("height: max(100%, 44px)");
    expect(css).toContain('[data-slot="button"]:not([data-variant="link"])::after');
    // The button keeps the positioning supplied by its utilities: `relative` is
    // deliberately set in `@layer base`, so a Tailwind `absolute` can win.
    expect(css).toMatch(/@layer base \{\s*\[data-slot="button"\] \{\s*position: relative;/);
  });

  it("les commandes isolées gardent la géométrie sur laquelle on a calculé", () => {
    // We REUSE mangue-ui's pseudo-element instead of adding a second one: if its
    // base size changes, our negative `inset` values will no longer produce 44 px.
    const checkbox = read(UI("checkbox"));
    expect(checkbox).toContain('data-slot="checkbox"');
    expect(checkbox).toMatch(/size-4 .*after:absolute after:-inset-x-3 after:-inset-y-2/);
    expect(read(GLOBALS)).toContain("inset: -14px; /* 16 + 2×14 = 44 */");

    const slider = read(UI("slider"));
    expect(slider).toContain('data-slot="slider-thumb"');
    expect(slider).toMatch(/size-3 .*after:absolute after:-inset-2/);
    expect(read(GLOBALS)).toContain("inset: -16px; /* 12 + 2×16 = 44 */");

    // The switch has no `::after` to reuse, so we add one. If mangue-ui ever adds
    // one too, the two would conflict.
    const switchUi = read(UI("switch"));
    expect(switchUi).toContain('data-slot="switch"');
    expect(switchUi).toMatch(/h-5 w-9 /);
    expect(switchUi).not.toContain("after:");
  });

  it("la cible de l'onglet passe par `::before`, jamais par `::after`", () => {
    // The active-tab indicator is drawn by an `after:` utility, so we do not put
    // ours in the same place.
    //
    // Since mangue-ui 0.6.0 this trait MOVED: it is no longer on the
    // trigger but on an indicator that slides from one tab to another
    // (`data-slot="tabs-indicator"`, the `line` variant that minddy uses
    // everywhere). The trigger's `::after` is therefore free today. **We keep
    // `::before` anyway**: it costs nothing and keeps us resilient if the
    // indicator ever moves back.
    const tabs = read(UI("tabs"));
    expect(tabs).toContain('data-slot="tabs-indicator"');
    expect(tabs).toMatch(/after:absolute .*after:bg-foreground/);
    expect(read(GLOBALS)).toContain('[data-slot="tabs-trigger"]::before');
  });

  it("les rangées de liste grandissent pour de vrai", () => {
    // A row cannot overflow onto its neighbor without expanding the actual
    // row: that is the only place where we change its real height.
    const css = read(GLOBALS);
    for (const slot of [
      "dropdown-menu-item",
      "dropdown-menu-checkbox-item",
      "dropdown-menu-radio-item",
      "dropdown-menu-sub-trigger",
      "select-item",
      "command-item",
    ]) {
      expect(css).toContain(`[data-slot="${slot}"]`);
      // The slot still exists on the mangue-ui side.
      const file = slot.startsWith("dropdown") ? "dropdown-menu" : slot.split("-")[0];
      expect(read(UI(file))).toContain(`data-slot="${slot}"`);
    }
    expect(css).toContain("min-height: 44px;");
  });

  it("les options de dropdown redeviennent compactes dès 768 px", () => {
    const css = read(GLOBALS);
    expect(css).toContain("@media (width >= 768px)");
    expect(css).toContain('[data-slot="dropdown-menu-item"]');
    expect(css).toContain("padding-block: 0.375rem !important;");
    // The dependency keeps its touch setting until 1200 px, so the override
    // above is necessary for the application's actual breakpoint.
    expect(read(UI("dropdown-menu"))).toContain("max-[1199px]:py-2.5");
  });
});

describe("retour au toucher", () => {
  it("l'appui enfonce le bouton, et seulement au doigt", () => {
    const css = read(GLOBALS);
    // The whole block lives under `pointer: coarse`, so the mouse experience is
    // unchanged. It also disappears when the user requests reduced motion.
    expect(css).toContain("@media (pointer: coarse)");
    expect(css).toContain("@media (prefers-reduced-motion: no-preference)");
    expect(css).toMatch(/\):active \{\s*scale: 0\.97;/);
  });

  it("le bouton sait déjà animer cet enfoncement", () => {
    // `transition-all` comes from mangue-ui: without it, the `scale` would jump
    // instead of animating. Nothing in globals.css would provide that transition.
    expect(read(UI("button"))).toContain("transition-all");
  });

  it("le halo gris du navigateur est éteint", () => {
    // The browser highlight appears late and exceeds the border radius — it is
    // unnecessary now that a press has its own feedback.
    expect(read(GLOBALS)).toContain("-webkit-tap-highlight-color: transparent;");
  });

  it("le délai du double-tap est levé sur ce qui se tape", () => {
    // …and ONLY there: the double-tap-to-zoom must remain available on
    // the content (a capture, a table, a block of code).
    const css = read(GLOBALS);
    expect(css).toContain("touch-action: manipulation;");
    expect(css).not.toMatch(/^(html|body)[^{]*\{[^}]*touch-action/m);
  });
});

describe("les autres pièges du tactile", () => {
  it("aucun champ ne descend sous 16 px au doigt", () => {
    // Under 16 px, iOS zooms into a field and does not zoom back out when focus
    // ends. mangue-ui handles this for its fields; the rule covers fields in the
    // handwritten product and any future ones.
    expect(read(UI("input"))).toContain("text-base");
    expect(read(UI("input"))).toContain("md:text-sm");
    const css = read(GLOBALS);
    expect(css).toMatch(/textarea,\s*select \{\s*font-size: 16px;/);
    // Anything that has no text to enter stays out.
    for (const type of ["checkbox", "radio", "range", "submit"]) {
      expect(css).toContain(`[type="${type}"]`);
    }
  });

  it("le défilement de l'app ne remonte pas jusqu'au tirer-pour-rafraîchir", () => {
    const css = read(GLOBALS);
    // `contain`, rather than `none`: we stop propagation while preserving the
    // browser's bounce effect.
    expect(css).toMatch(
      /\.app-shell main \{\s*overscroll-behavior: contain;/,
    );
    // And not on `html, body`: on the landing and the public board, the
    // pull-to-refresh is the expected behavior of the browser.
    expect(css).not.toMatch(/^(html|body)[^{]*\{[^}]*overscroll-behavior/m);
  });

  it("Tailwind protège toujours ses `hover:` du tactile", () => {
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

  it("les `:hover` écrits à la main sont neutralisés au doigt", () => {
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

  it("la barre d'état suit le thème réel, et ses couleurs suivent les tokens", () => {
    // The BODY of the pre-paint script lives in lib/theme-script.ts (pure
    // module); the component only injects it.
    const script = read(join(REPO, "lib/theme-script.ts"));
    expect(script).toContain('name","theme-color"');
    // The observer keeps the tag current when we switch themes.
    expect(script).toContain("MutationObserver");

    // The two hex values are a manual CONVERSION of the mangue-ui tokens, which
    // `theme-color` cannot read through `var()`. If a token changes, these must
    // be recalculated — this test prevents discovering that on a phone.
    const tokens = read(join(REPO, "node_modules/mangue-ui/src/styles/tokens.css"));
    expect(tokens).toContain("--background: oklch(0.975 0.006 266);"); // light
    expect(tokens).toContain("--background: oklch(0.135 0.003 250);"); // dark
    expect(script).toContain('light: "#f5f7fb"');
    expect(script).toContain('dark: "#070809"');
  });
});
