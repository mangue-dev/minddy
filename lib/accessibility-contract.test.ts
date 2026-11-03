import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * MIN-783 — Cross-file accessibility rules (WCAG 2.2 AA) that no single
 * component test holds. DESIGN.md (Accessibility) states them; the runtime
 * behavior has its own tests (`components/app-shell.test.tsx`,
 * `lib/keyboard-modality.test.ts`, `components/editor/document-editor.test.tsx`).
 * These scans cannot prove conformance: docs/accessibility.md lists the
 * manual checks that go with them.
 */
const COMPONENT_SOURCE = /^(?:app|components)\/.*\.tsx$/;

function trackedComponents(): string[] {
  return execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter((file) => COMPONENT_SOURCE.test(file) && !file.includes(".test."));
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

/** Brace depth at `index`, comments excluded: 0 is the stylesheet's top level. */
function cssDepthAt(css: string, index: number): number {
  const code = css.slice(0, index).replace(/\/\*[\s\S]*?\*\//g, "");
  return [...code].reduce((depth, char) => depth + (char === "{" ? 1 : char === "}" ? -1 : 0), 0);
}

/** A paragraph rendered by `&&` or a ternary, its parenthesis on the same line or the next. */
const CONDITIONAL_PARAGRAPH = /(?:&&|\?)\s*\(?\s*<p\b([^>]*)>/g;

/** Literal `aria-label`s that are proper names, the same in every language. */
const LITERAL_NAMES = new Set(["minddy", "Claude Code, Codex, Cursor"]);

describe("accessibility contract", () => {
  it("translates every accessible name that is not a proper name (3.1.2, 4.1.2)", () => {
    const offenders = trackedComponents()
      .flatMap((file) => {
        const source = readFileSync(file, "utf8");
        return [...source.matchAll(/aria-label="([^"]*)"/g)]
          .filter(([, label]) => label !== "" && !LITERAL_NAMES.has(label))
          .map((match) => `${file}:${lineOf(source, match.index)} ${match[0]}`);
      });
    expect(offenders).toEqual([]);
  });

  it("announces an error that appears on its own (3.3.1, 4.1.3)", () => {
    // `{error && <p className="… text-destructive">…}` (or a ternary, on one
    // line or several) shows up after an action, away from focus: without a
    // role, a screen reader never hears it.
    const offenders = trackedComponents().flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return [...source.matchAll(CONDITIONAL_PARAGRAPH)]
        .filter(([, attributes]) => /text-destructive/.test(attributes) && !/\brole=/.test(attributes))
        .map((match) => `${file}:${lineOf(source, match.index)}`);
    });
    expect(offenders).toEqual([]);
  });

  it("gives every image element a text alternative, empty when decorative (1.1.1)", () => {
    const offenders = trackedComponents().flatMap((file) => {
      const source = readFileSync(file, "utf8");
      // JSX tags open a line; `<img>` inside a comment does not. Spread props
      // (`getImageProps`) carry their own `alt`.
      return [...source.matchAll(/^[ \t]*<img\b[\s\S]*?\/>/gm)]
        .filter(([tag]) => !/\balt=/.test(tag) && !/\{\.\.\./.test(tag))
        .map((match) => `${file}:${lineOf(source, match.index)}`);
    });
    expect(offenders).toEqual([]);
  });

  it("draws keyboard focus above the utilities that remove it (2.4.7)", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const rule = css.indexOf('html[data-input-modality="keyboard"] :focus-visible:not(');
    expect(rule).toBeGreaterThan(-1);
    // Unlayered: inside `@layer base` the `focus-visible:outline-none`
    // utilities of the primitives would win again.
    expect(cssDepthAt(css, rule)).toBe(0);
    expect(css.slice(rule, css.indexOf("}", rule))).toContain("outline: 2px solid var(--ring)");
    expect(readFileSync("app/layout.tsx", "utf8")).toContain("<KeyboardModality />");
  });

  it("lets framer-motion follow the reduced-motion preference (2.3.3)", () => {
    // The CSS rule in app/tokens.css cannot reach animations run from script.
    for (const file of ["app/(app)/app-providers.tsx", "components/auth/signup-wizard.tsx", "components/marketing/point-card.tsx"]) {
      expect(readFileSync(file, "utf8"), file).toContain('<MotionConfig reducedMotion="user">');
    }
  });

  it("finds the shapes it is meant to catch", () => {
    expect([...'{error && <p className="text-sm text-destructive">{error}</p>}'.matchAll(CONDITIONAL_PARAGRAPH)]).toHaveLength(1);
    expect([...'{error ? (\n  <p className="text-destructive">'.matchAll(CONDITIONAL_PARAGRAPH)]).toHaveLength(1);
    expect(cssDepthAt("@layer base { a { color: red } }", 14)).toBe(1);
    expect(cssDepthAt("/* { */ a { color: red }\nb", 26)).toBe(0);
  });
});
