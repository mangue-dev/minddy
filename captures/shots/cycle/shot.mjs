/**
 * featureCycle — la quinzaine de Camille, tickets de deux projets mêlés.
 *
 * Voir `intent.md`, notamment pour le décalage d'une colonne : cadré au bord
 * gauche, le board s'ouvrirait sur une colonne vide et laisserait les 5
 * tickets terminés hors champ.
 *
 *   node captures/shots/cycle/shot.mjs             # produit les PNG
 *   node captures/shots/cycle/shot.mjs --publish   # + livre sur la landing
 */
import { openPage, settle, shoot, CAPTURE } from "../../lib/browser.mjs";
import { publishShot, writeManifest } from "../../lib/publish.mjs";

const SLOT = "featureCycle";
const OUT = "captures/shots/cycle/out";
const VIEWPORT = { width: 1736, height: 1085 };

/** Pas d'une colonne du board : 352 px de large + 12 px de gouttière. */
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

    // Ancre indépendante de la langue : un ticket de Beacon, qui n'est dans le
    // cycle que parce qu'il est cross-projet. S'il manque, l'image ne montre
    // pas ce qu'elle doit montrer.
    await settle(page, { expect: "text=BCN-8" });

    // Les anneaux viennent d'un calcul séparé : sans eux, l'en-tête est nu.
    await page.locator("main").getByText("%", { exact: false }).first()
      .waitFor({ state: "visible", timeout: 15_000 });

    // Décalage d'un pas de colonne, dans le conteneur qui défile horizontalement.
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

    // Contrôle du cadrage APRÈS défilement, comme pour le board du hero.
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
        // Le nom du projet préfixe l'identifiant sur chaque carte du board
        // cross-projet. On le cherche dans tout le texte visible, sans
        // l'ancrer : la structure interne de la carte n'a pas à être devinée.
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
