import "server-only";

import { createRequire } from "node:module";
import path from "node:path";

import type { JSONContent } from "@tiptap/core";

/**
 * Markdown projection of pages, MOUNTABLE IN A SERVER FUNCTION (MIN-273).
 *
 * `lib/pages-markdown.ts` does all the work, and says it himself: he assumes
 * a DOM (`window.DOMParser`, `document.createElement`), because tiptap reads the
 * markdown through HTML and an editor — even without a line of
 * rendered — mounts on an element. In a browser and under jsdom, it is there.
 * In a Vercel function, there is nothing.
 *
 * This module is this “nothing” filled, once and for all: it installs a DOM
 * jsdom on globals on the first call, then renders the projection async. THE
 * six page tools (MCP, Numo, code agent) all pass through here — one
 * second path would be a second DOM, therefore two behaviors for the same
 * page.
 *
 * Why jsdom and not a hand-written minimal DOM: the meaning READING
 * crosses `DOMParser` then the `parseHTML` of each node of the register (the
 * leaflet and subpage are projected in HTML, cf. `Markdown.configure({
 * html: true })`). A false DOM which covers “most” cases fails
 * precisely on the rich blocks, that is to say on what MIN-269 promises not to
 * not lose. jsdom is exactly what the round trip test plays.
 *
 * The installation is GLOBAL and not canceled: jsdom mounts a window per
 * process, reused by all calls. Destroy it between two projections
 * would cost editing for each page read, for nothing — the document itself is
 * disposable and created by call (see `pageEditor`).
 *
 * ⚠️ **jsdom is stuck in 26.x, and it's not update laziness.**
 * The Vercel function runs on Node 24, but launched with
 * `--no-experimental-require-module` : l'interop `require()` d'un module ESM y
 * is CUT (read on `process.execArgv`, in production). Gold jsdom 27+ did
 * switch dependencies to ESM-only (`@exodus/bytes` via
 * `html-encoding-sniffer@6`, `@csstools/css-calc` via `@asamuzakjp/css-color`) :
 * jsdom's internal `require` raises `ERR_REQUIRE_ESM`, and `import()`
 * below fails en bloc. It has NO symptoms locally — the Vite loader
 * and the Node of the post loads jsdom 30 very well — and it breaks in production
 * any page writing, on all four surfaces at once.
 * `lib/server/pages-projection-loadable.test.ts` replays the exact condition:
 * if it falls, it is the version of jsdom that must be lowered, not the test.
 *
 * ⚠️ **And `lib/pages-markdown.ts` is NOT imported — it is loaded by path,
 * from a separate esbuild bundle.** Second build trap, cousin of the first
 * (MIN-295): Next bundler substitutes `typeof window` → `"undefined"` side
 * server, which reduces `elementFromString` from `@tiptap/core` to a `throw`
 * unconditional. The DOM installed lower can't do anything about it — the decision is made
 * at COMPILATION, before jsdom existed. See `scripts/build-pages-md.mjs`,
 * which carries the measure and the two roads separated.
 */

let installing: Promise<void> | null = null;

/**
 * The global ones to pose. Everything that starts with a capital letter comes from
 * constructeurs du DOM (`DOMParser`, `Node`, `Element`, `MutationObserver`,
 * `Range`…): copying them in bulk avoids discovering a missing one at a time
 * exception to the first page which carries a leaflet. The rest is named, because
 * that copying `window` in full would land `close`, `name`, `length` and
 * `top` on `globalThis`, where they mean nothing.
 */
const LOWERCASE_GLOBALS = [
  "document",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
] as const;

async function installDom(): Promise<void> {
  // A browser, or a test under jsdom: the DOM is already there, we don't touch it.
  if (typeof (globalThis as { document?: unknown }).document !== "undefined") {
    return;
  }

  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://minddy.app/",
  });
  const win = dom.window as unknown as Record<string, unknown>;
  const target = globalThis as unknown as Record<string, unknown>;

  const put = (key: string, bind: boolean) => {
    if (key in target && target[key] !== undefined) return;
    const value = win[key];
    if (value === undefined) return;
    target[key] =
      bind && typeof value === "function" ? (value as () => void).bind(win) : value;
  };

  target.window = win;
  // The CONSTRUCTORS are posed as they are, never linked: a linked function loses
  // the static properties of its target, and `Node.TEXT_NODE` would become
  // `undefined`. tiptap-markdown correctly compares `nextSibling?.nodeType` to
  // this constant — with `undefined` on both sides, an absent `nextSibling`
  // passes for a text node, and the markdown reading falls one line lower.
  for (const key of Object.getOwnPropertyNames(win)) {
    if (/^[A-Z]/.test(key)) put(key, false);
  }
  for (const key of LOWERCASE_GLOBALS) put(key, true);
}

/** The DOM in place, regardless of the number of concurrent calls. */
export function ensurePageDom(): Promise<void> {
  installing ??= installDom();
  return installing;
}

/* ── The projection, loaded by PATH ────────────────────────────────── */

/** What the bundle exposes — the surface of `lib/pages-markdown.ts`, literally. */
type PagesMarkdown = typeof import("@/lib/pages-markdown");

/**
 * Where the bundle is read. Produced by `prebuild` and `predev`
 * (`scripts/build-pages-md.mjs`), embedded in the functions by
 * `outputFileTracingIncludes` (next.config.mjs), and built before the continuation by
 * the `globalSetup` of vites.
 */
const BUNDLE_PATH = path.join(process.cwd(), ".pages-md", "main.js");

/**
 * `createRequire` rather than a `import()`: this is the only call that the bundler
 * can't follow. A `import()` of a calculated path would still do it
 * try, and above all a `import()` of this module would bring it back into the
 * graph — therefore under the substitution that we are precisely seeking to escape.
 */
const requireFromRepo = createRequire(path.join(process.cwd(), "noop.js"));

let bundle: PagesMarkdown | null = null;

/**
 * The bundle loaded, once per function instance.
 *
 * **No fallback to `import("@/lib/pages-markdown")` if the file is missing**, and
 * this is the heart of the fix: this fallback is exactly the dead code of MIN-295.
 * It would make the failure silent at the first forgetting of wiring — a `prebuild`
 * which jumps, a line of `outputFileTracingIncludes` lost in a refactor —
 * and we would return to a wiki that no agent can write, with nothing in the
 * logs that say so. An error that names the script to run is better.
 */
function pagesMarkdown(): PagesMarkdown {
  if (bundle) return bundle;
  try {
    bundle = requireFromRepo(BUNDLE_PATH) as PagesMarkdown;
  } catch (err) {
    throw new Error(
      `bundle de la projection des pages introuvable à ${BUNDLE_PATH} — lancer \`npm run build:pages-md\` (câblé en \`prebuild\` et \`predev\`) : ${(err as Error).message}`
    );
  }
  return bundle;
}

/** The DOM placed AND the projection loaded — the prerequisite for all surfaces. */
async function projection(): Promise<PagesMarkdown> {
  await ensurePageDom();
  return pagesMarkdown();
}

/** The entire page in markdown, header (title + icon) included. */
export async function pageToMarkdownServer(page: {
  title: string;
  icon: string | null;
  content: JSONContent | null;
}): Promise<string> {
  return (await projection()).pageToMarkdown(page);
}

/** The body alone in markdown — for a surface that already has the title. */
export async function pageBodyToMarkdownServer(
  content: JSONContent | null
): Promise<string> {
  return (await projection()).bodyToMarkdown(content);
}

/** The markdown reread on the page: title, icon, body ProseMirror. */
export async function markdownToPageServer(markdown: string): Promise<{
  title: string;
  icon: string | null;
  content: JSONContent | null;
}> {
  return (await projection()).markdownToPage(markdown);
}

/** The body alone, reread from markdown. */
export async function bodyFromMarkdownServer(
  markdown: string
): Promise<JSONContent> {
  return (await projection()).bodyFromMarkdown(markdown);
}
