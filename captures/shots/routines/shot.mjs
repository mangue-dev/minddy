/**
 * routines — the Routines tab with the weekly security review selected.
 *
 * See `intent.md`. The demo routines are seeded DISABLED
 * (captures/world/seed/016-routines.mjs): the capture must show the
 * “paused” badge and the switch OFF, and must never turn them on.
 *
 * node captures/shots/routines/shot.mjs          # produces the PNGs
 * node captures/shots/routines/shot.mjs --publish # + books on the landing
 */
import { openPage, settle, shoot, CAPTURE, CAPTURE_VARIANTS } from "../../lib/browser.mjs";
import { publishShot, writeManifest } from "../../lib/publish.mjs";

const SLOT = "routines";
const OUT = "captures/shots/routines/out";
const VIEWPORT = { width: 1447, height: 1085 };

const PUBLISH = process.argv.includes("--publish");
const VARIANTS = CAPTURE_VARIANTS;

/**
 * The selected routine, by title — the title is DATA (seeded identically in
 * every locale), the cadence and status lines around it are translated.
 */
const ROUTINE = "Weekly security review";

async function capture({ locale, theme }) {
  const { browser, page } = await openPage({ theme, locale, viewport: VIEWPORT });
  try {
    await page.goto(`${CAPTURE.baseUrl}/routines`, { waitUntil: "domcontentloaded" });
    await settle(page, { expect: `text=${ROUTINE}` });

    // Nothing is selected on arrival: the main pane shows the “pick a
    // routine” hint. The click is what makes the shot.
    await page.getByRole("button", { name: new RegExp(ROUTINE) }).first().click();

    // The runs table is the payload: 4 passages, header row aside.
    await page.getByRole("table").waitFor({ state: "visible", timeout: 15_000 });
    const rowCount = await page.getByRole("table").getByRole("row").count();
    if (rowCount !== 5) {
      throw new Error(
        `${locale}/${theme} — la table d'exécutions affiche ${rowCount - 1} passage(s) au lieu de 4.`,
      );
    }

    // Nothing must remain under the cursor: rows and list items have a hover.
    await page.mouse.move(600, 60);
    await page.waitForTimeout(400);

    const path = `${OUT}/${locale}-${theme}.png`;
    await shoot(page, path);
    return { path, locale, theme };
  } finally {
    await browser.close();
  }
}

const results = [];
for (const variant of VARIANTS) {
  const r = await capture(variant);
  console.log(`  ${r.locale}/${r.theme} → ${r.path}`);
  results.push(r);
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
