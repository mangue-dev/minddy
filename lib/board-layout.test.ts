import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

import { BOARD_COLUMN_CLASS, BOARD_SCROLLER_CLASS } from "./board-layout";

/**
 * The width of a board column is decided in the CASCADE, not in the
 * file that writes it.
 *
 * `BOARD_COLUMN_CLASS` stacks four widths on the same element — one per
 * level — and the only one that matters is the last one that applies. But the order
 * writing of media queries is not that of classes: Tailwind sorts the
 * break points by value but does not compare `px` and `rem`, so the
 * `wide:` of the application (1200px) outputs BEFORE the `sm:`/`lg:` of the core (40rem,
 * 64rem). A column can therefore be three times as wide as the file
 * announcement, without anything announcing it anywhere — it happened, and it read
 * in ticket cards stretched above 1200 px.
 *
 * Rereading the classes doesn't check that. What verifies it: compiling them for
 * true, with the mango-ui tokens, then replay the cascade at five widths of
 * window. The test fails both if someone removes the `max-desktop:` and if
 * a mango-ui bump moves the threshold.
 */

const require = createRequire(import.meta.url);

/** What 1rem is worth in a media query: the default ROOT font size.
    This is what makes it possible to compare the levels in `rem` of the heart to the threshold in `px`
    of mango-ui — the comparison that Tailwind, precisely, does not make. */
const REM = 16;

/**
 * Compiles classes with the REAL theme: Tailwind plus breaking points
 * that of the application (`--breakpoint-wide`), which is the whole point.
 *
 * The `@import` of `tokens.css` are removed rather than resolved: they pull
 * `tw-animate-css`, whose export is only resolved by the condition `style` that
 * `require.resolve` ne sait pas demander. Rien de ce qu'ils apportent (des
 * keyframes) only weighs one width; the `@theme` block of the file is read
 * tel quel.
 */
async function buildCss(candidates: string[]): Promise<string> {
  const loadStylesheet = async (id: string, base: string) => {
    const file = id.startsWith(".") ? path.resolve(base, id) : require.resolve(id);
    return {
      path: file,
      base: path.dirname(file),
      content: readFileSync(file, "utf8"),
    };
  };
  const tokens = readFileSync(require.resolve("mangue-ui/tokens.css"), "utf8").replace(
    /^\s*@import\s[^;]*;\s*$/gm,
    "",
  );
  const compiler = await compile(
    [
      '@import "tailwindcss/theme.css" layer(theme);',
      '@import "tailwindcss/utilities.css" layer(utilities);',
      tokens,
      "@theme { --breakpoint-wide: 1200px; }",
    ].join("\n"),
    { base: process.cwd(), loadStylesheet },
  );
  return compiler.build(candidates);
}

/** `(width >= 40rem)` / `(width < 1200px)` → does the condition depend on `viewport`? */
function conditionHolds(condition: string, viewport: number): boolean {
  const m = /\(\s*width\s*(>=|<=|>|<)\s*([\d.]+)(px|rem)\s*\)/.exec(condition);
  // A condition that cannot be read (`print`, `hover`…) must not be
  // silently treated as true: the reading would be false without saying it.
  if (!m) throw new Error(`Condition de media query non reconnue : ${condition}`);
  const bound = Number(m[2]) * (m[3] === "rem" ? REM : 1);
  switch (m[1]) {
    case ">=":
      return viewport >= bound;
    case ">":
      return viewport > bound;
    case "<=":
      return viewport <= bound;
    default:
      return viewport < bound;
  }
}

/**
 * The rules of the sheet: `selector` → `body`, in document order.
 *
 * The `@layer` are CROSSED (the utilities are generated in
 * `@layer utilities`): a layer does not change the order between two rules which
 * live inside, and it is this order that we replay.
 */
function flatRules(css: string): { selector: string; body: string }[] {
  const rules: { selector: string; body: string }[] = [];
  let depth = 0;
  let start = 0;
  let openedAt = -1;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === "{") {
      if (depth === 0) openedAt = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) {
        const selector = css.slice(start, openedAt).trim();
        const body = css.slice(openedAt + 1, i);
        if (selector.startsWith("@layer")) rules.push(...flatRules(body));
        else rules.push({ selector, body });
        start = i + 1;
      }
    }
  }
  return rules;
}

/** The `width` posed by a rule body, if all its media queries hold. */
function widthInBody(body: string, viewport: number): string | null {
  const nested = /@media([^{]*)\{/.exec(body);
  if (nested) {
    if (!conditionHolds(nested[1].trim(), viewport)) return null;
    // The nested body: from the opening brace to its closing brace.
    let depth = 0;
    for (let i = nested.index + nested[0].length - 1; i < body.length; i++) {
      if (body[i] === "{") depth++;
      else if (body[i] === "}" && --depth === 0) {
        return widthInBody(body.slice(nested.index + nested[0].length, i), viewport);
      }
    }
    return null;
  }
  const decl = /(?:^|;)\s*width:\s*([^;]+)/.exec(body);
  return decl ? decl[1].trim() : null;
}

/** The width that WINS at this window width — the last one that applies. */
async function resolvedWidth(viewport: number): Promise<string | null> {
  const candidates = BOARD_COLUMN_CLASS.split(" ").filter((c) => /(^|:)w-/.test(c));
  expect(candidates.length).toBeGreaterThan(1);
  const css = await buildCss(candidates);
  // The generated selector is escaped (`.max-desktop\:sm\:w-\[…\]`): remove the
  // backslashes return it to the class name.
  const wanted = new Set(candidates.map((c) => `.${c}`));
  let winner: string | null = null;
  for (const rule of flatRules(css)) {
    if (!wanted.has(rule.selector.replace(/\\/g, ""))) continue;
    const width = widthInBody(rule.body, viewport);
    if (width) winner = width;
  }
  return winner;
}

describe("largeur d'une colonne de board", () => {
  it("téléphone (375 px) : une colonne pleine, qu'on feuillette", async () => {
    expect(await resolvedWidth(375)).toBe("100%");
  });

  it("640 px : deux colonnes, gouttière déduite", async () => {
    expect(await resolvedWidth(800)).toBe("calc((100% - 0.75rem) / 2)");
  });

  it("1024 px : trois colonnes", async () => {
    expect(await resolvedWidth(1100)).toBe("calc((100% - 1.5rem) / 3)");
  });

  it("au-dessus de 1200 px la colonne est FIXE — le partage ne déborde pas", async () => {
    // The heart of the test: without `max-desktop:` on fractions, `lg:` won here
    // and made a column a third of the window.
    expect(await resolvedWidth(1400)).toBe("22rem");
    expect(await resolvedWidth(2400)).toBe("22rem");
  });
});

describe("board scroller gutter", () => {
  it("keeps a trailing flex spacer below the wide breakpoint", () => {
    expect(BOARD_SCROLLER_CLASS).toContain("after:w-1");
    expect(BOARD_SCROLLER_CLASS).toContain("sm:after:w-3");
    expect(BOARD_SCROLLER_CLASS).toContain("wide:after:hidden");
  });
});
