import { defineConfig } from "oxlint";

// Le linter du dépôt. Deux jeux de règles y tournent ensemble :
//
//   - les règles `correctness` d'oxlint (actives par défaut) — ce sont elles
//     qui trouvent des bugs : optional chaining non sûr, variables mortes,
//     options de `fetch` invalides ;
//   - anti-slop (github.com/dmmulroy/anti-slop), vendorisé dans
//     `tools/oxlint/anti-slop/` — quinze règles qui refusent les motifs TS à
//     faible preuve. Le plugin est VENDORISÉ, donc modifiable : c'est le point
//     de son auteur, et c'est ce qui permet la sélection ci-dessous.
//
// La sélection est le cœur du fichier. Passer les quinze règles anti-slop à
// `error` sur ce dépôt donne 7 926 erreurs — un linter qu'on ne lance jamais
// n'attrape rien. Ce qui est activé ici est ce que le dépôt tient à zéro, donc
// ce qu'une PR ne peut plus regresser. Le reste est éteint AVEC SON COMPTE au
// jour de l'audit (2026-08-15) : c'est ce qui rend un cliquet possible plus
// tard — on rallume une règle quand son compte est retombé à zéro, pas avant.
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
    // ── anti-slop : tenu à zéro, donc opposable ──────────────────────────────
    "anti-slop/no-chained-type-assertions": "off", // 199 — `as X as Y` fabrique une preuve
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-widen-then-assert": "error",

    // ── anti-slop : éteint, avec le compte du jour ───────────────────────────
    // Rallumer une ligne demande de ramener son compte à zéro d'abord.
    "anti-slop/no-conditional-empty-object-spread": "off", // 368
    "anti-slop/no-known-value-widening": "off", // 519
    "anti-slop/no-runtime-typeof": "off", // 1137
    "anti-slop/no-unknown-parameters": "off", // 433
    "anti-slop/no-unknown-returns": "off", // 77 — le plus proche d'être tenable
    "anti-slop/no-unsafe-dictionary-type": "off", // 976
    "anti-slop/require-safety-comment-for-type-assertion": "off", // 3653

    // ── anti-slop : éteint parce que la règle se trompe ICI ──────────────────
    // `no-module-mocking` refuse `vi.mock`. Le dépôt s'en sert dans 372 cas et
    // la doctrine de test de CLAUDE.md est déjà plus fine que la règle (faux
    // `fetch`, `RepoHost` en mémoire, espions sur le vrai module). Ce n'est pas
    // un compte à faire baisser, c'est un désaccord de fond.
    "anti-slop/no-module-mocking": "off",
    // `no-shape-in-symbol-names` refuse le mot « shape ». Dans ce dépôt il est
    // le plus souvent DOMAINE, pas structure : la forme visuelle d'une puce de
    // mention (components/mention-chip.tsx), les formes du canvas de grain
    // (components/marketing/grain-canvas.tsx). Renommer dégraderait le sens.
    "anti-slop/no-shape-in-symbol-names": "off",

    // ── oxlint : réglages des règles par défaut ──────────────────────────────
    // `{ node, ...props }` n'est pas une variable morte : c'est LA façon de
    // retirer une prop avant de spreader le reste dans un élément du DOM
    // (components/markdown.tsx). `ignoreRestSiblings` distingue cet omis
    // volontaire d'un vrai oubli, qui lui reste signalé.
    // Les deux `ignorePattern` sont les défauts d'oxlint : passer un objet
    // d'options les remplace en bloc, il faut donc les réécrire ici, sinon tout
    // le `_`-préfixé volontaire du dépôt se met à crier.
    "no-unused-vars": [
      "warn",
      { ignoreRestSiblings: true, varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
    ],

    // `no-new-array` refuse `new Array(n)` pour son ambiguïté longueur/élément.
    // Les 6 cas du dépôt sont tous des PRÉALLOCATIONS typées — `new Array<number>(
    // aLen + 1)` dans les deux lignes de la distance de Levenshtein de la palette
    // (lib/command-palette/search/engine.ts), la matrice de lignes plates de
    // ResultsList. La longueur y est le sens voulu, et `Array.from({length})`
    // remplirait le tableau au lieu de le réserver.
    "unicorn/no-new-array": "off",

    // ── oxlint : une règle par défaut qui se trompe ICI ──────────────────────
    // `no-thenable` refuse une clé `then`. Les 59 cas sont deux motifs voulus :
    // le `then` d'une règle d'automatisation (`when` / `if` / `then`, un nom du
    // domaine, jamais awaité) et les faux query-builders Supabase des tests,
    // thenables EXPRÈS pour imiter le vrai client.
    "unicorn/no-thenable": "off",
  },
});
