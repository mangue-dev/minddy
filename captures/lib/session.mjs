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

  await page.goto(`${CAPTURE.baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: /e-?mail/i }).fill(DEMO_EMAIL);
  await page.getByRole("textbox", { name: /mot de passe|password/i }).fill(password);
  await page.getByRole("button", { name: /connexion|se connecter|sign in|log in/i }).click();

  // On attend d'être sorti des routes d'auth, pas un timer arbitraire.
  await page.waitForURL((url) => !/\/(login|signup)/.test(url.pathname), { timeout: 20_000 });

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
