/**
 * workflowAgent — le run de l'agent sur AUR-2, fil d'exécution déplié.
 *
 * Voir `intent.md`, notamment pour le bug d'affichage trouvé ici (« Édition de
 * 0 fichier(s) ») : le contrôle de libellé ci-dessous échoue tant que la
 * correction de `tool-call-display.tsx` n'est pas déployée.
 *
 *   node captures/shots/agent/shot.mjs             # produit les PNG
 *   node captures/shots/agent/shot.mjs --publish   # + livre sur la landing
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openPage, settle, shoot, CAPTURE } from "../../lib/browser.mjs";
import { publishShot, writeManifest } from "../../lib/publish.mjs";
import { ROOT } from "../../lib/env.mjs";

const SLOT = "workflowAgent";
const OUT = "captures/shots/agent/out";
const VIEWPORT = { width: 1447, height: 1085 };

/**
 * Le déroulé de travail se désigne par la DURÉE du run — la seule partie de son
 * libellé qui soit commune au français et à l'anglais, et qui vienne des
 * horodatages plutôt que d'une traduction. Viser « le premier accordéon fermé »
 * ouvrirait le menu « Nouveau », en haut de la liste.
 */
const DURATION = /\b8\b[^0-9]*\b40\b/;

/** Ce que le fil doit contenir une fois déplié — des chemins, donc des données. */
const TRACE = [
  "**/palette/**",
  "lib/palette/actions.ts",
  "components/palette/provider.tsx",
  "components/palette/row.tsx",
  "pnpm vitest run palette",
  "numo/aur-2-palette-shortcuts",
];

const PUBLISH = process.argv.includes("--publish");
const VARIANTS = [
  { locale: "fr", theme: "light" },
  { locale: "fr", theme: "dark" },
  { locale: "en", theme: "light" },
  { locale: "en", theme: "dark" },
];

/** « Édition de {count} fichier(s) » — interpolation simple du catalogue de l'app. */
async function applyEditsLabel(locale) {
  const catalog = JSON.parse(
    await readFile(resolve(ROOT, `messages/${locale}.json`), "utf8"),
  ).ToolCall;
  return catalog.agentApplyEdits.replace("{count}", "3");
}

async function capture({ locale, theme }) {
  const { browser, page } = await openPage({ theme, locale, viewport: VIEWPORT });
  try {
    await page.goto(`${CAPTURE.baseUrl}/agents`, { waitUntil: "domcontentloaded" });
    await settle(page, { expect: "text=AUR-2" });

    // Le fil arrive replié : un run terminé referme son déroulé de travail.
    await page.getByRole("button", { name: DURATION }).click();

    // Plusieurs actions d'un même tour se résument à la dernière : le groupe de
    // lectures s'ouvre pour rendre les trois lignes.
    const readGroup = page.getByRole("button", { name: /provider\.tsx$/ }).first();
    await readGroup.click();
    await page
      .getByText("lib/palette/actions.ts", { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });

    // Rien ne doit rester sous le curseur : les lignes du fil ont un survol.
    await page.mouse.move(600, 60);
    await page.waitForTimeout(400);

    const editsLabel = await applyEditsLabel(locale);
    const check = await page.evaluate(
      ({ trace, editsLabel }) => {
        const main = document.querySelector("main");
        const text = main?.textContent || "";
        return {
          missing: trace.filter((t) => !text.includes(t)),
          hasEdits: text.includes(editsLabel),
          // Le libellé fautif d'avant correction, quelle que soit la langue.
          zeroEdits: /(0 fichier|0 file)/.test(text),
        };
      },
      { trace: TRACE, editsLabel },
    );

    if (check.missing.length > 0) {
      throw new Error(
        `${locale}/${theme} — absent(s) du fil : ${check.missing.join(", ")}. ` +
          `Un accordéon est resté fermé, ou le run de démo a changé.`,
      );
    }
    if (!check.hasEdits) {
      throw new Error(
        `${locale}/${theme} — « ${editsLabel} » ne s'affiche pas` +
          (check.zeroEdits
            ? `, le fil annonce zéro fichier édité. La correction de ` +
              `components/assistant/tool-call-display.tsx n'est pas en production : ` +
              `${CAPTURE.baseUrl} rend encore l'ancien décompte.`
            : `. Le résumé d'arguments de apply_edits a changé de forme.`),
      );
    }

    const path = `${OUT}/${locale}-${theme}.png`;
    await shoot(page, path);
    return { path, locale, theme, editsLabel };
  } finally {
    await browser.close();
  }
}

const results = [];
for (const variant of VARIANTS) {
  const r = await capture(variant);
  console.log(`  ${r.locale}/${r.theme} → ${r.path} · fil complet · ${r.editsLabel}`);
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
