/**
 * featurePalette — la palette ⌘K ouverte sur le board d'Aurora.
 *
 * Voir `intent.md` pour ce que l'image doit porter.
 *
 * Ce que l'inspection a appris :
 *   - la palette s'ouvre bien avec `Meta+K` ;
 *   - la REQUÊTE TAPÉE change tout, et ce qu'elle remonte VIEILLIT. « ticket »
 *     / « issue » donnait l'image voulue en juillet ; depuis, l'export CSV et
 *     les entrées de réglages sont venus grossir les groupes d'actions, et ils
 *     ont poussé le groupe « Tickets » sous la ligne de flottaison. La palette
 *     ne remontait plus que de la navigation — l'exact contraire de l'`alt` de
 *     l'emplacement, « une recherche qui remonte tickets ET actions » ;
 *   - « board » remonte les deux, et tient dans la hauteur de la liste : une
 *     page (le board public) et quatre tickets dont le titre porte le mot ;
 *   - c'est en outre le MÊME mot dans les deux langues, là où « ticket » avait
 *     besoin d'être traduit en « issue ». Une requête de moins à maintenir.
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

/**
 * La requête tapée. Le même mot dans les deux langues : il est anglais dans les
 * titres de tickets du monde de démo, et il est aussi le nom du board public
 * côté interface — c'est ce qui lui fait remonter une page ET des tickets.
 */
const QUERY = { fr: "board", en: "board" };

/**
 * Un résultat de ticket se reconnaît à son identifiant. Sans limite de mot en
 * tête : le titre et l'identifiant sont deux nœuds voisins, donc le texte
 * concaténé de la ligne dit « …from the boardAUR-5 » — il n'y a pas de
 * frontière de mot entre « d » et « A », et un `\b` ne matcherait jamais.
 */
const ISSUE_ROW = /[A-Z]{2,4}-\d+/;

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
    // recherche est asynchrone et la palette s'affiche vide en attendant. Le
    // dernier résultat attendu est un ticket, et c'est lui qui met le plus de
    // temps à venir — les actions sont locales, la recherche de tickets non.
    await page
      .getByRole("option")
      .filter({ hasText: ISSUE_ROW })
      .nth(3)
      .waitFor({ state: "visible", timeout: 10_000 });

    /**
     * Ce que l'image doit porter, vérifié sur ce qui est RÉELLEMENT DANS LE
     * CADRE — un résultat sous la ligne de flottaison de la liste ne se voit
     * pas plus qu'un résultat absent.
     *
     * L'ancien contrôle comptait les résultats (« au moins 7 ») : il est resté
     * vert pendant que le groupe « Tickets » sortait du cadre, poussé dehors
     * par deux entrées d'action neuves. Compter ne dit rien de ce qu'on voit.
     */
    const check = await page.evaluate((pattern) => {
      const list = document.querySelector('[role="listbox"]');
      const bottom = list?.getBoundingClientRect().bottom ?? 0;
      const rows = [...document.querySelectorAll('[role="option"]')].map((el) => ({
        text: el.textContent || "",
        visible: el.getBoundingClientRect().bottom <= bottom + 1,
      }));
      const re = new RegExp(pattern);
      return {
        issues: rows.filter((r) => r.visible && re.test(r.text)).length,
        actions: rows.filter((r) => r.visible && !re.test(r.text)).length,
        clipped: rows.filter((r) => !r.visible).map((r) => r.text.trim().slice(0, 40)),
      };
    }, ISSUE_ROW.source);

    if (check.issues < 3 || check.actions < 1) {
      throw new Error(
        `${locale}/${theme} — la palette montre ${check.actions} action(s) et ${check.issues} ` +
          `ticket(s) dans le cadre pour « ${QUERY[locale]} ». L'emplacement promet les DEUX ` +
          `(« une recherche qui remonte tickets et actions ») : change la requête.`,
      );
    }
    if (check.clipped.length > 0) {
      throw new Error(
        `${locale}/${theme} — ${check.clipped.length} résultat(s) coupé(s) par le bas de la ` +
          `liste : ${check.clipped.join(" · ")}. Une ligne tranchée se lit comme une image cassée.`,
      );
    }
    const results = check.issues + check.actions;

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
