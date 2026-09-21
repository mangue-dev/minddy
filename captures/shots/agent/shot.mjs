/**
 * workflowAgent — the code worker's run, read from the Numo panel.
 *
 * See `intent.md`: the dedicated `/agents` page is retired, and a run now
 * lives in a Numo conversation as delegated work — a `launch_code_agent` call
 * in the parent thread renders the delegated-work card, and the worker's own
 * thread opens in the detail side panel. That sheet is the subject of this
 * capture: Camille's brief, the work sequence unfolded (readings, edits, the
 * three-files block, the test command), the report that waits for an answer.
 *
 * The parent conversation and the origin link between Numo and the worker
 * come from `captures/world/seed/008-agent.mjs` (the `launch_code_agent` tool
 * row); without it the card never renders and this script fails loudly.
 *
 * node captures/shots/agent/shot.mjs # produces the PNGs
 * node captures/shots/agent/shot.mjs --publish # + book on the landing
 */
import {
  openPage,
  settle,
  shoot,
  CAPTURE,
  CAPTURE_VARIANTS,
  DEFAULT_VIEW_NAMES,
} from "../../lib/browser.mjs";
import { publishShot, writeManifest } from "../../lib/publish.mjs";
import { catalog, icuPlural, toolCallLabel } from "../../lib/messages.mjs";

const SLOT = "workflowAgent";
const OUT = "captures/shots/agent/out";
const AURORA = "6cd36606-c297-4920-8ce3-31b5f3697be8";

/** 4/3, the common window of the workflow slots. The board is the decor on
 * the left; the detail sheet carries the image. */
const VIEWPORT = { width: 1447, height: 1085 };

/** Title of the parent conversation, and of the run (stamped by the seed) —
 * data in English, therefore valid in both languages. */
const TOPIC = "Add keyboard shortcuts to the command palette";

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

/** Group labels, reconstructed from the app catalog rather than copied: the
 * group summarizes its actions per family ("2 files read, 1 search"), and a
 * capture must not keep passing if the wording changes. The events sown in
 * `008-agent.mjs` decide the counts, as for the duration. */
async function groupLabels(locale) {
  const read = await toolCallLabel(locale, "summaryRead", 2);
  const search = await toolCallLabel(locale, "summarySearch", 1);
  const edit = await toolCallLabel(locale, "summaryEdit", 3);
  const command = await toolCallLabel(locale, "summaryCommand", 1);
  const capitalize = (line) => line.charAt(0).toLocaleUpperCase() + line.slice(1);
  return [capitalize([read, search].join(", ")), capitalize([edit, command].join(", "))];
}

async function capture({ locale, theme }) {
  const { browser, page } = await openPage({ theme, locale, viewport: VIEWPORT });
  try {
    await page.goto(`${CAPTURE.baseUrl}/projects/${AURORA}`, { waitUntil: "domcontentloaded" });
    await settle(page, { expect: "text=AUR-1" });

    // The board is the decor: wait for its tab bar, which arrives after the cards.
    await page
      .getByRole("button", { name: DEFAULT_VIEW_NAMES[locale], exact: true })
      .waitFor({ state: "visible", timeout: 15_000 });

    // G then A — from the NUDE BOARD. In an open ticket, `A` is the shortcut
    // “assign” and would open the assigned selector instead.
    await page.keyboard.press("g");
    await page.keyboard.press("a");
    const panel = page.getByRole("dialog").first();
    await panel.waitFor({ state: "visible", timeout: 10_000 });

    // The conversation is aimed by its title — English data, valid in both
    // languages. The list can take a moment to mount; retry like `numo`.
    const messages = await catalog(locale);
    const historyTrigger = panel.getByRole("button", {
      name: messages.Assistant.conversations,
      exact: true,
    });
    const conversationButton = page.getByRole("button", { name: new RegExp(TOPIC) });
    let opened = false;
    for (let attempt = 0; attempt < 3 && !opened; attempt += 1) {
      await historyTrigger.click();
      opened = await conversationButton
        .waitFor({ state: "visible", timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
    }
    if (!opened) {
      throw new Error(`${locale}/${theme} — la liste des conversations ne s'est pas ouverte.`);
    }
    await conversationButton.click();

    // The delegated-work card carries the run id as an attribute: the one
    // anchor that does not depend on any wording. Its TITLE only appears
    // once the run query has landed (`agent_runs.title`, stamped by the
    // seed) — without it the card would still show the raw launch objective.
    const card = page.locator("[data-delegated-work-id]");
    await card.waitFor({ state: "visible", timeout: 15_000 });
    await card.getByText(TOPIC, { exact: true }).waitFor({ state: "visible", timeout: 15_000 });

    // The thread itself lives in the detail sheet, opened from the card.
    await panel.getByRole("button", { name: messages.Agent.delegatedWorkView, exact: true }).click();
    const sheet = page.getByRole("dialog", { name: new RegExp(TOPIC) });
    await sheet.waitFor({ state: "visible", timeout: 10_000 });

    // The thread arrives folded: a completed run closes its work sequence.
    await sheet.getByRole("button", { name: DURATION }).click();

    // The two turns group their actions under count labels. Open each group
    // to show the search, the reads, the edits and the test command together.
    const [readGroup, editGroup] = await groupLabels(locale);
    for (const label of [readGroup, editGroup]) {
      await sheet.getByRole("button", { name: label, exact: true }).first().click();
      await sheet
        .getByText("lib/palette/actions.ts", { exact: false })
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
    }

    // Nothing must remain under the cursor: the lines of the thread have a hover.
    await page.mouse.move(600, 60);
    await page.waitForTimeout(400);

    const check = await page.evaluate(
      ({ trace, sheetTitle }) => {
        const dialog = [...document.querySelectorAll('[role="dialog"]')]
          .find((d) => d.querySelector("h2")?.textContent === sheetTitle);
        const text = dialog?.textContent || "";
        return {
          missing: trace.filter((t) => !text.includes(t)),
          hasSheet: !!dialog,
        };
      },
      { trace: TRACE, sheetTitle: TOPIC },
    );

    if (check.missing.length > 0) {
      throw new Error(
        `${locale}/${theme} — absent(s) du fil : ${check.missing.join(", ")}. ` +
          `Un accordéon est resté fermé, ou le run de démo a changé.`,
      );
    }
    if (!check.hasSheet) {
      throw new Error(`${locale}/${theme} — le détail du travail délégué ne s'est pas ouvert.`);
    }

    const path = `${OUT}/${locale}-${theme}.png`;
    await shoot(page, path);
    return { path, locale, theme };
  } finally {
    await browser.close();
  }
}

const results = [];
for (const variant of VARIANTS) {
  const r = await capture(variant);
  console.log(`  ${r.locale}/${r.theme} → ${r.path} · fil déroulé`);
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
