/**
 * The project wizard's Members step, with two queued addresses (MIN-689).
 *
 * See `intent.md`. No write leaves the browser: non-GET API requests are
 * aborted, so the walk through the wizard creates neither draft nor project.
 *
 * node captures/shots/project-wizard-members/shot.mjs
 */
import { openPage, settle, shoot, CAPTURE } from "../../lib/browser.mjs";
import { catalog } from "../../lib/messages.mjs";

const OUT = "captures/shots/project-wizard-members/out";
const VIEWPORT = { width: 1280, height: 860 };
const NAME = "Northwind";
const SESSION_CACHES = ["/api/me/local-snapshots", "/api/me/app-tabs"];
const INVITEES = ["ana.costa@example.com", "li.wei@example.com"];

async function capture({ locale, theme }) {
  const messages = await catalog(locale);
  const { browser, context, page } = await openPage({ theme, locale, viewport: VIEWPORT });
  const blocked = [];
  try {
    await context.route("**/api/**", (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      // The app's own session caches: aborting them shows a sync-error icon
      // in the top bar, and they create nothing in a project.
      if (request.method() === "GET" || SESSION_CACHES.some((p) => path.startsWith(p))) {
        return route.fallback();
      }
      blocked.push(`${request.method()} ${path}`);
      return route.abort("blockedbyclient");
    });
    await page.goto(`${CAPTURE.baseUrl}/home`, { waitUntil: "domcontentloaded" });
    await settle(page);

    // The sidebar button can be clicked before hydration: retry until the
    // wizard's first step answers.
    const origin = page.getByText(messages.Projects.wizardOriginNewLabel, { exact: true });
    for (let attempt = 0; attempt < 5 && !(await origin.isVisible()); attempt++) {
      await page.getByRole("button", { name: messages.Projects.newProject, exact: true }).click();
      await origin.waitFor({ timeout: 4_000 }).catch(() => {});
    }
    const cta = page.locator("[data-wizard-cta]");

    await origin.click();
    await page.locator("#project-name").fill(NAME);
    await cta.click(); // project → icon
    await page.getByText(messages.Projects.wizardIconTitle, { exact: true }).waitFor();
    await cta.click(); // icon → git
    await page.getByText(messages.Projects.wizardGitTitle, { exact: true }).waitFor();
    await cta.click(); // git (Skip) → seed
    await page.getByText(messages.Projects.wizardSeedBriefTitle, { exact: true }).first().waitFor();
    await cta.click(); // seed (Skip) → members
    await page.getByText(messages.Projects.wizardMembersTitle, { exact: true }).waitFor();

    const field = page.locator("#project-invitee");
    for (const email of INVITEES) {
      await field.fill(email);
      await field.press("Enter");
    }
    const list = page.getByRole("list", { name: messages.Projects.wizardMembersListLabel });
    await list.waitFor();
    const queued = await list.getByRole("listitem").allTextContents();
    if (queued.join("|") !== INVITEES.join("|")) {
      throw new Error(`Queued addresses differ: ${queued.join(", ")}`);
    }
    if ((await cta.textContent())?.trim() === messages.Common.skip) {
      throw new Error("The CTA still says Skip with addresses queued.");
    }
    await page.mouse.move(8, 8);
    await settle(page);
    const out = `${OUT}/${locale}-${theme}.png`;
    // The dialog only: the top bar around it carries the session's own state
    // (tab sync, counters), which says nothing about this step.
    await shoot(page.getByRole("dialog").first(), out);

    // The finishing step announces how many invitations Finish will send.
    await cta.click();
    await page.getByText(messages.Projects.wizardFinishTitle, { exact: true }).waitFor();
    await page.mouse.move(8, 8);
    await settle(page);
    const finishOut = `${OUT}/${locale}-${theme}-finish.png`;
    await shoot(page.getByRole("dialog").first(), finishOut);
    console.log(`${locale}/${theme}: ${out}, ${finishOut} (aborted writes: ${blocked.join(", ") || "none"})`);
  } finally {
    await browser.close();
  }
}

await capture({ locale: "en", theme: "light" });
