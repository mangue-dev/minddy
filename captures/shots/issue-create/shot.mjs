/**
 * workflowIssue — the creation modal with Smart Fill on and AUR-2's description,
 * before the click.
 *
 * See `intent.md`: this capture replaced the Plan tab
 * (`shots/issue-plan`), which showed the agent's work under a caption
 * announcing that of the user.
 *
 * node captures/shots/issue-create/shot.mjs # produces the PNGs
 * node captures/shots/issue-create/shot.mjs --publish # + book on the landing
 */
import {
  openPage,
  settle,
  shoot,
  CAPTURE,
  CAPTURE_VARIANTS,
  DEFAULT_VIEW_NAMES,
} from "../../lib/browser.mjs";
import { auroraProjectId } from "../../lib/config.mjs";
import { catalog } from "../../lib/messages.mjs";
import { publishShot, writeManifest } from "../../lib/publish.mjs";

const SLOT = "workflowIssue";
const OUT = "captures/shots/issue-create/out";
// Preview and production give Aurora different ids (captures/lib/config.mjs).
const AURORA = auroraProjectId(CAPTURE.baseUrl);

/** 4/3, the executive report. Rule common to all five 4/3 locations. */
const VIEWPORT = { width: 1447, height: 1085 };

/**
 * The description entered is AUR-2's, verbatim: the agent run and the pull request
 * photographed in the following two times carry the SAME ticket. These are
 * also data — therefore identical in French and English, and as such
 * the only verification anchors that do not break every other variation.
 */
const ISSUE = {
  description:
    "Power users live in the palette but still reach for the mouse to run an action. " +
    "Show the shortcut next to each row, and make it work from anywhere in the app.",
};

/** The translated labels the script looks for. */
async function uiLabels(locale) {
  const messages = await catalog(locale);
  return {
    dialog: messages.IssueUI.newIssueTitle,
    smartFill: messages.IssueUI.smartFillChip,
  };
}

/**
 * True as long as a floating overlay (open selector, tooltip) occupies
 * the screen. All go through the same Radix container, resulting in a single
 * invariant for the socket: NOTHING floats above the modal.
 *
 * The 8 px threshold discards the 1 × 1 duplicate that Radix leaves in the DOM for
 * screen readers — it carries `role="tooltip"` without displaying anything, and
 * querying it by this role made the control always true.
 */
const FLOATING = () =>
  [...document.querySelectorAll("[data-radix-popper-content-wrapper]")].some(
    (el) => el.getBoundingClientRect().width > 8,
  );

/** Wait until nothing floats anymore. Silent: the final check decides. */
async function settleOverlays(page) {
  await page.waitForFunction(FLOATING_SOURCE, undefined, { timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(250);
}

/** `waitForFunction` evaluates in the page: the function leaves there as a source. */
const FLOATING_SOURCE = `() => !(${FLOATING.toString()})()`;

const PUBLISH = process.argv.includes("--publish");
const VARIANTS = CAPTURE_VARIANTS;

async function capture({ locale, theme }) {
  const { browser, page } = await openPage({ theme, locale, viewport: VIEWPORT });
  try {
    await page.goto(`${CAPTURE.baseUrl}/projects/${AURORA}`, { waitUntil: "domcontentloaded" });
    await settle(page, { expect: "text=AUR-1" });

    // The board is the decor: we want it complete before opening the mode. Its
    // tab bar arrives by a separate query, later than maps.
    await page
      .getByRole("button", { name: DEFAULT_VIEW_NAMES[locale], exact: true })
      .waitFor({ state: "visible", timeout: 15_000 });

    // `c` — the creation shortcut, global (lib/create-context.tsx).
    await page.keyboard.press("c");
    const words = await uiLabels(locale);
    const dialog = page.getByRole("dialog", { name: words.dialog, exact: true });
    await dialog.waitFor({ state: "visible", timeout: 10_000 });

    // Smart Fill stays ON: it is the feature this image shows. Since MIN-813
    // the form hides the title while Smart Fill writes it, and the properties
    // it fills (priority, effort, categories, objective) leave the row. The
    // user writes two sentences; Smart Fill does the rest after the click.
    const smartFill = dialog.getByRole("button", { name: words.smartFill });
    await smartFill.waitFor({ state: "visible", timeout: 10_000 });
    if ((await smartFill.getAttribute("aria-pressed")) !== "true") {
      await smartFill.click();
    }

    // The description is a ProseMirror editor, not a textarea: we enter
    // on click so the typing lands in the editor.
    const editor = dialog.locator('[contenteditable="true"]').first();
    await editor.click();
    await page.keyboard.type(ISSUE.description, { delay: 3 });

    // ── Turn off anything that floats ──────────────────── ─────────────────────
    // Two overlays compete for the middle of the modal, and order matters.
    //
    // 1. The selector does not close immediately after clicking, and when closing
    // it RETURNED FOCUS to its trigger.
    // 2. This trigger has a tooltip that displays its keyboard shortcut
    // (“Effort E”) — what the landing no longer says, printed in full
    //    milieu de l'image. Elle s'ouvre au focus autant qu'au survol.
    //
    // Hence the sequence: wait for it to close, THEN release focus, THEN
    // exit the cursor. Releasing before the popover closes is useless,
    // restoring focus relights the tooltip immediately afterwards.
    await settleOverlays(page);
    await page.evaluate(() => document.activeElement?.blur());
    await page.mouse.move(60, 1000);
    await settleOverlays(page);

    // ── Controls ───────────────────────────── ──────────────────────────────
    const check = await dialog.evaluate((el, { description }) => {
      const text = el.textContent || "";
      const smartFillChip = el.querySelector('button[aria-pressed="true"]');
      const submit = [...el.querySelectorAll("button")].find(
        (b) => b.type === "submit",
      );
      return {
        // The first sentence is enough: ProseMirror can intersect nodes.
        smartFillOn: !!smartFillChip,
        hasDescription: text.includes(description.split(". ")[0]),
        // Open selector or surviving tooltip: both
        // would photograph over the modal.
        floating: [
          ...document.querySelectorAll("[data-radix-popper-content-wrapper]"),
        ]
          .filter((f) => f.getBoundingClientRect().width > 8)
          .map((f) => (f.textContent || "").trim().slice(0, 30)),
        submitEnabled: !!submit && !submit.disabled,
      };
    }, ISSUE);

    if (!check.smartFillOn) {
      throw new Error(
        `${locale}/${theme} — Smart Fill is off. The image must show it armed: ` +
          `it is the feature this capture exists for.`,
      );
    }
    if (!check.hasDescription) {
      throw new Error(
        `${locale}/${theme} — la description est absente. Le clic dans l'éditeur ` +
          `ProseMirror n'a pas pris, la frappe est restée dans le titre.`,
      );
    }
    if (check.floating.length > 0) {
      throw new Error(
        `${locale}/${theme} — une surcouche flotte encore au-dessus de la modale : ` +
          `${check.floating.map((f) => `« ${f} »`).join(", ")}. Sélecteur resté ouvert, ` +
          `ou infobulle rallumée par la restitution de focus.`,
      );
    }
    if (!check.submitEnabled) {
      throw new Error(
        `${locale}/${theme} — le bouton de création est désactivé. L'image montrerait ` +
          `un formulaire qu'on ne peut pas envoyer, ce que la légende contredit.`,
      );
    }

    const path = `${OUT}/${locale}-${theme}.png`;
    await shoot(page, path);
    return { path, locale, theme };
  } finally {
    // Nothing has been submitted: the context dies with the local draft.
    await browser.close();
  }
}

const results = [];
for (const variant of VARIANTS) {
  const r = await capture(variant);
  console.log(`  ${r.locale}/${r.theme} → ${r.path} · 2 sentences · Smart Fill on`);
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
