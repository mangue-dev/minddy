import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE PROJECTION BUNDLE, READ IN THE TEXT (MIN-295).
 *
 * This test is the only one in the repository that inspects an ARTIFACT rather than
 * source code, and that is the whole reason it exists. In production,
 * `minddy_create_page` returned « [tiptap error]: there is no window object available »
 * regardless of the content — so `update_page`, `append_to_page`, and `edit_page_text`
 * failed too, on the MCP side as well as for Numo and the coding agent. minddy's wiki
 * was empty because an agent could never write anything to it.
 *
 * The cause was not in the code, it was in its COMPILATION. `@tiptap/core`
 * keeps `elementFromString` behind `if (typeof window === "undefined") throw`.
 * Next's bundler substitutes `typeof window` → `"undefined"` on the server side:
 * the condition becomes constant and the function reduces to an unconditional
 * `throw`. Reported as-is in `.next/server/chunks`:
 *
 *     function iQ(e){throw Error("[tiptap error]: there is no window object…")}
 *
 * `lib/server/pages-projection.ts` did install jsdom correctly, and
 * `pages-projection.test.ts` checked it. But that test checked the RUNTIME, while
 * the substitution happens at BUILD time. No test could see it because none read
 * what was actually delivered. Hence the two cases below.
 */

const REPO = path.resolve(import.meta.dirname, "..", "..");
const BUNDLE = path.join(REPO, ".pages-md", "main.js");

/** The exact flag that Vercel passes to Node (taken from `process.execArgv`). */
const VERCEL_NODE_FLAG = "--no-experimental-require-module";

describe("the pages' Markdown projection bundle", () => {
  it("keeps elementFromString's `typeof window` guard at runtime", () => {
    const source = readFileSync(BUNDLE, "utf8");

    // The message is there — it’s this `elementFromString` that we’re looking at.
    expect(source).toContain("there is no window object available");

    // And it’s still KEPT. A bundler that would have substituted `typeof window`
    // would leave the `throw` without its `if`, and that is precisely the problem.
    expect(
      source,
      "the `typeof window` guard was folded away: elementFromString was reduced to a throw"
    ).toMatch(/typeof window === ["']undefined["']/);
  });

  // 20 s is not a performance assertion — it is what this case COSTS: one more
  // Node process, a `require` of a 1.1 MB bundle, and a jsdom DOM built from scratch.
  // The old 5 s default held until the suite started loading the machine elsewhere;
  // the first test to launch parallel subprocesses (`lib/desktop/git-config.git.test.ts`,
  // MIN-359) made it exceed the limit half the time. The message described a timeout,
  // not what consumed it. A case whose failure depends on its NEIGHBORS teaches us
  // nothing about what it tests.
  it("loads and projects under the Vercel condition", { timeout: 20_000 }, () => {
    // Pass the entire graph to `require` in a Node process without ESM interop — the
    // trap already encountered with jsdom, and the one that rules out
    // `serverExternalPackages`: `tiptap-markdown` and `@tiptap/extension-unique-id`
    // expose a `require` entry point but are under `"type": "module"`.
    const probe = `
      const { JSDOM } = require("jsdom");
      const win = new JSDOM("<!doctype html><html><body></body></html>").window;
      for (const key of Object.getOwnPropertyNames(win)) {
        if (/^[A-Z]/.test(key)) globalThis[key] = win[key];
      }
      globalThis.window = win;
      globalThis.document = win.document;

      const { bodyFromMarkdown, bodyToMarkdown } = require(${JSON.stringify(BUNDLE)});
      // A RICH block: the disclosure element passes through DOMParser and then the
      // registry's parseHTML, covering the entire path that used to fail.
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

    expect(run, "the projection does not run under the Vercel condition").not.toThrow();
  });
});
