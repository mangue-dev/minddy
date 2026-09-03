/**
 * featurePalette — the ⌘K palette open on the Aurora board.
 *
 * See `intent.md` for what the image should carry.
 *
 * Ce que l'inspection a appris :
 * - the palette opens correctly with `Meta+K`;
 * - the TYPED QUERY changes everything, and what it comes up GETS OLD. “ticket”
 * / “issue” gave the desired image in July; since then, the CSV export and
 * the settings entries have been added to the action groups, and they
 * pushed the “Tickets” group below the waterline. The palette
 * only came back from navigation — the exact opposite of the `alt` of
 * location, “a search that goes back to tickets AND actions”;
 * - “board” goes up both, and fits in the height of the list: one
 * page (the public board) and four tickets whose title bears the word;
 * - it is also the SAME word in both languages, where “ticket” had
 * need to be translated into “outcome”. One less request to maintain.
 *
 * node captures/shots/palette/shot.mjs # produces the PNGs
 * node captures/shots/palette/shot.mjs --publish # + book on the landing
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

const SLOT = "featurePalette";
const OUT = "captures/shots/palette/out";
const AURORA = "6cd36606-c297-4920-8ce3-31b5f3697be8";

/** Same window as heroBoard: both images must have the same scale. */
const VIEWPORT = { width: 1736, height: 1085 };

/**
 * The query typed. The same word in both languages: it is English in both
 * demo world ticket titles, and it is also the name of the public board
 * on the interface side — this is what brings up a page AND tickets.
 */
// In English, "board" also matches the word "keyboard" in two settings
// actions. The extra letter keeps the intended public-board action and four
// tickets in frame without changing the query used by the other locales.
const QUERY_BY_LOCALE = { en: "board l" };

/**
 * A ticket result can be recognized by its identifier. No word limit
 * head: the title and the identifier are two neighboring nodes, therefore the text
 * concatenated from the line says “…from the boardAUR-5” — there is no
 * word boundary between "d" and "A", and a `\b` would never match.
 */
const ISSUE_ROW = /[A-Z]{2,4}-\d+/;

const PUBLISH = process.argv.includes("--publish");
const VARIANTS = CAPTURE_VARIANTS;

async function capture({ locale, theme }) {
  const query = QUERY_BY_LOCALE[locale] ?? "board";
  const { browser, page } = await openPage({ theme, locale, viewport: VIEWPORT });
  try {
    await page.goto(`${CAPTURE.baseUrl}/projects/${AURORA}`, { waitUntil: "domcontentloaded" });
    await settle(page, { expect: "text=AUR-1" });

    // The board must be COMPLETELY returned before opening the palette: this is
    // him that we will see behind, and an empty tab bar would be noticed
    // as much here as on the capture of the hero.
    await page
      .getByRole("button", { name: DEFAULT_VIEW_NAMES[locale], exact: true })
      .waitFor({ state: "visible", timeout: 15_000 });

    await page.keyboard.press("Meta+k");
    const dialog = page.getByRole("dialog").first();
    await dialog.waitFor({ state: "visible", timeout: 10_000 });

    // We type IN the field, not on the global keyboard: the palette comes alive again
    // when opening, and a global keystroke loses the first characters — a
    // run a produit « ssue » au lieu de « issue ». `pressSequentially` attend
    // that the element is ready before each touch.
    const input = dialog.getByRole("textbox").first();
    await input.waitFor({ state: "visible", timeout: 10_000 });
    await input.pressSequentially(query, { delay: 60 });

    const typed = await input.inputValue();
    if (typed !== query) {
      throw new Error(
        `${locale}/${theme} — search input contains "${typed}" instead of "${query}".`,
      );
    }

    // We wait until the list is FILLED, not an arbitrary delay: the
    // search is asynchronous and the palette displays empty while waiting. THE
    // last expected result is a ticket, and it is he who puts the most
    // time to come — actions are local, ticket searching is not.
    await page
      .getByRole("option")
      .filter({ hasText: ISSUE_ROW })
      .nth(3)
      .waitFor({ state: "visible", timeout: 10_000 });

    /**
     * What the image should be about, checked on what is ACTUALLY IN THE
     * FRAME — a result below the list fold is not seen
     * no more than an absent result.
     *
     * The old control counted the results (“at least 7”): it remained
     * green while the group “Tickets” walked out of the frame, pushed out
     * by two new action inputs. Counting says nothing about what we see.
     */
    const check = await page.evaluate((pattern) => {
      const list = document.querySelector('[role="listbox"]');
      const bottom = list?.getBoundingClientRect().bottom ?? 0;
      const rows = [...document.querySelectorAll('[role="option"]')].map((el) => ({
        text: el.textContent || "",
        visible: el.getBoundingClientRect().bottom <= bottom + 1,
      }));
      const re = new RegExp(pattern);
      return {
        issues: rows.filter((r) => r.visible && re.test(r.text)).length,
        actions: rows.filter((r) => r.visible && !re.test(r.text)).length,
        clipped: rows.filter((r) => !r.visible).map((r) => r.text.trim().slice(0, 40)),
      };
    }, ISSUE_ROW.source);

    if (check.issues < 3 || check.actions < 1) {
      throw new Error(
          `${locale}/${theme} — the palette shows ${check.actions} action(s) and ` +
          `${check.issues} issue(s) for "${query}". This shot requires both result types; ` +
          `choose a different query.`,
      );
    }
    if (check.clipped.length > 0) {
      throw new Error(
        `${locale}/${theme} — ${check.clipped.length} résultat(s) coupé(s) par le bas de la ` +
          `liste : ${check.clipped.join(" · ")}. Une ligne tranchée se lit comme une image cassée.`,
      );
    }
    const results = check.issues + check.actions;

    const path = `${OUT}/${locale}-${theme}.png`;
    await shoot(page, path);
    return { path, results, locale, theme };
  } finally {
    await browser.close();
  }
}

const results = [];
for (const variant of VARIANTS) {
  const result = await capture(variant);
  console.log(`  ${result.locale}/${result.theme} → ${result.path} (${result.results} résultats)`);
  results.push(result);
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
