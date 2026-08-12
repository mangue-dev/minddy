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
import {
  COMMENTS,
  COMMITS,
  DETAIL_RESPONSE,
  FILES,
  LIST_RESPONSE,
  PR_ID,
  PR_NUMBER,
  RUN_ID,
  TOTALS,
} from "./fixture.mjs";

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
 * Les lectures répondues par la capture. Elles sont TOUTES indexées par la PR
 * depuis MIN-143 (`/api/pull-requests/{prId}/…`) : la page montre aussi les PR
 * humaines, qui n'ont aucun run, et les routes `agent-runs/{runId}/pr/*` ne
 * sont plus que des façades qu'elle n'appelle pas.
 *
 * On vise par le CHEMIN EXACT, pas par un glob : `**\/pull-requests/*` ramasse
 * aussi bien `/comments` que `/commits` selon l'ordre d'enregistrement.
 *
 * Le dernier filet attrape TOUT le reste de la famille et refuse de le servir :
 * une route inconnue partirait sinon pour de vrai, avec ses vraies
 * conséquences — un appel à GitHub au nom du compte de démo.
 */
async function serveFixture(page) {
  const served = [];
  const unexpected = [];

  const on = (test, handler) =>
    page.route(
      (url) => test(url.pathname),
      async (route) => {
        served.push(new URL(route.request().url()).pathname);
        await handler(route);
      },
    );

  const under = (suffix) =>
    new RegExp(`^/api/pull-requests/[^/]+${suffix}$`);

  // Filet de sécurité, posé EN PREMIER et donc consulté EN DERNIER : Playwright
  // essaie ses gestionnaires dans l'ordre INVERSE d'enregistrement, le plus
  // récent d'abord. Posé en dernier, ce filet passait devant tous les autres et
  // abortait la liste elle-même — la page rendait son écran vide, et le message
  // d'erreur parlait d'un `#128` introuvable.
  await page.route(
    (url) => url.pathname.startsWith("/api/pull-requests"),
    async (route) => {
      unexpected.push(new URL(route.request().url()).pathname);
      await route.abort();
    },
  );

  await on((p) => p === "/api/pull-requests", (r) => json(r, LIST_RESPONSE));
  await on((p) => under("").test(p), (r) => json(r, DETAIL_RESPONSE));
  await on(
    (p) => under("/comments").test(p),
    // Le fil est PLAT côté forge : `comments` est la conversation, `timeline`
    // les événements (assignations, labels…) et `reactions` les emoji. Les deux
    // derniers sont vides — le monde de démo n'a ni l'un ni l'autre.
    (r) => json(r, { comments: COMMENTS, timeline: [], reactions: [] }),
  );
  await on((p) => under("/commits").test(p), (r) => json(r, { commits: COMMITS, truncated: false }));
  await on(
    (p) => under("/review-comments").test(p),
    (r) => json(r, { comments: [], threads: [], reactions: [] }),
  );
  // La relecture par Numo (MIN-168) : aucune session sur cette PR, donc rien à
  // annoncer dans le fil. Le hook cesse de poller dès que `working` est faux.
  await on(
    (p) => under("/ai-review").test(p),
    (r) => json(r, { run: null, reviewedHeadSha: null, model: null }),
  );

  return { served, unexpected };
}

async function capture({ locale, theme }) {
  const { browser, page } = await openPage({ theme, locale, viewport: VIEWPORT });
  try {
    const { served, unexpected } = await serveFixture(page);

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
    // le compteur de fichiers. C'est le TROISIÈME depuis qu'un onglet
    // « Commits » s'est glissé entre Conversation et Fichiers — viser le
    // deuxième ouvrait la liste des commits, et le contrôle du diff échouait
    // sans dire pourquoi.
    const filesTab = page.getByRole("tab").nth(2);
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
        //
        // Deux choses ont changé sous ce contrôle, et chacune le rendait
        // silencieusement faux — il rendait 0 sur un diff parfaitement coloré.
        //
        // 1. Le diff est rendu par `@pierre/diffs`, DANS UN SHADOW DOM
        //    (cf. app/globals.css et ses variables `--diffs-*`).
        //    `main.querySelectorAll` ne le traverse pas : il faut descendre
        //    dans les `shadowRoot` à la main. Les locators Playwright, eux, le
        //    percent — d'où l'attente de « export type KeyHint » qui passait
        //    pendant que le comptage échouait.
        // 2. Les couleurs calculées ne sont plus en `rgb()`. Les variables
        //    `--diffs-*` sont posées en `oklch`, et `getComputedStyle` rend
        //    alors `oklab(0.627 -0.167 0.099 / 0.1)` ou `lab(…)` : la lecture
        //    du triplet par expression régulière ne reconnaissait plus une
        //    seule couleur de la page. On ne parse donc plus rien — c'est le
        //    navigateur qui convertit, via un canvas, et ça vaudra pour la
        //    prochaine notation qu'il adoptera.
        const everyElement = (root, out = []) => {
          for (const el of root.querySelectorAll("*")) {
            out.push(el);
            if (el.shadowRoot) everyElement(el.shadowRoot, out);
          }
          return out;
        };
        const ctx = document.createElement("canvas").getContext("2d", {
          willReadFrequently: true,
        });
        const toRgba = (color) => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = "#000";
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          return ctx.getImageData(0, 0, 1, 1).data;
        };
        const painted = everyElement(main ?? document).filter((el) => {
          const [r, g, b, a] = toRgba(getComputedStyle(el).backgroundColor);
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
    if (unexpected.length > 0) {
      throw new Error(
        `${locale}/${theme} — route(s) de PR non prévue(s) par le fixture : ` +
          `${[...new Set(unexpected)].join(", ")}. Ajoute-les à serveFixture, sinon la ` +
          `capture appelle la forge pour de vrai.`,
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
  `PR #${PR_NUMBER} (${PR_ID}, run ${RUN_ID}) · ${FILES.length} fichiers · ` +
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
