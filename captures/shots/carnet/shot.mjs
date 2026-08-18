/**
 * scratchpad — Camille's task notebook, opened by G then N.
 *
 * See `intent.md`, especially for the window: it is the only capture that does not
 * does not take 1447 × 1085, because the modal is 90vw × 90vh when its content
 * has fixed metrics.
 *
 * node captures/shots/carnet/shot.mjs # produces the PNGs
 * node captures/shots/carnet/shot.mjs --publish # + book on the landing
 */
import { openPage, settle, shoot, CAPTURE } from "../../lib/browser.mjs";
import { publishShot, writeManifest } from "../../lib/publish.mjs";

const SLOT = "scratchpad";
const OUT = "captures/shots/carnet/out";
const AURORA = "6cd36606-c297-4920-8ce3-31b5f3697be8";

/** 4/3. Smaller than other captures: see `intent.md`, § Framing. */
const VIEWPORT = { width: 1024, height: 768 };

/** Section headings are data — English in both variants. */
const SECTIONS = ["Before the release", "Loose ends"];
const TASK_COUNT = 9;

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

    // The shortcut that the landing quotes verbatim. We hit it on a board
    // stabilized, before any open surface: nothing to lose on the keyboard.
    await page.keyboard.press("g");
    await page.keyboard.press("n");

    const modal = page.getByRole("dialog").first();
    await modal.waitFor({ state: "visible", timeout: 10_000 });

    // Wait for the DOCUMENT, not just the modal: the note arrives by a
    // query, and section buttons are ProseMirror decorations that
    // the application recreates the content. Hovering before this time loses the hover.
    await page.getByText(SECTIONS[1], { exact: true }).waitFor({ state: "visible", timeout: 10_000 });

    const launch = page.locator(".scratchpad-section-launch");
    await launch.nth(1).waitFor({ state: "attached", timeout: 10_000 });

    const check = await page.evaluate(
      ({ sections, expected }) => {
        const dialog = document.querySelector('[role="dialog"]');
        const text = dialog?.textContent || "";
        const tasks = dialog?.querySelectorAll("ul li, ol li") || [];
        const struck = [...tasks].filter((el) =>
          [...el.querySelectorAll("*"), el].some((n) =>
            getComputedStyle(n).textDecorationLine.includes("line-through"),
          ),
        ).length;
        return {
          missing: sections.filter((s) => !text.includes(s)),
          tasks: tasks.length,
          struck,
          expected,
        };
      },
      { sections: SECTIONS, expected: TASK_COUNT },
    );

    if (check.missing.length > 0) {
      throw new Error(
        `${locale}/${theme} — section(s) absente(s) : ${check.missing.join(", ")}. ` +
          `Le carnet de démo a changé, ou la note ne s'est pas chargée.`,
      );
    }
    if (check.tasks !== TASK_COUNT) {
      throw new Error(
        `${locale}/${theme} — ${check.tasks} tâches au lieu de ${TASK_COUNT}. ` +
          `Relancer captures/world/seed/005-carnet.mjs, ou corriger l'intention.`,
      );
    }
    if (check.struck < 3) {
      throw new Error(
        `${locale}/${theme} — ${check.struck} tâche(s) barrée(s) : les états ne se ` +
          `distinguent pas assez à l'œil.`,
      );
    }
    // The hover comes LAST, just before the take, and it is checked in one
    // single moment: the section background and the tooltip are placed together by
    // `mouseenter`, but a final rendering pass of the editor recreates the
    // widget under the cursor — the browser then issues `mouseleave` on the
    // node removed and both markers disappear. Check them one after the other
    // the other allowed a half-off state to pass (seen on fr/dark).
    for (let attempt = 1; ; attempt += 1) {
      await launch.first().hover({ force: true });
      const shown = await page
        .waitForFunction(
          () =>
            !!document.querySelector(".scratchpad-section-box.is-visible") &&
            !!document.querySelector(".scratchpad-section-tip.is-visible"),
          undefined,
          { timeout: 3_000 },
        )
        .then(() => true)
        .catch(() => false);
      if (shown) break;
      if (attempt === 4) {
        throw new Error(
          `${locale}/${theme} — le survol de section ne tient pas après quatre ` +
            `tentatives : ni fond de section ni infobulle. L'image ne montrerait ` +
            `pas l'action de section.`,
        );
      }
      await page.mouse.move(10, 10);
      await page.waitForTimeout(400);
    }

    const path = `${OUT}/${locale}-${theme}.png`;
    await shoot(page, path);
    return { path, locale, theme, tasks: check.tasks, struck: check.struck };
  } finally {
    await browser.close();
  }
}

const results = [];
for (const variant of VARIANTS) {
  const r = await capture(variant);
  console.log(
    `  ${r.locale}/${r.theme} → ${r.path} · ${r.tasks} tâches, ${r.struck} barrées, section survolée`,
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
