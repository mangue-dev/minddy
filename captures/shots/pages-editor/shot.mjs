/**
 * pagesEditor — the “Release process” page of the Aurora wiki, as it is read.
 *
 * Voir `intent.md`. Deux points qui ne s'improvisent pas :
 *
 * - the target is the PREVIEW environment (the pages are not yet in
 * production), hence `CAPTURE_BASE_URL` below and a session taken on
 * the same host;
 * - the mouse is moved away from the body before taking it: hovering over a block poses
 * a handful in its margin, and the intention requires a page to be read, not a
 * editor that we manipulate.
 *
 *   CAPTURE_BASE_URL=https://preview.minddy.app node captures/lib/session.mjs
 *   CAPTURE_BASE_URL=https://preview.minddy.app node captures/shots/pages-editor/shot.mjs
 *   CAPTURE_BASE_URL=https://preview.minddy.app node captures/shots/pages-editor/shot.mjs --publish
 */
import { openPage, settle, shoot, CAPTURE, CAPTURE_VARIANTS } from "../../lib/browser.mjs";
import { publishShot, writeManifest } from "../../lib/publish.mjs";

const SLOT = "pagesEditor";
const OUT = "captures/shots/pages-editor/out";
const AURORA = "6cd36606-c297-4920-8ce3-31b5f3697be8";
/** « Release process », sous « Product handbook » — 014-pages-aurora.mjs. */
const PAGE = "cd3ee91e-ad73-423c-bb99-9f81722f8912";

/** 16/10, like the other locations in this report. */
const VIEWPORT = { width: 1736, height: 1085 };

/** Page titles and cited ticket are DATA: English in the
 four variants, and therefore usable as control anchors. */
const SUBPAGES = ["Release process", "Design principles", "Support playbook"];
const MENTION = "AUR-2";
const TASK_COUNT = 5;
const DONE_COUNT = 2;

const PUBLISH = process.argv.includes("--publish");
const VARIANTS = CAPTURE_VARIANTS;

async function capture({ locale, theme }) {
  const { browser, page } = await openPage({ theme, locale, viewport: VIEWPORT });
  try {
    await page.goto(`${CAPTURE.baseUrl}/projects/${AURORA}/pages/${PAGE}`, {
      waitUntil: "domcontentloaded",
    });

    // The anchor is the PILL, not the title: the title is rendered by the server,
    // the pill is only added once the body is mounted in the editor. Wait for it
    // titre laisserait photographier un document encore vide.
    await settle(page, { expect: `a:has-text("${MENTION}")` });

    // The mouse goes to a high corner, outside the tree and the body: the
    // default position (0,0) is already out of the text, but a residual hover
    // from a previous run does not clean itself.
    await page.mouse.move(VIEWPORT.width - 4, 4);

    const check = await page.evaluate(
      ({ subpages, mention, expected }) => {
        const main = document.querySelector("main");
        // `li[data-type="taskItem"]` and not `li`: the page also carries a
        // bulleted list, and counting all `li` would mix the two.
        const items = [...(main?.querySelectorAll('li[data-type="taskItem"]') || [])];
        const struck = items.filter((el) =>
          [el, ...el.querySelectorAll("*")].some((n) =>
            getComputedStyle(n).textDecorationLine.includes("line-through"),
          ),
        ).length;
        const tree = document.querySelectorAll('[aria-label], aside, [data-slot]');
        const treeText = [...tree].map((el) => el.textContent || "").join(" ");
        return {
          tasks: items.length,
          struck,
          expected,
          missingSubpages: subpages.filter((t) => !treeText.includes(t)),
          // The pill is an ANCHOR to the ticket: plain text would mean
          // that the mention was stored as text, not as a node.
          pill: [...document.querySelectorAll("main a")].some(
            (a) => (a.textContent || "").trim() === mention,
          ),
          // Nothing open: no menu, no tooltip, no block handle.
          open: document.querySelectorAll(
            '[role="menu"], [role="dialog"], [data-radix-popper-content-wrapper]',
          ).length,
        };
      },
      { subpages: SUBPAGES, mention: MENTION, expected: TASK_COUNT },
    );

    if (check.missingSubpages.length > 0) {
      throw new Error(
        `${locale}/${theme} — sous-page(s) absente(s) de l'arbre : ` +
          `${check.missingSubpages.join(", ")}. Le parent n'est pas déplié, ou ` +
          `relancer captures/world/seed/014-pages-aurora.mjs.`,
      );
    }
    if (check.tasks !== TASK_COUNT) {
      throw new Error(
        `${locale}/${theme} — ${check.tasks} tâches au lieu de ${TASK_COUNT}. ` +
          `Le corps de la page n'est pas celui du seed.`,
      );
    }
    if (check.struck !== DONE_COUNT) {
      throw new Error(
        `${locale}/${theme} — ${check.struck} tâche(s) barrée(s) au lieu de ` +
          `${DONE_COUNT} : les deux cases cochées ne se lisent pas.`,
      );
    }
    if (!check.pill) {
      throw new Error(
        `${locale}/${theme} — pas de pilule « ${MENTION} » dans le corps : la ` +
          `mention est sortie en texte brut.`,
      );
    }
    if (check.open > 0) {
      throw new Error(
        `${locale}/${theme} — ${check.open} surface(s) ouverte(s) à l'écran ` +
          `(menu, infobulle ou modale). L'intention demande une page qu'on lit.`,
      );
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
    `  ${r.locale}/${r.theme} → ${r.path} · ${r.tasks} tâches dont ${r.struck} cochées, pilule ${MENTION}`,
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
