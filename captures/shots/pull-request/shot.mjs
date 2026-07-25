/**
 * workflowPr — la pull request de Numo sur AUR-2, onglet Fichiers.
 *
 * Voir `intent.md` : le diff d'une PR est lu EN DIRECT chez GitHub, donc aucune
 * donnée semée ne peut le fabriquer. On ouvre la VRAIE page et on répond à la
 * place du réseau sur trois lectures. Aucune écriture, aucun `pr_number` posé.
 *
 *   node captures/shots/pull-request/shot.mjs             # produit les PNG
 *   node captures/shots/pull-request/shot.mjs --publish   # + livre
 */
import { openPage, settle, shoot, CAPTURE } from "../../lib/browser.mjs";
import { publishShot, writeManifest } from "../../lib/publish.mjs";
import { COMMENTS, FILES, LIST_ITEM, PR, PR_NUMBER, RUN_ID, TOTALS } from "./fixture.mjs";

const SLOT = "workflowPr";
const OUT = "captures/shots/pull-request/out";
const VIEWPORT = { width: 1447, height: 1085 };

const PUBLISH = process.argv.includes("--publish");
const VARIANTS = [
  { locale: "fr", theme: "light" },
  { locale: "fr", theme: "dark" },
  { locale: "en", theme: "light" },
  { locale: "en", theme: "dark" },
];

const json = (route, body) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

/**
 * Les quatre lectures répondues par la capture. On les vise par le CHEMIN EXACT,
 * pas par un glob : `**\/api/agent-runs/*\/pr` attraperait aussi
 * `/pr/review-comments` selon l'ordre d'enregistrement.
 */
async function serveFixture(page) {
  const served = [];

  const on = (test, handler) =>
    page.route(
      (url) => test(url.pathname),
      async (route) => {
        served.push(new URL(route.request().url()).pathname);
        await handler(route);
      },
    );

  await on((p) => p === "/api/pull-requests", (r) => json(r, { pullRequests: [LIST_ITEM] }));
  await on(
    (p) => new RegExp(`^/api/agent-runs/[^/]+/pr$`).test(p),
    (r) => json(r, { pr: PR, files: FILES }),
  );
  await on(
    (p) => new RegExp(`^/api/agent-runs/[^/]+/comments$`).test(p),
    (r) => json(r, { comments: COMMENTS }),
  );
  // Neutralisée plutôt que garnie : en vrai elle appellerait la forge, et son
  // contenu vide est ce qu'elle renverrait de toute façon.
  await on(
    (p) => new RegExp(`^/api/agent-runs/[^/]+/pr/review-comments$`).test(p),
    (r) => json(r, { comments: [] }),
  );

  return served;
}

async function capture({ locale, theme }) {
  const { browser, page } = await openPage({ theme, locale, viewport: VIEWPORT });
  try {
    const served = await serveFixture(page);

    await page.goto(`${CAPTURE.baseUrl}/pull-requests`, { waitUntil: "domcontentloaded" });
    await settle(page, { expect: `text=#${PR_NUMBER}` });

    // La pastille d'usage de l'en-tête affiche « … » tant que la facturation
    // n'a pas répondu, et cette page-ci la double sur le fil. Un run l'a
    // photographiée en chargement. On attend qu'elle ait fini, quelle que soit
    // la langue — c'est le caractère qu'on guette, pas un libellé.
    await page.waitForFunction(
      () => ![...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "…"),
      undefined,
      { timeout: 15_000 },
    );

    // Onglet Fichiers : désigné par son rang, son libellé est traduit et porte
    // le compteur de fichiers.
    const filesTab = page.getByRole("tab").nth(1);
    await filesTab.click();
    if ((await filesTab.getAttribute("aria-selected")) !== "true") {
      throw new Error(`${locale}/${theme} — l'onglet Fichiers n'est pas sélectionné.`);
    }

    // Le diff est rendu par un parseur : on attend une ligne de code, pas le titre
    // du fichier — celui-ci s'affiche avant que le patch soit découpé en hunks.
    await page
      .getByText("export type KeyHint", { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 15_000 });

    await page.mouse.move(120, 60);
    await page.waitForTimeout(400);

    const check = await page.evaluate(
      ({ files, totals }) => {
        const main = document.querySelector("main");
        const text = main?.textContent || "";
        // Les couleurs du diff : on compte les lignes réellement peintes plutôt
        // que de faire confiance à une classe.
        const painted = [...(main?.querySelectorAll("*") || [])].filter((el) => {
          const bg = getComputedStyle(el).backgroundColor;
          const m = /rgba?\(([^)]+)\)/.exec(bg);
          if (!m) return false;
          const [r, g, b, a] = m[1].split(",").map((n) => parseFloat(n));
          if (a === 0) return false;
          // Un vert ou un rouge franc : une composante domine nettement.
          return (g > r + 12 && g > b + 12) || (r > g + 12 && r > b + 12);
        }).length;
        return {
          missingFiles: files.filter((f) => !text.includes(f)),
          painted,
          hasTotals:
            text.includes(`+${totals.additions}`) || text.includes(String(totals.additions)),
        };
      },
      { files: FILES.map((f) => f.filename), totals: TOTALS },
    );

    if (check.missingFiles.length > 0) {
      throw new Error(
        `${locale}/${theme} — fichier(s) absent(s) du diff : ${check.missingFiles.join(", ")}`,
      );
    }
    if (check.painted < 10) {
      throw new Error(
        `${locale}/${theme} — seulement ${check.painted} ligne(s) colorée(s) : le diff ne ` +
          `se lit pas comme un diff. Un patch mal formé n'est pas découpé en hunks.`,
      );
    }
    if (served.length < 3) {
      throw new Error(
        `${locale}/${theme} — ${served.length} lecture(s) servie(s) au lieu de 3 : ` +
          `la page a peut-être appelé la forge pour de vrai. Servies : ${served.join(", ")}`,
      );
    }

    const path = `${OUT}/${locale}-${theme}.png`;
    await shoot(page, path);
    return { path, locale, theme, painted: check.painted, served: served.length };
  } finally {
    await browser.close();
  }
}

console.log(
  `PR #${PR_NUMBER} sur le run ${RUN_ID} · ${FILES.length} fichiers · ` +
    `+${TOTALS.additions} −${TOTALS.deletions} (mêmes totaux que la capture agent)\n`,
);

const results = [];
for (const variant of VARIANTS) {
  const r = await capture(variant);
  console.log(
    `  ${r.locale}/${r.theme} → ${r.path} · ${r.painted} lignes colorées · ${r.served} lectures servies`,
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
