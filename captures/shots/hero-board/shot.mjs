/**
 * heroBoard — le board d'Aurora, capture du hero de la landing.
 *
 * Voir `intent.md` pour ce que l'image doit porter.
 *
 * Ce que l'inspection a appris, et qui explique les choix ci-dessous :
 *   - la route est `/projects/<id>`, pas `/projects/<id>/board` ;
 *   - le board est un KANBAN, groupé par statut par défaut. La « vue liste »
 *     de la consigne du catalogue n'existe pas dans le produit ;
 *   - les colonnes font 352 px à pas fixe de 364, à partir de 280 : les bords
 *     droits tombent à 632, 996, 1360, 1724… La largeur 1736 s'arrête donc
 *     dans la gouttière après la 4ᵉ colonne, au lieu de trancher une carte ;
 *   - il n'existe aucun `data-testid` sur cet écran. L'ancre d'attente est
 *     donc l'identifiant d'un ticket, qui ne change pas d'une langue à l'autre.
 *
 *   node captures/shots/hero-board/shot.mjs             # produit les PNG
 *   node captures/shots/hero-board/shot.mjs --publish   # + livre sur la landing
 *
 * La cible se règle par CAPTURE_BASE_URL (par défaut localhost) :
 *   CAPTURE_BASE_URL=https://www.minddy.app node captures/shots/hero-board/shot.mjs
 */
import { openPage, settle, shoot, CAPTURE, DEFAULT_VIEW_NAMES } from "../../lib/browser.mjs";
import { publishShot, writeManifest } from "../../lib/publish.mjs";

const SLOT = "heroBoard";
const OUT = "captures/shots/hero-board/out";
const AURORA = "6cd36606-c297-4920-8ce3-31b5f3697be8";

/** 16/10, calé sur la gouttière qui suit la 4ᵉ colonne. Voir intent.md. */
const VIEWPORT = { width: 1736, height: 1085 };

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

    // Ancre indépendante de la langue : un identifiant de ticket. Attendre un
    // libellé traduit ferait échouer la variante anglaise en silence.
    await settle(page, { expect: "text=AUR-1" });

    // La barre d'onglets vient d'une requête SÉPARÉE de celle des tickets, et
    // elle arrive après. Sans cette attente, la prise part pendant que la barre
    // est encore vide : le run précédent a sorti une image sans « Toutes » ni
    // « Mes tickets », sans qu'aucune erreur ne le signale.
    await page
      .getByRole("button", { name: DEFAULT_VIEW_NAMES[locale], exact: true })
      .waitFor({ state: "visible", timeout: 15_000 });

    // Contrôles AVANT la prise. Un board chargé vide, ou une colonne tranchée
    // par le bord droit, produiraient une image verte et inutilisable — autant
    // échouer ici, où le message dit quoi corriger.
    const check = await page.evaluate(() => {
      const heads = [...document.querySelectorAll("main h2")];
      const columns = heads.map((h) => {
        let el = h;
        while (el && el.getBoundingClientRect().width < 200) el = el.parentElement;
        const r = el.getBoundingClientRect();
        return { name: h.textContent.trim(), left: r.left, right: r.right };
      });
      return {
        entire: columns.filter((c) => c.right <= window.innerWidth).length,
        straddling: columns
          .filter((c) => c.left < window.innerWidth && c.right > window.innerWidth)
          .map((c) => c.name),
        cards: document.querySelectorAll("main p").length,
      };
    });

    if (check.straddling.length > 0) {
      throw new Error(
        `${locale}/${theme} — la colonne « ${check.straddling.join(", ")} » est coupée par le ` +
          `bord droit. La largeur des colonnes a changé : remesure la géométrie (voir intent.md).`,
      );
    }
    if (check.entire < 4) {
      throw new Error(`${locale}/${theme} — ${check.entire} colonnes entières au lieu de 4.`);
    }
    if (check.cards < 13) {
      throw new Error(`${locale}/${theme} — board incomplet, ${check.cards} lignes de texte.`);
    }

    const path = `${OUT}/${locale}-${theme}.png`;
    await shoot(page, path);
    return { path, entire: check.entire, locale, theme };
  } finally {
    await browser.close();
  }
}

const results = [];
for (const variant of VARIANTS) {
  const result = await capture(variant);
  console.log(`  ${result.locale}/${result.theme} → ${result.path} (${result.entire} colonnes entières)`);
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
