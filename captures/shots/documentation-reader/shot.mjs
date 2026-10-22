/**
 * Reader-facing manual figures rebuilt on the Aurora demo world: the triage
 * inbox, the trash, the personal cycle, an issue panel, the date and time
 * picker, and the public feedback board (page tab and submit dialog).
 *
 * The demo data comes from captures/world/seed/019-manuel-captures.mjs. Demo
 * prose is translated in read responses and in server-rendered documents only
 * (exact strings); identifiers, statuses and dates are unchanged. Every
 * non-GET request is blocked except the account's own tab-strip state, so
 * nothing is saved, submitted or sent.
 *
 *   CAPTURE_BASE_URL=http://localhost:3000 CAPTURE_LOCALES=de \
 *     DOC_CAPTURE_SCREENS=triage-incoming,reader-trash node captures/shots/documentation-reader/shot.mjs
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { openPage, settle, CAPTURE, CAPTURE_LOCALES } from "../../lib/browser.mjs";
import { settleDocumentationPage, captureDocumentationControl } from "../../lib/documentation-frame.mjs";
import { catalog } from "../../lib/messages.mjs";
import { demoProse, translateDemo } from "../../lib/demo-prose.mjs";

if (!["localhost", "127.0.0.1", "www.minddy.app"].includes(new URL(CAPTURE.baseUrl).hostname)) throw new Error("Reader captures require the local candidate or the canonical hosted application.");
const output = "output/documentation-captures/reader-captures.json";
let records = JSON.parse(await readFile(output, "utf8").catch(error => { if (error.code === "ENOENT") return "[]"; throw error; }));
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const locales = process.env.CAPTURE_LOCALES?.split(",").filter(Boolean);
const requested = process.env.DOC_CAPTURE_SCREENS?.split(",").filter(Boolean);
if (!locales || locales.length !== 1 || !CAPTURE_LOCALES.includes(locales[0])) throw new Error("Select exactly one locale for a bounded documentation capture batch.");
if (!requested?.length || requested.length > 3) throw new Error("Select one to three documentation screens per batch.");
const SCREENS = ["triage-incoming", "reader-trash", "reader-cycle", "reader-first-project", "database-date-time", "feedback-pages-and-views-workflow", "submit-and-follow-feedback-workflow"];
if (requested.some(screen => !SCREENS.includes(screen))) throw new Error("The documentation batch contains an unknown screen ID.");

const locale = locales[0];
const messages = await catalog(locale);
const fixture = JSON.parse(await readFile(new URL(`../documentation-work/${locale}/fixture.json`, import.meta.url), "utf8"));
const local = JSON.parse(await readFile(new URL("./localized-fixture.json", import.meta.url), "utf8"));
const mapping = { ...fixture.mapping };
local.original.forEach((text, index) => { mapping[text] = local.translations[locale][index]; });
for (const name of ["Toutes", "All", "Alle", "Todos", "Tutti"]) mapping[name] = messages.Board.defaultViewName;
const prose = demoProse(mapping);
// Longest first, so a sentence is replaced before a shorter string it contains.
const documentPairs = Object.entries(mapping).filter(([from, to]) => from !== to && from.length > 3).sort((a, b) => b[0].length - a[0].length);

/** The Aurora demo ids differ between the preview and production worlds: resolve them. */
async function resolveDemo(page) {
  await page.goto(CAPTURE.baseUrl + "/home", { waitUntil: "load" });
  return page.evaluate(async () => {
    const json = async url => { const response = await fetch(url); if (!response.ok) throw new Error(`${url}: ${response.status}`); return response.json(); };
    const projects = await json("/api/projects");
    const aurora = (projects.projects ?? projects).find(project => project.key === "AUR");
    if (!aurora) throw new Error("The demo account has no Aurora project.");
    const settings = await json(`/api/projects/${aurora.id}/feedback/settings`);
    return { projectId: aurora.id, boardToken: settings.board?.token };
  });
}

async function run(authed, resolved = null) {
  const { browser, context, page } = await openPage({ locale, authed, theme: "light", viewport: { width: 1440, height: 1100 }, launchArgs: ["--force-color-profile=srgb", "--disable-lcd-text"] });
  page.setDefaultTimeout(30000);
  const writes = [], adaptations = new Set();
  try {
    const demo = resolved ?? await resolveDemo(page);
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== new URL(CAPTURE.baseUrl).origin) return route.fallback();
      if (request.method() !== "GET") {
        if (/^\/api\/me\/(app-tabs|local-snapshots)(\/|$)/.test(url.pathname)) return route.fallback();
        writes.push({ method: request.method(), path: url.pathname });
        return route.abort("blockedbyclient");
      }
      // Rewrite only the read APIs that carry demo prose. Server-rendered
      // documents are left intact (rewriting them breaks hydration); the
      // public board's demo text is translated in the rendered page instead.
      if (!/^\/api\/(projects|trash|documents|me\/cycle|me\/board|all|public)(\/|$)/.test(url.pathname)) return route.fallback();
      const response = await route.fetch().catch(() => null);
      if (!response) return;
      if (!response.ok()) return route.fulfill({ response });
      let body; try { body = await response.json(); } catch { return route.fulfill({ response }); }
      const localized = translateDemo(body, prose);
      if (JSON.stringify(localized) !== JSON.stringify(body)) adaptations.add(url.pathname);
      return route.fulfill({ response, json: localized });
    });

    /** Display-only translation of exact demo strings in the rendered page. */
    async function localizeRenderedText() {
      const changed = await page.evaluate(pairs => {
        const map = new Map(pairs);
        let count = 0;
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node.textContent.trim();
          if (map.has(text)) { node.textContent = node.textContent.replace(text, map.get(text)); count += 1; }
        }
        return count;
      }, documentPairs);
      if (changed) adaptations.add("rendered public board text");
    }

    async function capture(screen, path, target, action, viewport = { width: 1440, height: 1100 }) {
      if (!requested.includes(screen)) return;
      try {
      await page.setViewportSize(viewport);
      await page.goto(CAPTURE.baseUrl + path, { waitUntil: "load" });
      await settleDocumentationPage(page, locale);
      if (action) await action();
      const control = (typeof target === "function" ? target() : page.locator(target)).first();
      await control.waitFor({ state: "visible" });
      await settle(page);
      await page.mouse.move(8, 8);
      await settleDocumentationPage(page, locale);
      const src = `/documentation/${locale}/${screen}.png`;
      const dimensions = await captureDocumentationControl(page, control, "public" + src);
      records = records.filter(record => record.locale !== locale || record.screen !== screen);
      records.push({ locale, screen, src, date: new Date().toISOString().slice(0, 10), sourceCommit: commit, workingTreeChanges: true, runtime: CAPTURE.baseUrl, route: path.replace(/[0-9a-f-]{36}|\/f\/[^/?]+/g, match => match.startsWith("/f/") ? "/f/<board>" : "<id>"), ...dimensions, submitted: false, blockedWrites: [...writes], displayAdaptation: [...adaptations], limitation: "Actual visible controls on the seeded Aurora demo; no save, submission or notification is claimed." });
      console.log(`${locale}/${screen}: captured at ${dimensions.deviceScaleFactor}x in light mode`);
      } catch (error) {
        await mkdir("output/documentation-captures", { recursive: true });
        await page.screenshot({ path: `output/documentation-captures/reader-error-${locale}-${screen}.png` }).catch(() => {});
        throw error;
      }
    }

    if (authed) {
      const t = text => mapping[text] ?? text;
      await capture("triage-incoming", `/projects/${demo.projectId}/triage`, "main", async () => {
        await page.locator("main").getByText(t("Review an incoming keyboard report"), { exact: true }).first().waitFor();
      }, { width: 1440, height: 820 });
      await capture("reader-trash", "/trash", "main", async () => {
        // The trash is not served by a translated read API: localize what it renders.
        await page.getByText("Check the mobile navigation", { exact: true }).first().waitFor();
        await localizeRenderedText();
      }, { width: 1280, height: 560 });
      await capture("reader-cycle", "/all", "main", async () => {
        await page.getByText(/^AUR-\d+$/).first().waitFor();
        await page.locator("main").getByRole("button", { name: new RegExp(`^${messages.Board.cycleTab}`) }).first().click();
        await page.getByText(/^AUR-\d+$/).first().waitFor();
      }, { width: 1600, height: 1080 });
      // A saved tab can swallow the `?issue=` link: open the issue from its card.
      const openIssue = async key => {
        const dialog = page.getByRole("dialog").first();
        if (!(await dialog.isVisible())) await page.getByText(key, { exact: true }).first().click();
        await dialog.getByRole("button", { name: messages.IssueUI.changeStatusAria, exact: true }).waitFor();
        return dialog;
      };
      await capture("reader-first-project", `/projects/${demo.projectId}`, () => page.getByRole("dialog").first(), async () => {
        await page.getByText("AUR-3", { exact: true }).first().waitFor();
        await openIssue("AUR-3");
      }, { width: 1280, height: 1080 });
      await capture("database-date-time", `/projects/${demo.projectId}`, () => page.locator("[data-radix-popper-content-wrapper]").last(), async () => {
        await page.getByText("AUR-2", { exact: true }).first().waitFor();
        const dialog = await openIssue("AUR-2");
        await dialog.getByRole("button", { name: messages.IssueUI.changeDueDateAria, exact: true }).click();
        const popover = page.locator("[data-radix-popper-content-wrapper]").last();
        const addTime = popover.getByRole("switch", { name: messages.DatePicker.addTime });
        if (await addTime.getAttribute("aria-checked") !== "true") await addTime.click();
        await popover.getByText(messages.DatePicker.time, { exact: true }).first().waitFor();
      });
    } else {
      if (!demo?.boardToken) throw new Error("The Aurora feedback board is not published.");
      const board = `/f/${demo.boardToken}`;
      await capture("feedback-pages-and-views-workflow", board, "body", async () => {
        await page.getByRole("link", { name: "Feedback guide" }).or(page.getByRole("tab", { name: "Feedback guide" })).first().click();
        await page.getByText("Read requests, vote for useful changes and follow their progress.").first().waitFor();
        await localizeRenderedText();
      }, { width: 1280, height: 620 });
      await capture("submit-and-follow-feedback-workflow", board, () => page.getByRole("dialog").first(), async () => {
        // The button only works once the board has hydrated: retry until the composer opens.
        const dialog = page.getByRole("dialog").first();
        for (let attempt = 0; attempt < 10 && !(await dialog.isVisible()); attempt += 1) {
          await page.getByRole("button", { name: messages.PublicFeedback.composerTitle }).first().click();
          await page.waitForTimeout(1000);
        }
        await dialog.waitFor();
        const [title, body] = local.drafts[locale];
        await dialog.locator("input, textarea").first().fill(title);
        await dialog.locator("textarea, [contenteditable=true]").last().fill(body);
        await localizeRenderedText();
      }, { width: 1280, height: 1000 });
    }
    return demo;
  } finally {
    await mkdir("output/documentation-captures", { recursive: true });
    await writeFile(output, JSON.stringify(records, null, 2) + "\n");
    await browser.close();
  }
}

// The signed-in run resolves the demo ids; the public board is then captured signed out.
const publicScreens = requested.filter(screen => screen.startsWith("feedback-") || screen.startsWith("submit-"));
const demo = await run(true);
if (publicScreens.length) await run(false, demo);
