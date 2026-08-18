/**
 * heroBoard — Aurora's board, capturing the hero of the landing.
 *
 * See `intent.md` for what the image should carry.
 *
 * What the inspection learned, and which explains the choices below:
 * - the route is `/projects/<id>`, not `/projects/<id>/board` ;
 * - the board is a KANBAN, grouped by status by default. The “list view”
 * of the catalog instruction does not exist in the product;
 * - the columns are 352 px with a fixed pitch of 364, from 280: the edges
 * rights fall to 632, 996, 1360, 1724… The width 1736 therefore stops
 * in the gutter after the 4th column, instead of cutting a card;
 * - there is no `data-testid` on this screen. The waiting anchor is
 * therefore the identifier of a ticket, which does not change from one language to another.
 *
 * node captures/shots/hero-board/shot.mjs # produces the PNGs
 * node captures/shots/hero-board/shot.mjs --publish # + book on the landing
 *
 * The target is set by CAPTURE_BASE_URL (default localhost):
 *   CAPTURE_BASE_URL=https://www.minddy.app node captures/shots/hero-board/shot.mjs
 */
import { openPage, settle, shoot, CAPTURE, DEFAULT_VIEW_NAMES } from "../../lib/browser.mjs";
import { publishShot, writeManifest } from "../../lib/publish.mjs";

const SLOT = "heroBoard";
const OUT = "captures/shots/hero-board/out";
const AURORA = "6cd36606-c297-4920-8ce3-31b5f3697be8";

/** 16/10, positioned on the gutter which follows the 4th column. See intent.md. */
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

    // Language independent anchor: a ticket ID. Wait for a
    // translated wording would cause the English variant to fail silently.
    await settle(page, { expect: "text=AUR-1" });

    // The tab bar comes from a SEPARATE query from the tickets one, and
    // she arrives later. Without this wait, the catch leaves while the bar
    // is still empty: the previous run output an image without “All” or
    // “My tickets”, without any error indicating it.
    await page
      .getByRole("button", { name: DEFAULT_VIEW_NAMES[locale], exact: true })
      .waitFor({ state: "visible", timeout: 15_000 });

    // Checks BEFORE taking. An empty loaded board, or a sliced ​​column
    // from the right edge, would produce a green and unusable image — as much
    // fail here, where the message says what to fix.
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
