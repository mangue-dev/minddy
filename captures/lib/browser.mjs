/**
 * captures/ — deterministic browser context.
 *
 * Anything that can render two different captures with identical content is
 * neutralized here: animations, clock, font not yet loaded, scale.
 * The knowledge accumulated on AutoKap is contained in this file.
 */
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";
import { CAPTURE } from "./config.mjs";
import { loadEnv, ROOT } from "./env.mjs";

export const AUTH_STATE = resolve(ROOT, "captures/.auth/demo.json");

/**
 * Opens a page ready to photograph.
 *
 *   theme   "light" | "dark"
 *   locale  "fr" | "en"
 * authed true to reuse the demo account session
 */
export async function openPage({
  theme = "light",
  locale = "fr",
  authed = true,
  viewport = CAPTURE.viewport,
  frozenNow = CAPTURE.frozenNow,
} = {}) {
  loadEnv();

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: CAPTURE.deviceScaleFactor,
    locale: locale === "fr" ? "fr-FR" : "en-US",
    colorScheme: theme,
    // Cuts CSS animations and Framer Motion transitions at source,
    // instead of waiting for the image to stop moving.
    reducedMotion: "reduce",
    storageState: authed ? AUTH_STATE : undefined,
  });

  // Theme is read into localStorage by ThemeInitScript BEFORE the first
  // paint. We therefore place it before loading, not after.
  await context.addInitScript(
    ([themeValue, frozenIso]) => {
      try {
        localStorage.setItem("mangue-ui-theme", themeValue);

        // Cookies banner: without a saved choice, it is placed at the bottom of ALL
        // the pages and is found on all the captures. We respond
        // “declined” rather than “accepted” — a capture robot has nothing to
        // send to analytics. Key and values: lib/cookie-consent.ts.
        localStorage.setItem("cookie_consent", "declined");
      } catch {}

      // The Next development indicator (the “N” dot at the bottom
      // left, with its anomaly count) only exists on `next dev` — so
      // never on deployed targets, and systematically when we
      // localhost photography. He lives in a `<nextjs-portal>` outside the tree
      // React, which no application selector reaches: we hide it with a
      // global rule, laid before the first paint.
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = "nextjs-portal { display: none !important; }";
        document.head.appendChild(style);
      });

      // Frozen clock: relative dates ("2 days ago") become
      // stable from one run to the next.
      const fixed = new Date(frozenIso).getTime();
      const Real = Date;
      class Frozen extends Real {
        constructor(...args) {
          if (args.length === 0) super(fixed);
          else super(...args);
        }
        static now() {
          return fixed;
        }
      }
      // @ts-ignore
      window.Date = Frozen;
    },
    [theme, frozenNow],
  );

  await context.addCookies([
    { name: "NEXT_LOCALE", value: locale, url: CAPTURE.baseUrl },
  ]);

  await alignStoredViewNames(context, locale);

  const page = await context.newPage();
  return { browser, context, page };
}

/**
 * View names translated ONCE, at creation, then frozen in base.
 *
 * `ensureBaselineViews` (lib/server/views.ts) creates the starting views with the
 * wording translated into the query language, and written in the table
 * `views`. It is therefore no longer a translation but a piece of data: the account of
 * demo having seen its first board in French, the ENGLISH capture displayed
 * an “All” tab in the middle of an English interface.
 *
 * We rewrite the API response in flight, so that the wording corresponds to the
 * language of capture. Two reasons to do this here rather than in the base:
 * - no writing in production, therefore nothing to undo or monitor;
 * - the image shows what a real user of this language would see — at
 * him, the view would have been created in HIS language.
 *
 * Only `custom` views are affected: those of type `my` are
 * relabeled by the interface according to their `kind`, never according to their name.
 */
export const DEFAULT_VIEW_NAMES = {
  // Board.defaultViewName in messages/<locale>.json
  fr: "Toutes",
  en: "All",
};

async function alignStoredViewNames(context, locale) {
  const target = DEFAULT_VIEW_NAMES[locale];
  if (!target) return;
  const known = Object.values(DEFAULT_VIEW_NAMES);

  await context.route("**/api/**/views", async (route) => {
    const response = await route.fetch();
    if (!response.ok()) return route.fulfill({ response });

    let body;
    try {
      body = await response.json();
    } catch {
      return route.fulfill({ response });
    }

    if (Array.isArray(body)) {
      for (const view of body) {
        if (view?.kind === "custom" && known.includes(view.name)) view.name = target;
      }
    }
    await route.fulfill({ response, json: body });
  });
}

/**
 * Wait until the page is REALLY ready. Three layers, in that order.
 * `networkidle` is deliberately absent: it never converges on an app
 * with Realtime permanently open, which is the case with minddy.
 */
export async function settle(page, { expect } = {}) {
  await page.waitForLoadState("domcontentloaded");

  // 1. The semantic anchor: an element which proves that the desired screen is there.
  if (expect) await page.locator(expect).first().waitFor({ state: "visible", timeout: 15_000 });

  // 2. No visible charging indicator.
  await page
    .locator('[aria-busy="true"], [role="progressbar"], .animate-pulse')
    .first()
    .waitFor({ state: "hidden", timeout: 10_000 })
    .catch(() => {});

  // 3. Loaded fonts: without this, the first capture of a session is output
  // with the fallback font and different footage.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
}

/** Saves a capture, building the tree as needed. */
export async function shoot(target, outPath, options = {}) {
  await mkdir(dirname(outPath), { recursive: true });
  await target.screenshot({ path: outPath, animations: "disabled", ...options });
  return outPath;
}

export { CAPTURE };
