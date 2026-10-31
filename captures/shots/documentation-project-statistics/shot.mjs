/**
 * Project statistics (MIN-878) on the Lumen demo project: the manual figures
 * in every locale, and the pull request images.
 *
 *   CAPTURE_MODE=docs CAPTURE_LOCALES=en,fr node captures/shots/documentation-project-statistics/shot.mjs
 *   CAPTURE_MODE=pr node captures/shots/documentation-project-statistics/shot.mjs
 */
import { mkdir } from "node:fs/promises";
import { openPage, settle, CAPTURE, CAPTURE_LOCALES } from "../../lib/browser.mjs";
import { settleDocumentationPage, captureDocumentationControl } from "../../lib/documentation-frame.mjs";
import { catalog } from "../../lib/messages.mjs";
import { openDemoWorld } from "../../lib/guards.mjs";

const MODE = process.env.CAPTURE_MODE ?? "docs";
const locales = (process.env.CAPTURE_LOCALES?.split(",").filter(Boolean)) ?? CAPTURE_LOCALES;
const world = await openDemoWorld();
const lumen = world.demoProjects.find((project) => project.key === "LUM" && !project.deleted_at);
if (!lumen) throw new Error("The Lumen demo project is missing: run captures/world/seed/022-projet-lumen.mjs.");
const route = `/projects/${lumen.id}/settings?tab=general`;
// The Lumen history ends on the day it was seeded: compare against today.
const frozenNow = new Date().toISOString();

async function open(locale, viewport = { width: 1440, height: 1600 }) {
  const session = await openPage({ locale, theme: "light", viewport, frozenNow, launchArgs: ["--force-color-profile=srgb", "--disable-lcd-text"] });
  // Nothing is edited: every business write is refused.
  await session.context.route("**/api/**", (request) =>
    request.request().method() === "GET" || new URL(request.request().url()).pathname.startsWith("/api/me/app-tabs")
      ? request.fallback() : request.abort("blockedbyclient"));
  session.page.setDefaultTimeout(30000);
  await session.page.goto(CAPTURE.baseUrl + route, { waitUntil: "load" });
  const messages = await catalog(locale);
  const section = session.page.locator("#settings-section-project-statistics");
  await section.getByRole("heading", { name: messages.ProjectStats.momentumTitle, exact: true }).waitFor();
  await section.locator("circle[role=link]").first().waitFor();
  await settle(session.page);
  return { ...session, messages, section };
}

const sectionNamed = (section, title) => section.locator("section").filter({ has: section.page().getByRole("heading", { name: title, exact: true }) });

if (MODE === "docs") {
  for (const locale of locales) {
    const { browser, page, messages, section } = await open(locale);
    try {
      await settleDocumentationPage(page, locale);
      await page.mouse.move(8, 8);
      // Momentum, Where things stand and Contributors: the later sections are
      // hidden for this figure, then shown again.
      const root = section.locator(":scope > div").first();
      const keep = [messages.ProjectStats.momentumTitle, messages.ProjectStats.statusTitle, messages.ProjectStats.contributorsTitle];
      await root.evaluate((element, titles) => {
        for (const child of element.children) {
          const title = child.querySelector("h2")?.textContent;
          if (titles.includes(title)) continue;
          child.setAttribute("data-capture-hidden", "");
          child.style.display = "none";
        }
      }, keep);
      await captureDocumentationControl(page, root, `public/documentation/${locale}/project-statistics.png`);
      await root.evaluate((element) => {
        for (const child of element.querySelectorAll("[data-capture-hidden]")) child.style.display = "";
      });
      await captureDocumentationControl(page, sectionNamed(section, messages.ProjectStats.graphTitle), `public/documentation/${locale}/project-issue-graph.png`);
      console.log(`${locale}: project-statistics and project-issue-graph captured`);
    } finally {
      await browser.close();
    }
  }
} else {
  const out = "output/pr-min-878";
  await mkdir(out, { recursive: true });
  // Tall enough for the whole block in one image.
  const { browser, page, messages, section } = await open("en", { width: 1440, height: 4200 });
  try {
    await page.mouse.move(8, 8);
    await section.screenshot({ path: `${out}/statistics-en-light.png` });
    await page.setViewportSize({ width: 1440, height: 1600 });
    // The tooltip of a status segment: icon, status, number of issues, share.
    const breakdown = sectionNamed(section, messages.ProjectStats.statusTitle);
    await breakdown.scrollIntoViewIfNeeded();
    // A middle segment, so the tooltip stays inside the clip.
    await breakdown.locator(".rounded-full > div").nth(3).hover();
    await page.getByRole("tooltip").first().waitFor();
    const box = await breakdown.boundingBox();
    await page.screenshot({ path: `${out}/status-tooltip-en-light.png`, clip: { x: box.x - 8, y: box.y - 64, width: box.width + 16, height: box.height + 72 } });
    await page.mouse.move(8, 8);
    const graph = sectionNamed(section, messages.ProjectStats.graphTitle);
    // Scroll first: an element screenshot that scrolls moves the pointer off
    // the dot, and the image would catch the highlight fading out.
    await graph.scrollIntoViewIfNeeded();
    const node = graph.locator("circle[role=link]").nth(3);
    await node.hover();
    await graph.screenshot({ path: `${out}/graph-hover-en-light.png` });
    await node.click();
    await page.getByRole("dialog").first().waitFor();
    await settle(page);
    await page.screenshot({ path: `${out}/graph-side-panel-en-light.png` });
    console.log("pull request images captured in", out);
  } finally {
    await browser.close();
  }
}
