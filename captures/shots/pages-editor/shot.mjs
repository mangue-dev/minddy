/**
 * pagesEditor — la page « Release process » du wiki d'Aurora, telle qu'on la lit.
 *
 * Voir `intent.md`. Deux points qui ne s'improvisent pas :
 *
 *  - la cible est l'env de PREVIEW (les pages ne sont pas encore en
 *    production), d'où `CAPTURE_BASE_URL` ci-dessous et une session prise sur
 *    le même hôte ;
 *  - la souris est écartée du corps avant la prise : le survol d'un bloc pose
 *    une poignée dans sa marge, et l'intention exige une page qu'on lit, pas un
 *    éditeur qu'on manipule.
 *
 *   CAPTURE_BASE_URL=https://preview.minddy.app node captures/lib/session.mjs
 *   CAPTURE_BASE_URL=https://preview.minddy.app node captures/shots/pages-editor/shot.mjs
 *   CAPTURE_BASE_URL=https://preview.minddy.app node captures/shots/pages-editor/shot.mjs --publish
 */
import { openPage, settle, shoot, CAPTURE } from "../../lib/browser.mjs";
import { publishShot, writeManifest } from "../../lib/publish.mjs";

const SLOT = "pagesEditor";
const OUT = "captures/shots/pages-editor/out";
const AURORA = "6cd36606-c297-4920-8ce3-31b5f3697be8";
/** « Release process », sous « Product handbook » — 014-pages-aurora.mjs. */
const PAGE = "cd3ee91e-ad73-423c-bb99-9f81722f8912";

/** 16/10, comme les autres emplacements de ce rapport. */
const VIEWPORT = { width: 1736, height: 1085 };

/** Les titres de pages et le ticket cité sont des DONNÉES : anglais dans les
    quatre variantes, et donc utilisables comme ancres de contrôle. */
const SUBPAGES = ["Release process", "Design principles", "Support playbook"];
const MENTION = "AUR-2";
const TASK_COUNT = 5;
const DONE_COUNT = 2;

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
    await page.goto(`${CAPTURE.baseUrl}/projects/${AURORA}/pages/${PAGE}`, {
      waitUntil: "domcontentloaded",
    });

    // L'ancre est la PILULE, pas le titre : le titre est rendu par le serveur,
    // la pilule ne l'est qu'une fois le corps monté dans l'éditeur. Attendre le
    // titre laisserait photographier un document encore vide.
    await settle(page, { expect: `a:has-text("${MENTION}")` });

    // La souris part dans un coin haut, hors de l'arbre comme du corps : la
    // position par défaut (0,0) est déjà hors du texte, mais un survol résiduel
    // d'un run précédent ne se nettoie pas tout seul.
    await page.mouse.move(VIEWPORT.width - 4, 4);

    const check = await page.evaluate(
      ({ subpages, mention, expected }) => {
        const main = document.querySelector("main");
        // `li[data-type="taskItem"]` et pas `li` : la page porte aussi une
        // liste à puces, et compter tous les `li` mêlerait les deux.
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
          // La pilule est une ANCRE vers le ticket : du texte brut voudrait dire
          // que la mention a été stockée en texte, pas en nœud.
          pill: [...document.querySelectorAll("main a")].some(
            (a) => (a.textContent || "").trim() === mention,
          ),
          // Rien d'ouvert : ni menu, ni infobulle, ni poignée de bloc.
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
