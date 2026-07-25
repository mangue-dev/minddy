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

        // Bandeau cookies : sans choix enregistré, il se pose en bas de TOUTES
        // les pages et se retrouve sur toutes les captures. On répond
        // « declined » plutôt qu'« accepted » — un robot de capture n'a rien à
        // envoyer aux analytics. Clé et valeurs : lib/cookie-consent.ts.
        localStorage.setItem("cookie_consent", "declined");
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

  await alignStoredViewNames(context, locale);

  const page = await context.newPage();
  return { browser, context, page };
}

/**
 * Noms de vues traduits UNE FOIS, à la création, puis figés en base.
 *
 * `ensureBaselineViews` (lib/server/views.ts) crée les vues de départ avec le
 * libellé traduit dans la langue de la requête, et l'écrit dans la table
 * `views`. Ce n'est donc plus une traduction mais une donnée : le compte de
 * démo ayant vu son premier board en français, la capture ANGLAISE affichait
 * un onglet « Toutes » au milieu d'une interface anglaise.
 *
 * On réécrit la réponse de l'API en vol, pour que le libellé corresponde à la
 * langue de la capture. Deux raisons de faire ça ici plutôt qu'en base :
 *   - aucune écriture en production, donc rien à défaire ni à surveiller ;
 *   - l'image montre ce qu'un vrai utilisateur de cette langue verrait — chez
 *     lui, la vue aurait été créée dans SA langue.
 *
 * Seules les vues `custom` sont concernées : celles de type `my` sont
 * réétiquetées par l'interface d'après leur `kind`, jamais d'après leur nom.
 */
export const DEFAULT_VIEW_NAMES = {
  // Board.defaultViewName dans messages/<locale>.json
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
