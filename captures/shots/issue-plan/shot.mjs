/**
 * workflowIssue — AUR-2 open on its implementation plan.
 *
 * See `intent.md`: the catalog guideline describes a detail page that
 * does not exist, and a “description + plan” view that the tabs render
 * impossible. We photograph the Plan tab, which is what the landing describes.
 *
 * node captures/shots/issue-plan/shot.mjs # produces the PNGs
 * node captures/shots/issue-plan/shot.mjs --publish # + book on the landing
 */
import { openPage, settle, shoot, CAPTURE, DEFAULT_VIEW_NAMES } from "../../lib/browser.mjs";
import { publishShot, writeManifest } from "../../lib/publish.mjs";

/**
 * Disconnected from the landing since 2026-07-26: `workflowIssue` is served by
 * `shots/issue-create`. The flag is read by `publish.mjs --shots`, which jumps
 * this folder — without it, disk order would decide which of the two images
 * reaches production. See `intent.md`.
 */
// Deliberately not exported AND not referenced: `publish.mjs` does not import it,
// it tests the TEXT of the file (`/^const RETIRED = true/m`). The line is therefore
// kept as-is — “cleaning” it would make the file publishable
// again, silently.
// oxlint-disable-next-line no-unused-vars
const RETIRED = true;

const SLOT = "workflowIssue";
const OUT = "captures/shots/issue-plan/out";
const AURORA = "6cd36606-c297-4920-8ce3-31b5f3697be8";

/**
 * 4/3, the frame ratio — obligatory: `<ScreenshotSlot>` renders the image in
 * `object-cover`, and a 16/10 capture would lose 145 px on the right, i.e.
 * third of the panel. The height remains that of the other captures; this is the
 * width which gives way. See `intent.md`.
 */
const VIEWPORT = { width: 1447, height: 1085 };

/**
 * Content anchors: file paths written in the plan. These are
 * DATA, therefore identical in French and English — unlike translated status
 * labels such as “To do” or “finished”, which would break one of the variants.
 */
const PLAN_ANCHORS = [
  "lib/palette/actions.ts",
  "components/palette/row.tsx",
  "components/palette/provider.tsx",
];

const PUBLISH = process.argv.includes("--publish");

// `workflowIssue` is served by `shots/issue-create` since 2026-07-26 — see
// `intent.md`. This script therefore targets the SAME location as another, and publish
// would crush the modal of creation by the plan, without a word. Produce the PNGs
// remains permitted: the script is kept in working order, only the connection to
// the landing is cut.
if (PUBLISH) {
  console.error(
    "captures: `issue-plan` n'alimente plus la landing.\n" +
      "L'emplacement `workflowIssue` est servi par `captures/shots/issue-create`, et\n" +
      "publier d'ici l'écraserait. Pour remettre le plan sur la page, il lui faut son\n" +
      "propre emplacement dans screenshot-slots.ts — voir intent.md.",
  );
  process.exit(1);
}
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

    // The board is the decor: we want it complete before opening the panel. Its
    // tab bar arrives by a separate query, later than maps.
    await page
      .getByRole("button", { name: DEFAULT_VIEW_NAMES[locale], exact: true })
      .waitFor({ state: "visible", timeout: 15_000 });

    // Open the ticket as a user: by clicking on their card. The anchor is
    // the identifier, not a title — it does not depend on any translation.
    await page.getByText("AUR-2", { exact: true }).first().click();
    const panel = page.getByRole("dialog").first();
    await panel.waitFor({ state: "visible", timeout: 10_000 });

    // The panel always opens to Description (initialTab). The Plan tab
    // is designated by its RANK: its wording bears the counter “2/6” stuck on.
    const planTab = page.getByRole("tab").nth(1);
    await planTab.click();
    await planTab.waitFor({ state: "visible" });

    if ((await planTab.getAttribute("aria-selected")) !== "true") {
      throw new Error(`${locale}/${theme} — l'onglet Plan n'est pas sélectionné.`);
    }

    // The cursor remains on the tab after the click: we place it on the veil, which
    // has no hover state, so as not to light up a task row.
    await page.mouse.move(400, 1200);

    // CONTENT Control: Do tasks really name files?
    const check = await page.evaluate((anchors) => {
      const dialog = document.querySelector('[role="dialog"]');
      const text = dialog?.textContent || "";
      // The strikethrough is placed on the CONTAINER of the task, not on its text: in
      // CSS decoration propagates to display but not to calculated style
      // descendants. We therefore interrogate the containers.
      const struck = [...(dialog?.querySelectorAll("*") || [])].filter(
        (el) =>
          el.textContent.trim() &&
          getComputedStyle(el).textDecorationLine.includes("line-through"),
      ).length;
      return {
        missing: anchors.filter((a) => !text.includes(a)),
        // Without word limit: `textContent` joins neighboring nodes, and
        // the tab counter comes out as « Plan2/6 ».
        progress: /2\s*\/\s*6/.test(text),
        struck,
      };
    }, PLAN_ANCHORS);

    if (check.missing.length > 0) {
      throw new Error(
        `${locale}/${theme} — le plan ne montre pas ${check.missing.join(", ")}. ` +
          `L'onglet affiché n'est pas le bon, ou le plan d'AUR-2 a changé.`,
      );
    }
    if (!check.progress) {
      throw new Error(
        `${locale}/${theme} — le compteur « 2/6 » est absent : la progression du ` +
          `plan ne se lit pas, c'est pourtant ce que l'image doit prouver.`,
      );
    }
    if (check.struck === 0) {
      throw new Error(
        `${locale}/${theme} — aucune tâche barrée : les états des tâches ne se ` +
          `distinguent pas à l'œil.`,
      );
    }

    const path = `${OUT}/${locale}-${theme}.png`;
    await shoot(page, path);
    return { path, locale, theme, struck: check.struck };
  } finally {
    await browser.close();
  }
}

const results = [];
for (const variant of VARIANTS) {
  const r = await capture(variant);
  console.log(`  ${r.locale}/${r.theme} → ${r.path} · plan 2/6 · ${r.struck} tâche(s) barrée(s)`);
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
