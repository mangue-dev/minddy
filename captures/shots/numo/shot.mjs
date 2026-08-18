/**
 * numoPanel — “Sweep the unassigned backlog”, collapsed thread, expanded panel.
 *
 * See `intent.md`: a catalog instruction describes a UI that does not exist
 * (badge « Ticket en contexte »).
 *
 * node captures/shots/numo/shot.mjs # produces the PNGs
 * node captures/shots/numo/shot.mjs --publish # + book on the landing
 */
import { openPage, settle, shoot, CAPTURE, DEFAULT_VIEW_NAMES } from "../../lib/browser.mjs";
import { publishShot, writeManifest } from "../../lib/publish.mjs";
import { toolCallLabel } from "../../lib/messages.mjs";

const SLOT = "numoPanel";
const OUT = "captures/shots/numo/out";
const AURORA = "6cd36606-c297-4920-8ce3-31b5f3697be8";

/**
 * 4/3, but in 1200 × 900 and not in the common window of 1447 × 1085 —
 * `carnet` deviates in the same way, and for a similar reason.
 *
 * The compact panel has FIXED metrics (450 × 600, anchored at the bottom right):
 * it is therefore the window which decides the part of the image it occupies. In 1447 he
 * weighs 31% of the width and the board passes in front of it; at 1200 it weighs
 * 37% by 67% of the height, and the image says what it should say — a
 * assistant placed ON the tracker, both readable.
 *
 * **1200 is a floor, not a setting.** `--breakpoint-desktop` is worth
 * 1200 px: below, the shell switches to mobile layout — bar
 * retracted side, centered breadcrumbs, tab bar at the bottom, board in
 * a column. A 1024 × 768 shot produced exactly that, and the image
 * told a phone application.
 *
 * The definition does not suffer: the shot is 2×, or 2400 px, and
 * `publishShot` serves 1600 px for a location displayed around 530 — three
 * times the display density, like the others.
 */
const VIEWPORT = { width: 1200, height: 900 };

/** Title of the conversation sown — a piece of data, therefore the same in both languages. */
const CONVERSATION = "Sweep the unassigned backlog";

/**
 * Width of the COMPACT panel (450 px), such as the `panel-geometry.ts` pose.
 * It serves as a waiting anchor: the compact ⇄ extended morph is animated, and a
 * taken part during interpolation catches the panel halfway.
 */
const COMPACT_WIDTH = 450;

/**
 * The work summary is designated by its DURATION — the only part of the wording
 * common to French (“A worked for 1 minute and 3 seconds”) and to
 * l'anglais (« Worked for 1 minute and 3 seconds »), parce qu'elle vient des
 * timestamps and not a translation. Same process as `shots/agent`.
 *
 * These 1 min 3 s are data: the six messages in the thread are dated by
 * `captures/world/seed/006-numo.mjs`. Changing the sequence there breaks this
 * control here, and that is intended.
 */
const DURATION = /\b1\b[^0-9]*\b3\b/;

/**
 * Action labels, reconstructed from the app catalog rather than
 * copied: a capture must not continue to pass if the product changes
 * ce texte.
 */
async function toolLabels(locale) {
  return Promise.all([
    toolCallLabel(locale, "foundIssues", 3),
    toolCallLabel(locale, "issuesUpdated", 2),
  ]);
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

    // The board is the decor, and it is it which gives its context to Numo: we
    // waits for its tab bar, which arrives after the maps.
    await page
      .getByRole("button", { name: DEFAULT_VIEW_NAMES[locale], exact: true })
      .waitFor({ state: "visible", timeout: 15_000 });

    // G then A — from the NUDE BOARD. In an open ticket, `A` is the shortcut
    // “assign” and would open the assigned selector instead.
    await page.keyboard.press("g");
    await page.keyboard.press("a");
    const panel = page.getByRole("dialog").first();
    await panel.waitFor({ state: "visible", timeout: 10_000 });

    // No conversation is restored: `localStorage` is blank in a
    // capture context. We go through the list, and aim for the title — a
    // English data, valid for both languages.
    await panel.getByRole("button", { name: "Conversations" }).click();
    await page.getByText(CONVERSATION, { exact: false }).first().click();
    await page
      .getByText("Nobody owns anything", { exact: false })
      .waitFor({ state: "visible", timeout: 15_000 });

    // The work tower remains FOLDED: this is the default state of the product, and
    // this is the one we photograph. The duration summary is enough to say that Numo
    // worked, and the final response names the tickets it modified —
    // unfolding would spread the reasoning over the entire height of the panel to
    // show what the concluding sentence already says.
    const summary = page.locator('[role="log"]').first().getByRole("button", { name: DURATION });
    await summary.waitFor({ state: "visible", timeout: 10_000 });

    // COMPACT panel — we no longer extend it, and the return is motivated.
    //
    // The extended mode was a framing choice: it put Numo in the center and
    // returned the board to the decor. He doesn't do it anymore. `panel-geometry.ts` a
    // reconnected its size to the dialogue tokens of mango-ui, i.e.
    // 90vw × 90vh: the panel now covers the entire screen, the board
    // disappears from the image, and the thread folded — six messages, including a turn of
    // closed work — floats in the bottom two-thirds of white. Expand is
    // become the opposite of what it was intended for.
    //
    // Compact, the panel keeps its metrics fixed, and it is the WINDOW which
    // regulates its presence: see `VIEWPORT`.
    await page.waitForFunction(
      (width) => {
        const d = document.querySelector('[role="dialog"]');
        return !!d && Math.round(d.getBoundingClientRect().width) === width;
      },
      COMPACT_WIDTH,
      { timeout: 10_000 },
    );

    // Radix keeps a tooltip open as long as its button has focus: without
    // that, a black bubble (“Conversations”) crosses the image.
    await page.mouse.move(120, VIEWPORT.height - 40);
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
          // FOLDED: action labels should NOT be there. See them
          // would mean that the summary opened, alone, between two runs.
          leakedLabels: labels.filter((l) => text.includes(l)),
          hasSummary: !!log && /\b1\b[^0-9]*\b3\b/.test(text),
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
    if (!check.hasSummary) {
      throw new Error(
        `${locale}/${theme} — le résumé « A travaillé pendant 1 minute et 3 secondes » ` +
          `est absent du fil. Sans lui, Numo a l'air de répondre sans rien faire, ce qui ` +
          `est l'inverse du propos. Vérifier le déroulé dans world/seed/006-numo.mjs.`,
      );
    }
    if (check.leakedLabels.length > 0) {
      throw new Error(
        `${locale}/${theme} — le résumé de travail est DÉPLIÉ : ${check.leakedLabels.join(", ")} ` +
          `apparaissent dans le fil. La capture doit montrer l'état replié.`,
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
    return { path, locale, theme };
  } finally {
    await browser.close();
  }
}

const results = [];
for (const variant of VARIANTS) {
  const r = await capture(variant);
  console.log(`  ${r.locale}/${r.theme} → ${r.path} · résumé de travail replié (1 min 3 s)`);
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
