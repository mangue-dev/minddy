/**
 * featurePalette — la palette ⌘K ouverte sur le board d'Aurora.
 *
 * Voir `intent.md` pour ce que l'image doit porter.
 *
 * Ce que l'inspection a appris :
 *   - la palette s'ouvre bien avec `Meta+K` ;
 *   - la REQUÊTE TAPÉE change tout. « dark » ne remonte que 2 lignes, « issue »
 *     en français n'en remonte que 3 et aucune action. C'est « ticket » qui
 *     donne l'image voulue : 4 groupes (Créer, Aller à, Pages, Tickets), des
 *     actions ET des tickets ;
 *   - « ticket » est le mot français. En anglais, les libellés d'action disent
 *     « issue » : la requête suit donc la langue, exactement comme le
 *     vocabulaire de l'application (Ticket en FR, Issue en EN).
 *
 *   node captures/shots/palette/shot.mjs             # produit les PNG
 *   node captures/shots/palette/shot.mjs --publish   # + livre sur la landing
 */
import { openPage, settle, shoot, CAPTURE, DEFAULT_VIEW_NAMES } from "../../lib/browser.mjs";
import { publishShot, writeManifest } from "../../lib/publish.mjs";

const SLOT = "featurePalette";
const OUT = "captures/shots/palette/out";
const AURORA = "6cd36606-c297-4920-8ce3-31b5f3697be8";

/** Même fenêtre que heroBoard : les deux images doivent avoir la même échelle. */
const VIEWPORT = { width: 1736, height: 1085 };

/** Le mot que l'app elle-même emploie pour « issue » dans chaque langue. */
const QUERY = { fr: "ticket", en: "issue" };

const PUBLISH = process.argv.includes("--publish");
const VARIANTS = [
  { locale: "fr", theme: "light" },
  { locale: "fr", theme: "dark" },
  { locale: "en", theme: "light" },
  { locale: "en", theme: "dark" },
];

async function capture({ locale, theme }) {
  const { browser, page } = await openPage({ theme, locale, viewport: VIEWPORT });
  try {
    await page.goto(`${CAPTURE.baseUrl}/projects/${AURORA}`, { waitUntil: "domcontentloaded" });
    await settle(page, { expect: "text=AUR-1" });

    // Le board doit être ENTIÈREMENT rendu avant d'ouvrir la palette : c'est
    // lui qu'on verra derrière, et une barre d'onglets vide se remarquerait
    // autant ici que sur la capture du hero.
    await page
      .getByRole("button", { name: DEFAULT_VIEW_NAMES[locale], exact: true })
      .waitFor({ state: "visible", timeout: 15_000 });

    await page.keyboard.press("Meta+k");
    const dialog = page.getByRole("dialog").first();
    await dialog.waitFor({ state: "visible", timeout: 10_000 });

    // On tape DANS le champ, pas au clavier global : la palette s'anime encore
    // à l'ouverture, et une frappe globale perd les premiers caractères — un
    // run a produit « ssue » au lieu de « issue ». `pressSequentially` attend
    // que l'élément soit prêt avant chaque touche.
    const input = dialog.getByRole("textbox").first();
    await input.waitFor({ state: "visible", timeout: 10_000 });
    await input.pressSequentially(QUERY[locale], { delay: 60 });

    const typed = await input.inputValue();
    if (typed !== QUERY[locale]) {
      throw new Error(
        `${locale}/${theme} — la recherche affiche « ${typed} » au lieu de « ${QUERY[locale]} ».`,
      );
    }

    // On attend que la liste se soit REMPLIE, pas un délai arbitraire : la
    // recherche est asynchrone et la palette s'affiche vide en attendant.
    await page
      .getByRole("option")
      .nth(6)
      .waitFor({ state: "visible", timeout: 10_000 });

    const results = await page.getByRole("option").count();
    if (results < 7) {
      throw new Error(
        `${locale}/${theme} — la palette ne remonte que ${results} résultats pour « ${QUERY[locale]} ». ` +
          `L'image ne montrerait ni actions ni tickets.`,
      );
    }

    const path = `${OUT}/${locale}-${theme}.png`;
    await shoot(page, path);
    return { path, results, locale, theme };
  } finally {
    await browser.close();
  }
}

const results = [];
for (const variant of VARIANTS) {
  const result = await capture(variant);
  console.log(`  ${result.locale}/${result.theme} → ${result.path} (${result.results} résultats)`);
  results.push(result);
}

if (PUBLISH) {
  console.log("\nLivraison sur la landing :");
  for (const { locale, theme, path } of results) {
    const published = await publishShot({ slot: SLOT, lang: locale, theme, input: path });
    console.log(`  ${published.name} — ${(published.bytes / 1024).toFixed(0)} Ko`);
  }
  const { published } = await writeManifest();
  console.log(`\nManifeste : ${published.length} variante(s) publiée(s).`);
} else {
  console.log("\nRegarde les images, puis relance avec --publish pour les livrer.");
}
