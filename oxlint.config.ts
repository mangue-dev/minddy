import { defineConfig } from "oxlint";

// The repository linter. Two sets of rules run together:
//
// - oxlint's `correctness` rules (active by default) — these are them
// which find bugs: unsafe optional chaining, dead variables,
//     options de `fetch` invalides ;
// - anti-slop (github.com/dmmulroy/anti-slop), vendorized in
// `tools/oxlint/anti-slop/` — fifteen rules which refuse TS patterns to
// weak evidence. The plugin is SOLD, therefore modifiable: that’s the point
// of its author, and this is what allows the selection below.
//
// The selection is the heart of the file. Pass the fifteen anti-slop rules
// `error` on this repository gives 7,926 errors — a linter that is never run
// doesn't catch anything. What is enabled here is that the deposit holds zero, so
// what a PR can no longer regress. The rest is extinguished WITH HIS ACCOUNT at
// audit day (2026-08-15): this is what makes a ratchet possible more
// late — we turn a ruler back on when its count has dropped to zero, not before.
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
    // ── anti-slop: held to zero, therefore opposable ──────────────────────────────
    "anti-slop/no-chained-type-assertions": "off", // 199 — `as X as Y` creates a proof
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-widen-then-assert": "error",

    // ── anti-slop: off, with day count ───────────────────────────
    // Relighting a line requires resetting its count to zero first.
    "anti-slop/no-conditional-empty-object-spread": "off", // 368
    "anti-slop/no-known-value-widening": "off", // 519
    "anti-slop/no-runtime-typeof": "off", // 1137
    "anti-slop/no-unknown-parameters": "off", // 433
    "anti-slop/no-unknown-returns": "off", // 77 — closest to being tenable
    "anti-slop/no-unsafe-dictionary-type": "off", // 976
    "anti-slop/require-safety-comment-for-type-assertion": "off", // 3653

    // ── anti-slop: off because the rule is wrong HERE ──────────────────
    // `no-module-mocking` refuses `vi.mock`. The repository uses it in 372 cases and
    // the CLAUDE.md test doctrine is already finer than the rule (false
    // `fetch`, `RepoHost` in memory, spies on the real module). It's not
    // a count to be lowered is a fundamental disagreement.
    "anti-slop/no-module-mocking": "off",
    // `no-shape-in-symbol-names` refuses the word “shape”. In this deposit it is
    // most often DOMAIN, not structure: the visual form of a bullet point
    // mention (components/mention-chip.tsx), grain canvas shapes
    // (components/marketing/grain-canvas.tsx). Renaming would degrade the meaning.
    "anti-slop/no-shape-in-symbol-names": "off",

    // ── oxlint: default rule settings ──────────────────────────────
    // `{ node, ...props }` is not a dead variable: it is THE way to
    // remove a prop before spreading the rest in a DOM element
    // (components/markdown.tsx). `ignoreRestSiblings` distingue cet omis
    // voluntary of a real forgetting, which remains reported to him.
    // The two `ignorePattern` are the defaults of oxlint: passing an object
    // of options replaces them in bulk, so you have to rewrite them here, otherwise everything
    // the repository's voluntary `_`-prefix starts screaming.
    "no-unused-vars": [
      "warn",
      { ignoreRestSiblings: true, varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
    ],

    // `no-new-array` rejects `new Array(n)` for its length/element ambiguity.
    // The 6 cases in the repository are all typed PREALLOCATIONS — `new Array<number>(
    // aLen + 1)` in both rows of the Levenshtein distance of the palette
    // (lib/command-palette/search/engine.ts), the flat line matrix of
    // ResultsList. The length is the desired meaning, and `Array.from({length})`
    // would fill the array instead of reserving it.
    "unicorn/no-new-array": "off",

    // ── oxlint: a default rule that is wrong HERE ──────────────────────
    // `no-thenable` refuses a `then` key. The 59 cases are two intended reasons:
    // the `then` of an automation rule (`when` / `if` / `then`, a name of the
    // domain, never waited) and the false Supabase query-builders of the tests,
    //thenables EXPRESSLY to imitate the real customer.
    "unicorn/no-thenable": "off",
  },
});
