/**
 * numoPanel — la conversation « Sweep the unassigned backlog », panneau étendu.
 *
 * Voir `intent.md` : deux consignes du catalogue décrivent une UI qui n'existe
 * pas (appels d'outils « dépliés », badge « Ticket en contexte »).
 *
 *   node captures/shots/numo/shot.mjs             # produit les PNG
 *   node captures/shots/numo/shot.mjs --publish   # + livre sur la landing
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openPage, settle, shoot, CAPTURE, DEFAULT_VIEW_NAMES } from "../../lib/browser.mjs";
import { publishShot, writeManifest } from "../../lib/publish.mjs";
import { ROOT } from "../../lib/env.mjs";

const SLOT = "numoPanel";
const OUT = "captures/shots/numo/out";
const AURORA = "6cd36606-c297-4920-8ce3-31b5f3697be8";
const VIEWPORT = { width: 1447, height: 1085 };

/** Titre de la conversation semée — une donnée, donc la même dans les 2 langues. */
const CONVERSATION = "Sweep the unassigned backlog";

/** « Agrandir » : le seul libellé de cette capture qui diffère d'une langue à l'autre. */
const EXPAND = { fr: "Agrandir", en: "Expand" };

/** Largeur du panneau étendu (56rem), telle que la pose `panel-geometry.ts`. */
const EXPANDED_WIDTH = 896;

/**
 * Les libellés d'action sont des pluriels ICU du catalogue de l'app. On les
 * reconstruit à partir de `messages/<langue>.json` au lieu de les recopier :
 * une capture ne doit pas continuer à passer si le produit change ce texte.
 */
function icuPlural(pattern, count) {
  const other = /other\s*\{([^}]*)\}/.exec(pattern);
  if (!other) throw new Error(`captures: pluriel ICU illisible — ${pattern}`);
  return other[1].replaceAll("#", String(count));
}

async function toolLabels(locale) {
  const catalog = JSON.parse(
    await readFile(resolve(ROOT, `messages/${locale}.json`), "utf8"),
  ).ToolCall;
  return [icuPlural(catalog.foundIssues, 3), icuPlural(catalog.issuesUpdated, 2)];
}

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

    // Le board est le décor, et c'est lui qui donne son contexte à Numo : on
    // attend sa barre d'onglets, qui arrive après les cartes.
    await page
      .getByRole("button", { name: DEFAULT_VIEW_NAMES[locale], exact: true })
      .waitFor({ state: "visible", timeout: 15_000 });

    // G puis A — depuis le BOARD NU. Dans un ticket ouvert, `A` est le raccourci
    // « assigner » et ouvrirait le sélecteur d'assigné à la place.
    await page.keyboard.press("g");
    await page.keyboard.press("a");
    const panel = page.getByRole("dialog").first();
    await panel.waitFor({ state: "visible", timeout: 10_000 });

    // Aucune conversation ne se restaure : `localStorage` est vierge dans un
    // contexte de capture. On passe par la liste, et on vise le titre — une
    // donnée anglaise, valable pour les deux langues.
    await panel.getByRole("button", { name: "Conversations" }).click();
    await page.getByText(CONVERSATION, { exact: false }).first().click();
    await page
      .getByText("Nobody owns anything", { exact: false })
      .waitFor({ state: "visible", timeout: 15_000 });

    // Étendu : en compact le fil déborde de 73 px et coupe une extrémité.
    await panel.getByRole("button", { name: EXPAND[locale], exact: true }).click();
    await page.waitForFunction(
      (width) => {
        const d = document.querySelector('[role="dialog"]');
        return !!d && Math.round(d.getBoundingClientRect().width) === width;
      },
      EXPANDED_WIDTH,
      { timeout: 10_000 },
    );

    // Radix garde une infobulle ouverte tant que son bouton a le focus : sans
    // ça, une bulle noire (« Conversations », « Agrandir ») traverse l'image.
    await page.mouse.move(120, 900);
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.waitForTimeout(400);

    const labels = await toolLabels(locale);
    const check = await page.evaluate(
      ({ labels, viewName }) => {
        const dialog = document.querySelector('[role="dialog"]');
        const log = dialog?.querySelector('[role="log"]');
        const text = log?.textContent || "";
        const tips = [...document.querySelectorAll('[role="tooltip"]')].filter(
          (el) => el.getBoundingClientRect().width > 0,
        ).length;
        return {
          missingLabels: labels.filter((l) => !text.includes(l)),
          hasInstruction: text.includes("Nobody owns anything"),
          hasOutcome: text.includes("AUR-11") && text.includes("AUR-7"),
          hasContext: (dialog?.textContent || "").includes(viewName),
          tips,
        };
      },
      { labels, viewName: DEFAULT_VIEW_NAMES[locale] },
    );

    if (!check.hasInstruction) {
      throw new Error(`${locale}/${theme} — l'instruction de Camille est absente du fil.`);
    }
    if (check.missingLabels.length > 0) {
      throw new Error(
        `${locale}/${theme} — action(s) absente(s) du fil : ${check.missingLabels.join(", ")}. ` +
          `Numo a l'air de répondre sans rien faire, ce qui est l'inverse du propos.`,
      );
    }
    if (!check.hasOutcome) {
      throw new Error(
        `${locale}/${theme} — la dernière réponse ne cite plus AUR-11 et AUR-7 : ` +
          `le résultat de l'action ne se lit pas.`,
      );
    }
    if (!check.hasContext) {
      throw new Error(
        `${locale}/${theme} — le badge de contexte (« ${DEFAULT_VIEW_NAMES[locale]} ») ` +
          `n'est pas dans le panneau.`,
      );
    }
    if (check.tips > 0) {
      throw new Error(
        `${locale}/${theme} — ${check.tips} infobulle(s) encore ouverte(s) : ` +
          `elles traverseraient la capture.`,
      );
    }

    const path = `${OUT}/${locale}-${theme}.png`;
    await shoot(page, path);
    return { path, locale, theme, labels };
  } finally {
    await browser.close();
  }
}

const results = [];
for (const variant of VARIANTS) {
  const r = await capture(variant);
  console.log(`  ${r.locale}/${r.theme} → ${r.path} · ${r.labels.join(" · ")}`);
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
