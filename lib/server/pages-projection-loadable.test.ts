import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * jsdom should load IN VERCEL'S CONDITION, not the Mac's.
 *
 * What this test keeps is not seen anywhere else, and cost an integer run
 *: `create_page` failed in production on
 * `ERR_REQUIRE_ESM … @exodus/bytes`, while the suite was green and
 * `npm run dev` worked. The two environments do not load the modules
 * in the same way.
 *
 * The fact that explains everything, noted on a deployed probe: the Vercel
 * function runs on Node v24.18.0 — but launched with **`--no-experimental-require-module`**
 * (`process.execArgv`). The `require()` interop of an ESM module, active by default
 * since Node 22.12, is therefore CUT. Now `jsdom@27+` has changed part of
 * of its dependencies to ESM-only (`@exodus/bytes` via `html-encoding-sniffer@6`,
 * `@csstools/css-calc` via `@asamuzakjp/css-color`): the `require` internal de
 * jsdom lifts, and with it ALL page writing — the UI, MCP, Numo and
 * the code agent all go through the projection (lib/server/pages-projection.ts).
 *
 * Hence this test, and its form: we restart a Node WITH THE SAME FLAG and we ask it
 * to load jsdom. This is the only way to see, from a position where
 * interop is active, what the lambda will see. An ordinary `npx vitest run`
 * cannot tell: it loads jsdom through the Vite loader, which does not have this
 * problem.
 *
 * **If this test falls after a jsdom bump, do not bypass it**: the version
 * chosen is unusable in production, whatever the rest says. jsdom 26 is
 * the last one whose graph `require` is entirely CJS.
 */

/** The exact flag that Vercel passes to Node (taken from `process.execArgv`). */
const VERCEL_NODE_FLAG = "--no-experimental-require-module";

describe("le DOM serveur de la projection des pages", () => {
  // 20 s for the same reason as its neighbor `pages-md-bundle.test.ts`: the cost
  // in this case is one more Node process that loads jsdom, and nothing else.
  // Under the 5s default, it failed when the suite loaded the machine
  // elsewhere — a failure which speaks of a delay and never of what consumed it.
  it("se charge avec l'interop require(ESM) coupée, comme sur Vercel", { timeout: 20_000 }, () => {
    const load = () =>
      execFileSync(
        process.execPath,
        [VERCEL_NODE_FLAG, "-e", "require('jsdom')"],
        { cwd: process.cwd(), stdio: "pipe" }
      );

    expect(load, "jsdom ne se charge plus dans la condition de Vercel").not.toThrow();
  });
});
