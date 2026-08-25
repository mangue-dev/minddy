import { defineConfig } from "oxlint";

// The repository linter. Two sets of rules run together:
//
// - oxlint's `correctness` rules (active by default), which find bugs such as
//   unsafe optional chaining, dead variables, and invalid `fetch` options;
// - anti-slop (github.com/dmmulroy/anti-slop), vendorized in
//   `tools/oxlint/anti-slop/` — fifteen rules that reject weakly justified TS
//   patterns. The plugin is vendored and therefore modifiable by design, which
//   allows the selection below.
//
// The selection is the heart of this file. Setting all fifteen anti-slop rules
// to `error` produces 7,926 errors in this repository, and a linter that is
// never run catches nothing. The enabled rules currently have zero violations,
// so pull requests cannot regress them. The other rules were disabled with
// their violation count on audit day (2026-08-15), making it possible to turn
// them back on once their count reaches zero.
export default defineConfig({
  ignorePatterns: [
    ".claude/**",
    "tools/oxlint/anti-slop/**",
    "desktop/node_modules/**",
    "public/**",
    ".next/**",
  ],
  jsPlugins: [{ name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" }],
  rules: {
    // ── anti-slop: held at zero, therefore enforceable ──────────────────────────
    "anti-slop/no-chained-type-assertions": "off", // 199 — `as X as Y` invents evidence
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-widen-then-assert": "error",

    // ── anti-slop: disabled, with audit-day counts ──────────────────────────────
    // Re-enabling a rule requires reducing its count to zero first.
    "anti-slop/no-conditional-empty-object-spread": "off", // 368
    "anti-slop/no-known-value-widening": "off", // 519
    "anti-slop/no-runtime-typeof": "off", // 1137
    "anti-slop/no-unknown-parameters": "off", // 433
    "anti-slop/no-unknown-returns": "off", // 77 — closest to being enforceable
    "anti-slop/no-unsafe-dictionary-type": "off", // 976
    "anti-slop/require-safety-comment-for-type-assertion": "off", // 3653

    // ── anti-slop: disabled because the rule is unsuitable here ───────────────
    // `no-module-mocking` refuses `vi.mock`. The repository uses it in 372 cases and
    // the CLAUDE.md test doctrine is already more precise than the rule (mocked
    // `fetch`, in-memory `RepoHost`, spies on the real module). This is a
    // fundamental disagreement, not a count to reduce.
    "anti-slop/no-module-mocking": "off",
    // `no-shape-in-symbol-names` rejects the word "shape". In this repository it
    // usually describes the domain rather than a data structure: the visual shape
    // of a mention bullet (components/mention-chip.tsx) and grain canvas shapes
    // (components/marketing/grain-canvas.tsx). Renaming would reduce clarity.
    "anti-slop/no-shape-in-symbol-names": "off",

    // ── oxlint: default rule settings ──────────────────────────────────────────
    // `{ node, ...props }` does not contain a dead variable: it is how a prop is
    // removed before spreading the remainder onto a DOM element
    // (components/markdown.tsx). `ignoreRestSiblings` distinguishes that omission
    // from a real oversight, which remains reported. The two `ignorePattern`
    // values are oxlint's defaults. Passing an options object replaces them as a
    // whole, so they must be repeated here to preserve intentional `_` prefixes.
    "no-unused-vars": [
      "warn",
      { ignoreRestSiblings: true, varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
    ],

    // `no-new-array` rejects `new Array(n)` because `n` could be a length or an
    // element. All six occurrences in this repository are typed preallocations,
    // such as `new Array<number>(aLen + 1)` for both rows of the palette's
    // Levenshtein distance (lib/command-palette/search/engine.ts) and the flat row
    // matrix in ResultsList. The length is intentional; `Array.from({ length })`
    // would fill the array instead of reserving it.
    "unicorn/no-new-array": "off",

    // ── oxlint: default rules that are unsuitable here ────────────────────────
    // `no-thenable` rejects a `then` key. The 59 occurrences have two intentional
    // causes: automation rules (`when` / `if` / `then`, a domain term that is
    // never awaited) and mocked Supabase query builders, which are deliberately
    // thenable to match the real client.
    "unicorn/no-thenable": "off",

    // Oxlint 1.79 enables this correctness rule by default. Existing source and
    // locale-adjacent fixtures intentionally contain narrow no-break spaces for
    // typography, so upgrading the linter must not turn those files into errors.
    "no-irregular-whitespace": "off",
  },
});
