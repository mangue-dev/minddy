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
/** Beacon and Aurora, the demo account's projects. */
const DEMO_PROJECTS = ["64502d4d-8670-4039-b54d-7db39712671c", "6cd36606-c297-4920-8ce3-31b5f3697be8"];
const SESSION_CACHES = ["/api/me/local-snapshots", "/api/me/app-tabs"];
/** Typed as an address: someone from outside the demo world. */
const EXTERNAL = "li.wei@example.com";

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

    // People from the demo account's other projects are proposed by name:
    // pick the first one, then type an outside address.
    const suggestions = page.getByRole("listbox", { name: messages.Projects.wizardMembersSuggestionsLabel });
    await suggestions.waitFor({ timeout: 15_000 });
    const firstOption = suggestions.getByRole("option").first();
    const picked = (await firstOption.textContent())?.trim() ?? "";
    await firstOption.getByRole("button").click();
    const field = page.locator("#project-invitee");
    await field.fill(EXTERNAL);
    await field.press("Enter");
    const list = page.getByRole("list", { name: messages.Projects.wizardMembersListLabel });
    await list.waitFor();
    const queued = await list.getByRole("listitem").allTextContents();
    if (queued.length !== 2 || queued[0].trim() !== picked || !queued[1].includes(EXTERNAL)) {
      throw new Error(`Unexpected queue: ${queued.join(" | ")} (picked ${picked})`);
    }
    if ((await suggestions.getByRole("option").count()) === 0) {
      throw new Error("No other collaborator left to show under the field.");
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

/**
 * The same search in Project settings → Members: in a demo project, someone
 * from the account's other projects who is not there yet is proposed by name.
 */
async function captureSettings({ locale, theme }) {
  const messages = await catalog(locale);
  const { browser, context, page } = await openPage({ theme, locale, viewport: VIEWPORT });
  try {
    await context.route("**/api/**", (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() === "GET" || SESSION_CACHES.some((p) => path.startsWith(p))) return route.fallback();
      return route.abort("blockedbyclient");
    });
    await page.goto(`${CAPTURE.baseUrl}/home`, { waitUntil: "domcontentloaded" });
    await settle(page);
    const target = await page.evaluate(async (projectIds) => {
      const { collaborators } = await (await fetch("/api/me/collaborators")).json();
      for (const id of projectIds) {
        const { members, invitations } = await (await fetch(`/api/projects/${id}/members`)).json();
        const present = new Set(members.map((m) => m.user_id));
        const invited = new Set(invitations.map((i) => i.invited_email));
        const free = collaborators.find((c) => !present.has(c.user_id) && !invited.has(c.email) && c.full_name);
        if (free) return { projectId: id, name: free.full_name };
      }
      return null;
    }, DEMO_PROJECTS);
    if (!target) throw new Error("Every collaborator is already in the demo projects: nothing to propose.");
    await page.goto(`${CAPTURE.baseUrl}/projects/${target.projectId}/settings?tab=members`, { waitUntil: "domcontentloaded" });
    const field = page.locator("#invite-email");
    await field.waitFor({ timeout: 20_000 });
    await field.fill(target.name.split(" ")[0]);
    const list = page.getByRole("listbox", { name: messages.Members.inviteSuggestionsLabel });
    await list.waitFor({ timeout: 10_000 });
    await page.mouse.move(8, 8);
    await settle(page);
    const out = `${OUT}/${locale}-${theme}-settings.png`;
    // The innermost block holding the card title, the form and the list.
    const card = page.locator("div")
      .filter({ has: page.getByText(messages.Members.inviteCardTitle, { exact: true }) })
      .filter({ has: list })
      .last();
    await shoot(card, out);
    console.log(`${locale}/${theme}: ${out}`);
  } finally {
    await browser.close();
  }
}

await capture({ locale: "en", theme: "light" });
await captureSettings({ locale: "en", theme: "light" });
