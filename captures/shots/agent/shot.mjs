/**
 * workflowAgent — the agent run on AUR-2, thread unfolded.
 *
 * See `intent.md`, especially for the display bug found here (“Editing
 * 0 file(s)"): the label check below fails as long as the
 * fix for `tool-call-display.tsx` is not deployed.
 *
 * node captures/shots/agent/shot.mjs # produces the PNGs
 * node captures/shots/agent/shot.mjs --publish # + book on the landing
 */
import { openPage, settle, shoot, CAPTURE, CAPTURE_VARIANTS } from "../../lib/browser.mjs";
import { publishShot, writeManifest } from "../../lib/publish.mjs";
import { toolCallLabel } from "../../lib/messages.mjs";

const SLOT = "workflowAgent";
const OUT = "captures/shots/agent/out";
const VIEWPORT = { width: 1447, height: 1085 };

/**
 * The work sequence is designated by the DURATION of the run — the only part of its
 * wording which is common to French and English, and which comes from
 * timestamps rather than a translation. Aim for “the first closed accordion”
 * would open the “New” menu, at the top of the list.
 */
const DURATION = /\b8\b[^0-9]*\b40\b/;

/** What the wire should contain once unfolded — paths, therefore data. */
const TRACE = [
  "**/palette/**",
  "lib/palette/actions.ts",
  "components/palette/provider.tsx",
  "components/palette/row.tsx",
  "pnpm vitest run palette",
];

const PUBLISH = process.argv.includes("--publish");
const VARIANTS = CAPTURE_VARIANTS;

/**
 * “Editing 3 files”, reconstructed from the app catalog.
 *
 * The key was a simple interpolation (`{count} fichier(s)`) and the
 * The original `.replace("{count}", …)` was enough. She became a PLURAL ICU
 * (commit `5d18182`, which incidentally corrected the “0 file(s)” described in
 * `intent.md`), and this replacement then produced the raw pattern — not found
 * in the page, so capture failed. `icuPlural` handles both forms.
 */
async function applyEditsLabel(locale) {
  return toolCallLabel(locale, "agentApplyEdits", 3);
}

async function capture({ locale, theme }) {
  const { browser, page } = await openPage({ theme, locale, viewport: VIEWPORT });
  try {
    await page.goto(`${CAPTURE.baseUrl}/agents`, { waitUntil: "domcontentloaded" });
    await settle(page, { expect: "text=AUR-2" });

    // `/agents` no longer opens the last run: the page opens on a
    // NEW conversation, and the run lives in the left column. Without this click,
    // the image would come out on “Hello, Camille Roy” and its message of absence
    // deposit. The label of the button is DATA (the ticket identifier and its
    // English title), therefore valid in both languages.
    await page.getByRole("button", { name: /^AUR-2:/ }).first().click();

    // The thread arrives folded: a completed run closes its work sequence.
    await page.getByRole("button", { name: DURATION }).click();

    // Both seeded turns now group their three actions under a count label.
    // Expand each group to show the reads, edits, and test command together.
    const actionGroups = page.getByRole("button", {
      name: await toolCallLabel(locale, "toolCallSummary", 3),
      exact: true,
    });
    await actionGroups.nth(1).waitFor({ state: "visible", timeout: 10_000 });
    for (const group of await actionGroups.all()) await group.click();
    await page
      .getByText("lib/palette/actions.ts", { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });

    // Nothing must remain under the cursor: the lines of the thread have a hover.
    await page.mouse.move(600, 60);
    await page.waitForTimeout(400);

    const editsLabels = [await applyEditsLabel(locale)];
    const check = await page.evaluate(
      ({ trace, editsLabels }) => {
        const main = document.querySelector("main");
        const text = main?.textContent || "";
        return {
          missing: trace.filter((t) => !text.includes(t)),
          hasEdits: editsLabels.some((label) => text.includes(label)),
          // The faulty wording before correction, whatever the language.
          zeroEdits: /(0 fichier|0 file)/.test(text),
        };
      },
      { trace: TRACE, editsLabels },
    );

    if (check.missing.length > 0) {
      throw new Error(
        `${locale}/${theme} — absent(s) du fil : ${check.missing.join(", ")}. ` +
          `Un accordéon est resté fermé, ou le run de démo a changé.`,
      );
    }
    if (!check.hasEdits) {
      throw new Error(
        `${locale}/${theme} — aucun libellé d'édition de 3 fichiers ne s'affiche` +
          (check.zeroEdits
            ? `, le fil annonce zéro fichier édité. La correction de ` +
              `components/assistant/tool-call-display.tsx n'est pas en production : ` +
              `${CAPTURE.baseUrl} rend encore l'ancien décompte.`
            : `. Le résumé d'arguments de apply_edits a changé de forme.`),
      );
    }

    const path = `${OUT}/${locale}-${theme}.png`;
    await shoot(page, path);
    return { path, locale, theme, editsLabel: editsLabels.find(() => check.hasEdits) };
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
