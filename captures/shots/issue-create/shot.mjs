/**
 * workflowIssue — the creation modal, populated with AUR-2, before the click.
 *
 * See `intent.md`: this capture replaced the Plan tab
 * (`shots/issue-plan`), which showed the agent's work under a caption
 * announcing that of the user.
 *
 * node captures/shots/issue-create/shot.mjs # produces the PNGs
 * node captures/shots/issue-create/shot.mjs --publish # + book on the landing
 */
import { openPage, settle, shoot, CAPTURE, DEFAULT_VIEW_NAMES } from "../../lib/browser.mjs";
import { publishShot, writeManifest } from "../../lib/publish.mjs";

const SLOT = "workflowIssue";
const OUT = "captures/shots/issue-create/out";
const AURORA = "6cd36606-c297-4920-8ce3-31b5f3697be8";

/** 4/3, the executive report. Rule common to all five 4/3 locations. */
const VIEWPORT = { width: 1447, height: 1085 };

/**
 * The ticket entered is AUR-2, verbatim: the agent run and the pull request
 * photographed in the following two times carry the SAME ticket. These are
 * also data — therefore identical in French and English, and as such
 * the only verification anchors that do not break every other variation.
 */
const ISSUE = {
  title: "Add keyboard shortcuts to the command palette",
  description:
    "Power users live in the palette but still reach for the mouse to run an action. " +
    "Show the shortcut next to each row, and make it work from anywhere in the app.",
  category: "Feature",
  effort: "M",
};

/**
 * Accessible labels of the property row, and the only option label
 * that is translated (the priority — the efforts are letters, the categories
 * data). The S/P/E/L keyboard shortcuts would have avoided this table, but
 * they are filtered as long as the focus is in the title or description.
 */
const ARIA = {
  fr: {
    dialog: "Nouveau ticket",
    priority: "Changer la priorité",
    effort: "Changer l'effort",
    categories: "Modifier les catégories",
    highPriority: "Haute",
    smartFill: "Smart-fill",
  },
  en: {
    dialog: "New issue",
    priority: "Change priority",
    effort: "Change effort",
    categories: "Edit categories",
    highPriority: "High",
    smartFill: "Smart-fill",
  },
};

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
const VARIANTS = [
  { locale: "fr", theme: "light" },
  { locale: "fr", theme: "dark" },
  { locale: "en", theme: "light" },
  { locale: "en", theme: "dark" },
];

async function capture({ locale, theme }) {
  const words = ARIA[locale];
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
    const dialog = page.getByRole("dialog", { name: words.dialog });
    await dialog.waitFor({ state: "visible", timeout: 10_000 });

    // The title field is `autoFocus`: we type directly in it.
    await page.keyboard.type(ISSUE.title, { delay: 6 });

    // The description is a ProseMirror editor, not a textarea: we enter
    // on click, otherwise the typing continues to arrive in the title.
    const editor = dialog.locator('[contenteditable="true"]').first();
    await editor.click();
    await page.keyboard.type(ISSUE.description, { delay: 3 });

    // ── Smart-fill: cut it, otherwise there is nothing to fill ───────────────
    // MIN-260 has Smart-fill armed by DEFAULT, and when active the row does not
    // keeps only the three properties it does not touch (status, assigned,
    // deadline): priority, effort, categories and objective are REMOVED from the DOM,
    // not grayed out. The script therefore no longer found them.
    //
    // The caption of the landing says “One title, two sentences, one priority”:
    // This is the entire row that the image should show. We therefore cut the
    // rocker — punctual gesture, rested at each opening, which does not change any
    // account setting.
    const smartFill = dialog.getByRole("button", { name: words.smartFill });
    await smartFill.waitFor({ state: "visible", timeout: 10_000 });
    if ((await smartFill.getAttribute("aria-pressed")) === "true") {
      await smartFill.click();
    }
    await dialog
      .getByRole("button", { name: words.priority })
      .waitFor({ state: "visible", timeout: 10_000 });

    // ── Properties ─────────────────────────── ───────────────────────────
    // The list is rebuilt by cmdk when it opens: click on
    // the option as soon as it appears falls every other time on a node already
    // detached. So we wait for the list, THEN the option.
    const pick = async (trigger, option) => {
      await dialog.getByRole("button", { name: trigger }).click();
      const list = page.getByRole("listbox").last();
      await list.waitFor({ state: "visible", timeout: 10_000 });
      const item = list.getByRole("option", { name: option, exact: true });
      await item.waitFor({ state: "visible", timeout: 10_000 });
      await item.click();
    };

    // The categories FIRST: it is a multi-select, it remains open after the
    // selection and must be closed by hand. The next two close
    // alone, so nothing is left behind when taken.
    await pick(words.categories, ISSUE.category);
    await page.keyboard.press("Escape");
    if (!(await dialog.isVisible())) {
      throw new Error(
        `${locale}/${theme} — l'Échap qui devait fermer le sélecteur de catégories ` +
          `a fermé la modale. Le popover n'était donc pas ouvert au moment de la touche.`,
      );
    }

    await pick(words.priority, words.highPriority);
    await pick(words.effort, ISSUE.effort);

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
    const check = await dialog.evaluate((el, { title, description, category }) => {
      const text = el.textContent || "";
      const titleField = el.querySelector("textarea");
      const submit = [...el.querySelectorAll("button")].find(
        (b) => b.type === "submit",
      );
      return {
        // The first sentence is enough: ProseMirror can intersect nodes.
        hasTitle: (titleField?.value || "").includes(title),
        hasDescription: text.includes(description.split(". ")[0]),
        hasCategory: text.includes(category),
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

    if (!check.hasTitle) {
      throw new Error(
        `${locale}/${theme} — le titre n'est pas dans le champ. La frappe est ` +
          `partie ailleurs : la modale n'avait pas le focus, ou elle n'était pas ouverte.`,
      );
    }
    if (!check.hasDescription) {
      throw new Error(
        `${locale}/${theme} — la description est absente. Le clic dans l'éditeur ` +
          `ProseMirror n'a pas pris, la frappe est restée dans le titre.`,
      );
    }
    if (!check.hasCategory) {
      throw new Error(
        `${locale}/${theme} — la catégorie « ${ISSUE.category} » n'apparaît pas. ` +
          `Les catégories du projet de démo ne sont plus en anglais ?`,
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
  console.log(`  ${r.locale}/${r.theme} → ${r.path} · titre + 2 phrases · haute / M / Feature`);
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
