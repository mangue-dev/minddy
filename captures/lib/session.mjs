/**
 * captures/ — session du compte de démo.
 *
 * On se connecte UNE fois par l'interface réelle, et on réutilise l'état
 * (cookies + localStorage) pour toutes les captures suivantes. Ça évite N
 * connexions simultanées sur le même compte, que n'importe quel fournisseur
 * d'auth finit par freiner.
 *
 *   node captures/lib/session.mjs
 */
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium } from "playwright";
import { CAPTURE, DEMO_EMAIL } from "./config.mjs";
import { loadEnv, requireEnv } from "./env.mjs";
import { AUTH_STATE } from "./browser.mjs";

export async function refreshSession() {
  loadEnv();
  const password = requireEnv("CAPTURES_DEMO_PASSWORD");

  const browser = await chromium.launch();
  const context = await browser.newContext({ locale: "fr-FR" });
  const page = await context.newPage();

  // `load`, pas `domcontentloaded` : le bouton est un `type="submit"` dans un
  // vrai `<form>`, et cliquer avant que React ait pris la main déclenche la
  // soumission NATIVE — le navigateur part en `GET /login?`, la page se
  // recharge, et l'attente d'URL expire sans le moindre message d'erreur.
  await page.goto(`${CAPTURE.baseUrl}/login`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);

  const submit = page.getByRole("button", { name: /connexion|se connecter|sign in|log in/i });
  const leftAuth = (url) => !/\/(login|signup)/.test(url.pathname);

  // Aucun marqueur d'hydratation n'est exposé par Next : plutôt qu'un timer
  // arbitraire, on retente. Un clic parti trop tôt se voit — on est toujours
  // sur /login — et le suivant tombe sur une page hydratée.
  for (let attempt = 1; ; attempt += 1) {
    await page.getByRole("textbox", { name: /e-?mail/i }).fill(DEMO_EMAIL);
    await page.getByRole("textbox", { name: /mot de passe|password/i }).fill(password);
    await submit.click();

    const ok = await page
      .waitForURL(leftAuth, { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (ok) break;

    if (attempt === 3) {
      const toasts = await page.locator("[data-sonner-toast]").allInnerTexts();
      throw new Error(
        `Connexion au compte de démo impossible après 3 tentatives (${CAPTURE.baseUrl}). ` +
          (toasts.filter(Boolean).join(" · ") ||
            "Aucun message d'erreur à l'écran — vérifier CAPTURES_DEMO_PASSWORD."),
      );
    }
    await page.waitForTimeout(2_000);
  }

  await mkdir(dirname(AUTH_STATE), { recursive: true });
  await context.storageState({ path: AUTH_STATE });
  await browser.close();

  return AUTH_STATE;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  refreshSession()
    .then((p) => console.log(`Session enregistrée : ${p}`))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
