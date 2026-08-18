/**
 * featureCycle — Camille's fortnight, tickets from two mixed projects.
 *
 * See `intent.md`, in particular for the offset of a column: trimmed to the edge
 * left, the board would open on an empty column and leave the 5
 * tickets completed off-camera.
 *
 * node captures/shots/cycle/shot.mjs # produces the PNGs
 * node captures/shots/cycle/shot.mjs --publish # + book on the landing
 */
import { openPage, settle, shoot, CAPTURE } from "../../lib/browser.mjs";
import { publishShot, writeManifest } from "../../lib/publish.mjs";

const SLOT = "featureCycle";
const OUT = "captures/shots/cycle/out";
const VIEWPORT = { width: 1736, height: 1085 };

/** Not one column of the board: 352 px wide + 12 px gutter. */
const COLUMN_PITCH = 364;

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
    await page.goto(`${CAPTURE.baseUrl}/all?view=cycle`, { waitUntil: "domcontentloaded" });

    // Language-independent anchor: a ticket from Beacon, which is not in the
    // cycle only because it is cross-project. If it is missing, the image does not show
    // pas ce qu'elle doit montrer.
    await settle(page, { expect: "text=BCN-8" });

    // The rings come from a separate calculation: without them the header is bare.
    await page.locator("main").getByText("%", { exact: false }).first()
      .waitFor({ state: "visible", timeout: 15_000 });

    // Offset by one column step, in the horizontally scrolling container.
    const scrolled = await page.evaluate((pitch) => {
      const el = [...document.querySelectorAll("main *")]
        .find((e) => e.scrollWidth > e.clientWidth + 100);
      if (!el) return null;
      el.scrollLeft = pitch;
      return { applied: el.scrollLeft, max: el.scrollWidth - el.clientWidth };
    }, COLUMN_PITCH);

    if (!scrolled || scrolled.applied !== COLUMN_PITCH) {
      throw new Error(
        `${locale}/${theme} — défilement impossible (${JSON.stringify(scrolled)}). ` +
          `La colonne vide serait au premier plan.`,
      );
    }

    // Control of framing AFTER scrolling, as for the hero's board.
    const check = await page.evaluate(() => {
      const heads = [...document.querySelectorAll("main h2")];
      const columns = heads.map((h) => {
        let el = h;
        while (el && el.getBoundingClientRect().width < 200) el = el.parentElement;
        const r = el.getBoundingClientRect();
        return { name: h.textContent.trim(), left: r.left, right: r.right };
      });
      const visible = columns.filter((c) => c.right > 0 && c.left < window.innerWidth);
      return {
        visible: visible.map((c) => c.name),
        straddling: columns
          .filter((c) => c.left < window.innerWidth && c.right > window.innerWidth)
          .map((c) => c.name),
        // The name of the project prefixes the identifier on each card on the board
        // cross-project. We look for it in all the visible text, without
        // anchor it: the internal structure of the card does not have to be guessed.
        projects: [...new Set(
          (document.querySelector("main")?.textContent || "")
            .match(/Aurora|Beacon/g) || [],
        )],
      };
    });

    if (check.straddling.length > 0) {
      throw new Error(`${locale}/${theme} — colonne coupée : ${check.straddling.join(", ")}`);
    }
    if (check.projects.length < 2) {
      throw new Error(
        `${locale}/${theme} — un seul projet visible (${check.projects.join(", ") || "aucun"}). ` +
          `Le cycle doit montrer son caractère cross-projet.`,
      );
    }

    const path = `${OUT}/${locale}-${theme}.png`;
    await shoot(page, path);
    return { path, locale, theme, columns: check.visible, projects: check.projects };
  } finally {
    await browser.close();
  }
}

const results = [];
for (const variant of VARIANTS) {
  const r = await capture(variant);
  console.log(`  ${r.locale}/${r.theme} → ${r.path} · ${r.projects.join(" + ")} · ${r.columns.join(", ")}`);
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
