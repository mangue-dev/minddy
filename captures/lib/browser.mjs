/**
 * captures/ — contexte de navigateur déterministe.
 *
 * Tout ce qui peut rendre deux captures différentes à contenu identique est
 * neutralisé ici : animations, horloge, police pas encore chargée, échelle.
 * Le savoir accumulé sur AutoKap tient dans ce fichier.
 */
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";
import { CAPTURE } from "./config.mjs";
import { loadEnv, ROOT } from "./env.mjs";

export const AUTH_STATE = resolve(ROOT, "captures/.auth/demo.json");

/**
 * Ouvre une page prête à photographier.
 *
 *   theme   "light" | "dark"
 *   locale  "fr" | "en"
 *   authed  true pour réutiliser la session du compte de démo
 */
export async function openPage({
  theme = "light",
  locale = "fr",
  authed = true,
  viewport = CAPTURE.viewport,
} = {}) {
  loadEnv();

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: CAPTURE.deviceScaleFactor,
    locale: locale === "fr" ? "fr-FR" : "en-US",
    colorScheme: theme,
    // Coupe les animations CSS et les transitions Framer Motion à la source,
    // au lieu d'attendre que l'image arrête de bouger.
    reducedMotion: "reduce",
    storageState: authed ? AUTH_STATE : undefined,
  });

  // Le thème est lu dans localStorage par ThemeInitScript AVANT le premier
  // paint. On le pose donc avant le chargement, pas après.
  await context.addInitScript(
    ([themeValue, frozenIso]) => {
      try {
        localStorage.setItem("mangue-ui-theme", themeValue);
      } catch {}

      // Horloge figée : les dates relatives ("il y a 2 jours") deviennent
      // stables d'un run à l'autre.
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
    [theme, CAPTURE.frozenNow],
  );

  await context.addCookies([
    { name: "NEXT_LOCALE", value: locale, url: CAPTURE.baseUrl },
  ]);

  const page = await context.newPage();
  return { browser, context, page };
}

/**
 * Attend que la page soit VRAIMENT prête. Trois couches, dans cet ordre.
 * `networkidle` est volontairement absent : il ne converge jamais sur une app
 * avec du Realtime ouvert en permanence, ce qui est le cas de minddy.
 */
export async function settle(page, { expect } = {}) {
  await page.waitForLoadState("domcontentloaded");

  // 1. L'ancre sémantique : un élément qui prouve que l'écran voulu est là.
  if (expect) await page.locator(expect).first().waitFor({ state: "visible", timeout: 15_000 });

  // 2. Aucun indicateur de chargement visible.
  await page
    .locator('[aria-busy="true"], [role="progressbar"], .animate-pulse')
    .first()
    .waitFor({ state: "hidden", timeout: 10_000 })
    .catch(() => {});

  // 3. Polices chargées : sans ça, la première capture d'une session sort
  // avec la police de repli et un métrage différent.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
}

/** Enregistre une capture, en créant l'arborescence au besoin. */
export async function shoot(target, outPath, options = {}) {
  await mkdir(dirname(outPath), { recursive: true });
  await target.screenshot({ path: outPath, animations: "disabled", ...options });
  return outPath;
}

export { CAPTURE };
