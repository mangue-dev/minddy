/**
 * scratchpad — le carnet de tâches de Camille, ouvert par G puis N.
 *
 * Voir `intent.md`, notamment pour la fenêtre : c'est la seule capture qui ne
 * prend pas 1447 × 1085, parce que la modale fait 90vw × 90vh quand son contenu
 * a des métriques fixes.
 *
 *   node captures/shots/carnet/shot.mjs             # produit les PNG
 *   node captures/shots/carnet/shot.mjs --publish   # + livre sur la landing
 */
import { openPage, settle, shoot, CAPTURE } from "../../lib/browser.mjs";
import { publishShot, writeManifest } from "../../lib/publish.mjs";

const SLOT = "scratchpad";
const OUT = "captures/shots/carnet/out";
const AURORA = "6cd36606-c297-4920-8ce3-31b5f3697be8";

/** 4/3. Plus petit que les autres captures : voir `intent.md`, § Cadrage. */
const VIEWPORT = { width: 1024, height: 768 };

/** Les titres de section sont des données — anglais dans les deux variantes. */
const SECTIONS = ["Before the release", "Loose ends"];
const TASK_COUNT = 9;

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

    // Le raccourci que la landing cite mot pour mot. On le tape sur un board
    // stabilisé, avant toute surface ouverte : rien à perdre au clavier.
    await page.keyboard.press("g");
    await page.keyboard.press("n");

    const modal = page.getByRole("dialog").first();
    await modal.waitFor({ state: "visible", timeout: 10_000 });

    // Attendre le DOCUMENT, pas seulement la modale : la note arrive par une
    // requête, et les boutons de section sont des décorations ProseMirror que
    // l'application du contenu recrée. Survoler avant ce moment perd le survol.
    await page.getByText(SECTIONS[1], { exact: true }).waitFor({ state: "visible", timeout: 10_000 });

    const launch = page.locator(".scratchpad-section-launch");
    await launch.nth(1).waitFor({ state: "attached", timeout: 10_000 });

    const check = await page.evaluate(
      ({ sections, expected }) => {
        const dialog = document.querySelector('[role="dialog"]');
        const text = dialog?.textContent || "";
        const tasks = dialog?.querySelectorAll("ul li, ol li") || [];
        const struck = [...tasks].filter((el) =>
          [...el.querySelectorAll("*"), el].some((n) =>
            getComputedStyle(n).textDecorationLine.includes("line-through"),
          ),
        ).length;
        return {
          missing: sections.filter((s) => !text.includes(s)),
          tasks: tasks.length,
          struck,
          expected,
        };
      },
      { sections: SECTIONS, expected: TASK_COUNT },
    );

    if (check.missing.length > 0) {
      throw new Error(
        `${locale}/${theme} — section(s) absente(s) : ${check.missing.join(", ")}. ` +
          `Le carnet de démo a changé, ou la note ne s'est pas chargée.`,
      );
    }
    if (check.tasks !== TASK_COUNT) {
      throw new Error(
        `${locale}/${theme} — ${check.tasks} tâches au lieu de ${TASK_COUNT}. ` +
          `Relancer captures/world/seed/005-carnet.mjs, ou corriger l'intention.`,
      );
    }
    if (check.struck < 3) {
      throw new Error(
        `${locale}/${theme} — ${check.struck} tâche(s) barrée(s) : les états ne se ` +
          `distinguent pas assez à l'œil.`,
      );
    }
    // Le survol vient EN DERNIER, juste avant la prise, et il est vérifié en un
    // seul instant : le fond de section et l'infobulle sont posés ensemble par
    // `mouseenter`, mais une dernière passe de rendu de l'éditeur recrée le
    // widget sous le curseur — le navigateur émet alors `mouseleave` sur le
    // nœud retiré et les deux marqueurs disparaissent. Les vérifier l'un après
    // l'autre laissait passer un état à moitié éteint (vu sur fr/dark).
    for (let attempt = 1; ; attempt += 1) {
      await launch.first().hover({ force: true });
      const shown = await page
        .waitForFunction(
          () =>
            !!document.querySelector(".scratchpad-section-box.is-visible") &&
            !!document.querySelector(".scratchpad-section-tip.is-visible"),
          undefined,
          { timeout: 3_000 },
        )
        .then(() => true)
        .catch(() => false);
      if (shown) break;
      if (attempt === 4) {
        throw new Error(
          `${locale}/${theme} — le survol de section ne tient pas après quatre ` +
            `tentatives : ni fond de section ni infobulle. L'image ne montrerait ` +
            `pas l'action de section.`,
        );
      }
      await page.mouse.move(10, 10);
      await page.waitForTimeout(400);
    }

    const path = `${OUT}/${locale}-${theme}.png`;
    await shoot(page, path);
    return { path, locale, theme, tasks: check.tasks, struck: check.struck };
  } finally {
    await browser.close();
  }
}

const results = [];
for (const variant of VARIANTS) {
  const r = await capture(variant);
  console.log(
    `  ${r.locale}/${r.theme} → ${r.path} · ${r.tasks} tâches, ${r.struck} barrées, section survolée`,
  );
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
