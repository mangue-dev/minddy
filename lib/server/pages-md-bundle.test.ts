import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * LE BUNDLE DE LA PROJECTION, LU DANS LE TEXTE (MIN-295).
 *
 * Ce test est le seul du dépôt qui regarde un ARTEFACT plutôt qu'un source, et
 * c'est toute la raison de son existence. `minddy_create_page` répondait en
 * production « [tiptap error]: there is no window object available », quel que
 * soit le contenu — donc `update_page`, `append_to_page` et `edit_page_text`
 * aussi, côté MCP comme côté Numo et agent de code. Le wiki de minddy était vide
 * parce que rien n'avait jamais pu y être écrit par un agent.
 *
 * La cause n'était pas dans le code, elle était dans sa COMPILATION. `@tiptap/core`
 * garde `elementFromString` derrière `if (typeof window === "undefined") throw`.
 * Le bundler de Next substitue `typeof window` → `"undefined"` côté serveur : la
 * condition devient constante et la fonction se réduit à un `throw`
 * inconditionnel. Relevé tel quel dans `.next/server/chunks` :
 *
 *     function iQ(e){throw Error("[tiptap error]: there is no window object…")}
 *
 * `lib/server/pages-projection.ts` installait pourtant bien jsdom, et
 * `pages-projection.test.ts` le vérifiait. Mais il vérifiait le RUNTIME, et la
 * substitution a lieu au BUILD : aucun test ne pouvait le voir, parce qu'aucun
 * ne lisait ce qui est réellement livré. D'où les deux cas ci-dessous.
 */

const REPO = path.resolve(import.meta.dirname, "..", "..");
const BUNDLE = path.join(REPO, ".pages-md", "main.js");

/** Le drapeau exact que Vercel passe à Node (relevé sur `process.execArgv`). */
const VERCEL_NODE_FLAG = "--no-experimental-require-module";

describe("le bundle de la projection markdown des pages", () => {
  it("garde le test `typeof window` d'elementFromString à l'exécution", () => {
    const source = readFileSync(BUNDLE, "utf8");

    // Le message est là — c'est bien ce `elementFromString`-ci qu'on regarde.
    expect(source).toContain("there is no window object available");

    // Et il est encore GARDÉ. Un bundler qui aurait substitué `typeof window`
    // laisserait le `throw` sans son `if`, et c'est précisément la panne.
    expect(
      source,
      "le garde `typeof window` a été replié : elementFromString est réduit à un throw"
    ).toMatch(/typeof window === ["']undefined["']/);
  });

  it("se charge et projette dans la condition de Vercel", () => {
    // Le graphe entier passé au `require` d'un Node sans interop ESM — le piège
    // déjà pris avec jsdom, et celui qui écarte `serverExternalPackages` :
    // `tiptap-markdown` et `@tiptap/extension-unique-id` publient un point
    // d'entrée `require`, mais sous `"type": "module"`.
    const probe = `
      const { JSDOM } = require("jsdom");
      const win = new JSDOM("<!doctype html><html><body></body></html>").window;
      for (const key of Object.getOwnPropertyNames(win)) {
        if (/^[A-Z]/.test(key)) globalThis[key] = win[key];
      }
      globalThis.window = win;
      globalThis.document = win.document;

      const { bodyFromMarkdown, bodyToMarkdown } = require(${JSON.stringify(BUNDLE)});
      // Un bloc RICHE : le dépliant traverse DOMParser puis le parseHTML du
      // registre, donc tout le chemin qui tombait.
      const md = "## Contexte\\n\\n- [x] une tâche faite\\n\\n<details>\\n<summary>Un dépliant</summary>\\n\\nson contenu\\n\\n</details>";
      const back = bodyToMarkdown(bodyFromMarkdown(md));
      if (back !== md) {
        throw new Error("aller-retour perdu :\\n--- attendu ---\\n" + md + "\\n--- obtenu ---\\n" + back);
      }
    `;

    const run = () =>
      execFileSync(process.execPath, [VERCEL_NODE_FLAG, "-e", probe], {
        cwd: REPO,
        stdio: "pipe",
      });

    expect(run, "la projection ne tourne pas dans la condition de Vercel").not.toThrow();
  });
});
