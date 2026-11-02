/**
 * Landing feature cards — the screenshots a card shows in its lower right
 * corner, in every locale and both themes (see `intent.md`).
 *
 * Each shot isolates ONE element (a dialog, a popover, the top of a pull
 * request) on a transparent background: everything else on the page is made
 * invisible, so the card's own color shows around it. Masters go to
 * `captures/shots/card-<name>/out/<locale>-<theme>.png`, and the served
 * WebP to `public/captures/cards/<name>-<locale>-<theme>.webp`, which
 * `components/marketing/card-shot.tsx` reads.
 *
 *   CAPTURE_BASE_URL=http://localhost:3000 node captures/shots/landing-cards/shot.mjs
 *   CARD_SHOTS=objective,inbox CAPTURE_LOCALES=en CAPTURE_THEMES=light node …
 */
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { openPage, settle, shoot, CAPTURE, CAPTURE_VARIANTS } from "../../lib/browser.mjs";
import { PREVIEW_AURORA_PROJECT_ID } from "../../lib/config.mjs";
import { ROOT } from "../../lib/env.mjs";
import { catalog } from "../../lib/messages.mjs";
import { serveFixture } from "../pull-request/serve-fixture.mjs";
import { PR_NUMBER } from "../pull-request/fixture.mjs";

const VIEWPORT = { width: 1440, height: 900 };
const PUBLIC_DIR = resolve(ROOT, "public/captures/cards");
/** Cards are under 400 CSS px wide and crop into these images; 1600 px keeps text sharp at 2×. */
const SERVED_WIDTH = 1600;

const project = `/projects/${PREVIEW_AURORA_PROJECT_ID}`;

/** Shows only `selector` and its content; the page around it, backgrounds included, disappears. */
async function isolate(page, selector, { keepPointer = false } = {}) {
  await page.addStyleTag({
    content: `
      html, body { background: transparent !important; }
      body * { visibility: hidden !important; }
      ${selector}, ${selector} * { visibility: visible !important; }
      [data-slot="dialog-overlay"], [data-slot="sheet-overlay"] { display: none !important; }
      nextjs-portal { display: none !important; }
    `,
  });
  if (!keepPointer) await page.mouse.move(2, 2);
  await page.waitForTimeout(200);
}

/** The manual's inbox examples (see `documentation-work/shot.mjs`), dated on the capture clock. */
function demoNotifications(fixture) {
  const day = CAPTURE.frozenNow.slice(0, 10);
  const titles = [
    "Add keyboard shortcuts to the command palette",
    "Rework the onboarding checklist",
    "Dark mode flickers on first paint",
    "Cache avatar lookups on the members endpoint",
    "Public roadmap page",
    "Slack notifications for mentions",
  ];
  return titles.map((title, index) => ({
    id: `card-notification-${index}`,
    type: ["mention", "assigned", "comment"][index % 3],
    created_at: `${day}T${["10:15", "09:45", "08:30", "08:15", "08:00", "07:45"][index]}:00.000Z`,
    read_at: index % 3 === 2 ? `${day}T09:00:00.000Z` : null,
    issue_id: fixture.issueId,
    issue_number: [2, 3, 1, 4, 11, 10][index],
    issue_title: fixture.mapping[title] ?? title,
    project_id: fixture.projectId,
    project_key: "AUR",
    actor_name: ["Alice", "Tom", "Camille"][index % 3],
    actor_avatar_seed: ["alice", "tom", "camille-aurora"][index % 3],
    from_numo: false,
    via_mcp: false,
    via_smart_assign: false,
  }));
}

const SHOTS = {
  /** The top of a pull request: title, author line, diff size, branches, start of the description. */
  "pull-request": async (page) => {
    await serveFixture(page);
    await page.goto(`${CAPTURE.baseUrl}/pull-requests`, { waitUntil: "domcontentloaded" });
    await settle(page, { expect: `text=#${PR_NUMBER}` });
    const title = page.getByRole("heading", { level: 1 }).first();
    await title.waitFor();
    // Title, author line and branches, then straight to the description: the
    // insights, status rows and tabs between them are hidden.
    await page.addStyleTag({
      content: `[data-testid="pr-insights"], [data-testid^="pr-status-card"], [role="tablist"],
        [data-testid="pr-timeline-event"]:not(:has([data-testid="pr-description"])), [data-testid="pr-comment-composer-region"] { display: none !important; }`,
    });
    await page.waitForTimeout(300);
    const box = await title.evaluate((el) => {
      // The closest block holding both the title and the description.
      let column = el.parentElement;
      while (column && !column.querySelector('[data-testid="pr-description"]')) column = column.parentElement;
      column?.setAttribute("data-card-shot", "");
      const title = el.getBoundingClientRect();
      const description = document.querySelector('[data-testid="pr-description"]').getBoundingClientRect();
      return { x: description.x - 8, y: title.y - 12, width: description.width + 16 };
    });
    await isolate(page, "[data-card-shot]");
    return { clip: { ...box, height: 300 } };
  },

  /** The "Share view" dialog of the board's default view. */
  "share-view": async (page, m) => {
    await page.goto(`${CAPTURE.baseUrl}${project}`, { waitUntil: "domcontentloaded" });
    await settle(page, { expect: "text=AUR-2" });
    // The stored view name comes with the document (MIN-880), untranslated:
    // match the options button of whichever view is first.
    const [before, after] = m.Board.viewOptions.split("{name}");
    const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await page
      .getByRole("button", { name: new RegExp(`^${escape(before)}.+${escape(after)}$`) })
      .first()
      .click();
    await page.getByText(m.Board.shareView, { exact: true }).last().click();
    const dialog = page.getByRole("dialog").last();
    await dialog.waitFor();
    // The view was created with the demo account's language, as data: show it
    // under the name a user of this language would have been given.
    await dialog.evaluate((el, name) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        node.textContent = node.textContent.replace(/\b(All|Toutes|Alle|Todos|Tutti)\b/, name);
      }
      el.setAttribute("data-card-shot", "");
    }, m.Board.defaultViewName);
    await isolate(page, "[data-card-shot]");
    return dialog;
  },

  /** The inbox popover, all notifications. */
  inbox: async (page, m, locale) => {
    // The demo account has no notifications: the inbox reads the manual's
    // demonstration ones, in the capture's language. Nothing is written.
    const fixture = JSON.parse(
      await readFile(resolve(ROOT, `captures/shots/documentation-work/${locale}/fixture.json`), "utf8"),
    );
    await page.route(/\/api\/notifications(\?|$)/, (route) =>
      route.request().method() === "GET" ? route.fulfill({ json: demoNotifications(fixture) }) : route.abort(),
    );
    // The project page reads notifications from the browser; /home gets them
    // with the document (MIN-880, lib/server-seed.ts), past this route.
    await page.goto(`${CAPTURE.baseUrl}${project}`, { waitUntil: "domcontentloaded" });
    await settle(page, { expect: "text=AUR-2" });
    await page.getByRole("button", { name: m.Nav.inbox, exact: true }).click();
    const popover = page.locator("#inbox-popover");
    await popover.waitFor();
    await popover
      .locator("button[aria-pressed]")
      .filter({ hasText: new RegExp(`^${m.Inbox.filterAll}`) })
      .click();
    // Fails when the notifications came with the document instead of the route.
    await popover.getByText("AUR-2", { exact: false }).first().waitFor({ timeout: 10_000 });
    // The popover focuses its first control on opening; the picture shows it at rest.
    await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
    await page.waitForTimeout(600);
    // The popover closes when the pointer leaves it: shoot its box, without moving the mouse.
    const box = await popover.evaluate((el) => {
      el.setAttribute("data-card-shot", "");
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    await isolate(page, "[data-card-shot]", { keepPointer: true });
    return { clip: box };
  },
};

/** The objective composer, filled in: title, two lines of description, lead, target date, color. */
SHOTS.objective = async (page, m) => {
  await page.goto(`${CAPTURE.baseUrl}${project}/objectives`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: m.Objectives.newObjective, exact: true }).first().click();
  const dialog = page.getByRole("dialog").first();
  await dialog.waitFor();
  await dialog.locator("textarea").first().fill(m.Landing.cardMentions_objective);
  await dialog.locator("[contenteditable=true]").first().click();
  await page.keyboard.type(m.Landing.cardObjective_description);
  const pick = async (button, option) => {
    await button.click();
    const popper = page.locator("[data-radix-popper-content-wrapper]").last();
    await popper.waitFor();
    await option(popper).click();
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(250);
  };
  // By position, not by label: the lead is the first member, the color the sixth.
  await pick(dialog.getByRole("button", { name: m.IssueUI.changeAssigneeAria, exact: true }).first(), (p) =>
    p.getByRole("option").nth(1),
  );
  await pick(dialog.getByRole("button", { name: m.Objectives.targetDatePlaceholder, exact: true }).first(), (p) =>
    p.locator("td button").filter({ hasText: /^20$/ }).first(),
  );
  await pick(dialog.getByRole("button", { name: m.Objectives.colorFieldLabel, exact: true }).first(), (p) => p.getByRole("option").nth(6));
  await dialog.evaluate((el) => el.setAttribute("data-card-shot", ""));
  await isolate(page, "[data-card-shot]");
  return dialog;
};

/** The relation picker of an issue: "Blocked by", its question, and the issues to pick. */
SHOTS.relations = async (page, m) => {
  await page.goto(`${CAPTURE.baseUrl}${project}`, { waitUntil: "domcontentloaded" });
  await settle(page, { expect: "text=AUR-2" });
  await page.getByText("AUR-2", { exact: true }).first().click();
  await page.getByRole("dialog").first().waitFor();
  await page.getByRole("button", { name: m.Relations.addRelationAria, exact: true }).click();
  await page.locator("[data-radix-popper-content-wrapper]").last().getByText(m.Relations.blocked_by, { exact: true }).click();
  await page.getByPlaceholder(m.Relations.pick_blocked_by, { exact: true }).waitFor();
  await page.getByText("AUR-3", { exact: true }).last().waitFor();
  // The picker around its search field (the command palette), not the issue panel under it.
  const input = page.getByPlaceholder(m.Relations.pick_blocked_by, { exact: true });
  await input.evaluate((el) =>
    (el.closest("[cmdk-root]") ?? el.closest("[data-radix-popper-content-wrapper]") ?? el.closest("[role=dialog]"))
      ?.setAttribute("data-card-shot", ""),
  );
  await isolate(page, "[data-card-shot]");
  return page.locator("[data-card-shot]");
};

const requested = process.env.CARD_SHOTS?.split(",") ?? Object.keys(SHOTS);
const themes = process.env.CAPTURE_THEMES?.split(",");
await mkdir(PUBLIC_DIR, { recursive: true });

for (const name of requested) {
  const run = SHOTS[name];
  if (!run) throw new Error(`Unknown card shot "${name}". Known: ${Object.keys(SHOTS).join(", ")}`);
  for (const { locale, theme } of CAPTURE_VARIANTS) {
    if (themes && !themes.includes(theme)) continue;
    const { browser, page } = await openPage({ theme, locale, viewport: VIEWPORT });
    try {
      const m = await catalog(locale);
      const target = await run(page, m, locale);
      const master = `captures/shots/card-${name}/out/${locale}-${theme}.png`;
      if (target.clip) await shoot(page, resolve(ROOT, master), { clip: target.clip, omitBackground: true });
      else await shoot(target, resolve(ROOT, master), { omitBackground: true });
      await sharp(resolve(ROOT, master))
        .resize({ width: SERVED_WIDTH, withoutEnlargement: true })
        .webp({ quality: 92, alphaQuality: 100 })
        .toFile(resolve(PUBLIC_DIR, `${name}-${locale}-${theme}.webp`));
      console.log(`${name} ${locale}/${theme}: captured`);
    } finally {
      await browser.close();
    }
  }
}
