import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServerClient } from "@supabase/ssr";
import { loadEnv, requireEnv } from "../../captures/lib/env.mjs";
import { EMAIL, MARKER, assertScope, id } from "./seed.mjs";

// Correctness and visual smoke coverage on a local production build. These
// checks make no latency, field INP, physical-device, or Safari-app claims.
loadEnv();
const args = new Set(process.argv.slice(2));
const engine = args.has("--webkit") ? "webkit" : "chromium";
const mobile = args.has("--mobile");
const base = process.env.MINDDY_PERF_BASE_URL ?? "http://localhost:3111";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Use a local production server");
const label = process.env.MINDDY_PERF_LABEL ?? `pass2-surfaces-${engine}-${mobile ? "mobile" : "desktop"}`;
assert.match(label, /^[a-zA-Z0-9_-]+$/, "Invalid output label");
const output = "output/playwright/performance";
await mkdir(output, { recursive: true });
const fixture = JSON.parse(await readFile(`${output}/workload.json`, "utf8"));
assert.equal(fixture.marker, MARKER);
assert.equal(fixture.email, EMAIL);
assert.deepEqual(fixture.projects, Array.from({ length: 6 }, (_, index) => id(`project-${index}`)));
assert.equal(fixture.firstIssue, id("issue-0-0"));
assert.equal(fixture.firstPage, id("page-0-0"));
const cookies = [];
const auth = createServerClient(requireEnv("MINDDY_PUBLIC_SUPABASE_URL"), requireEnv("MINDDY_PUBLIC_SUPABASE_ANON_KEY"), {
  cookies: { getAll: () => [], setAll: (values) => cookies.push(...values) },
});
const signedIn = await auth.auth.signInWithPassword({ email: EMAIL, password: requireEnv("CAPTURES_DEMO_PASSWORD") });
if (signedIn.error) throw signedIn.error;
assert.equal(signedIn.data.user.id, fixture.userId, "Wrong fixture account");
assert.equal(signedIn.data.user.user_metadata.performance_fixture, MARKER, "Unmarked fixture account");
const pageHref = `/projects/${fixture.projects[0]}/pages/${fixture.firstPage}`;
const pageApi = `/api/projects/${fixture.projects[0]}/pages/${fixture.firstPage}`;
const issueApi = `/api/issues/${fixture.firstIssue}`;
const tempTab = {
  id: id(`surfaces-verification-tab-${engine}-${mobile ? "mobile" : "desktop"}`),
  custom_name: `MIN-540 surfaces: ${engine} ${mobile ? "mobile" : "desktop"}`,
  href: pageHref,
};
const browser = await (engine === "webkit" ? webkit : chromium).launch({ headless: !args.has("--headed") });
const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 };
const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile,
  locale: "en-US", colorScheme: "dark", reducedMotion: "no-preference" });
await context.addCookies(cookies.map(({ name, value }) => ({ name, value, url: base, sameSite: "Lax" })));
await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: base }]);
await context.addInitScript(({ owner, tab }) => {
  localStorage.setItem("cookie_consent", "declined");
  // Each explicit smoke destination owns this temporary tab. /home otherwise
  // intentionally restores the prior workspace instead of showing Home.
  sessionStorage.setItem(`minddy.app-tabs.${owner}`, JSON.stringify({ id: tab.id, href: location.pathname + location.search }));
}, { owner: fixture.userId, tab: tempTab });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const pageErrors = [];
const failedReads = [];
const blockedTitleWrites = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("response", (response) => {
  const url = new URL(response.url());
  if (url.origin === new URL(base).origin && url.pathname.startsWith("/api/") && response.status() >= 400) {
    failedReads.push({ path: url.pathname, method: response.request().method(), status: response.status() });
  }
});
const results = { kind: "production-browser-correctness", label, timestamp: new Date().toISOString(), engine,
  browserVersion: browser.version(), viewport, emulation: mobile ? "mobile viewport and touch; no physical device" : "desktop viewport",
  safariAppTested: false, checks: [], screenshots: [], pageErrors, failedReads, blockedTitleWrites, cleanup: [], status: "running" };
const frames = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const editor = () => page.locator(".page-editor .tiptap");
const titleField = () => page.locator('[role="dialog"][data-state="open"]:visible').getByPlaceholder("Issue title", { exact: true });
const tabFields = (tab) => ({ id: tab.id, user_id: tab.user_id, href: tab.href, custom_name: tab.custom_name, pinned: tab.pinned, position: tab.position });
let preservedTabs = [];
let originalIssue;
let originalPage;
let releaseAssistantRestore;

async function api(path, method = "GET", data) {
  const response = await context.request.fetch(`${base}${path}`, { method, ...(data === undefined ? {} : { data }) });
  const body = await response.json();
  if (!response.ok()) throw new Error(`${method} ${path} failed (${response.status()}): ${body.code ?? body.error ?? "request failed"}`);
  return body;
}
async function listTabs() {
  const tabs = await api("/api/me/app-tabs");
  assert.ok(Array.isArray(tabs));
  for (const tab of tabs) assert.equal(tab.user_id, fixture.userId, "Foreign account tab");
  return tabs;
}
async function removeTemporaryTab() {
  for (let attempt = 0; attempt < 4; attempt++) {
    const tab = (await listTabs()).find((entry) => entry.id === tempTab.id);
    if (!tab) return;
    assert.equal(tab.custom_name, tempTab.custom_name, "Refusing to remove an unrecognized tab");
    const response = await context.request.delete(`${base}/api/me/app-tabs/${tab.id}`, { data: { revision: tab.revision } });
    if (response.ok()) return;
    assert.equal(response.status(), 409, "Temporary tab cleanup failed");
  }
  throw new Error("Temporary tab kept changing during cleanup");
}
async function screenshot(name) {
  const path = `${output}/${label}-${name}.png`;
  await page.screenshot({ path });
  results.screenshots.push(path);
}
async function check(name, action) {
  try {
    const detail = await action();
    assert.equal(pageErrors.length, 0, `Browser errors: ${pageErrors.join("; ")}`);
    assert.equal(blockedTitleWrites.length, 0, "The title test attempted to save a changed title");
    results.checks.push({ name, status: "passed", detail });
    console.log(JSON.stringify({ name, status: "passed" }));
  } catch (error) {
    results.checks.push({ name, status: "failed", error: error.message });
    if (name === "assistant-panel-and-conversation-list") {
      results.assistantDiagnostics = await page.evaluate(() => ({
        events: window.__assistantEvents,
        triggerExpanded: document.querySelector('button[aria-label="Conversations"]')?.getAttribute("aria-expanded"),
        focused: document.activeElement?.outerHTML.slice(0, 500),
        popovers: [...document.querySelectorAll('[data-slot="popover-content"]')].map((node) => ({
          state: node.getAttribute("data-state"), visible: node.checkVisibility(), text: node.textContent.slice(0, 200),
        })),
      }));
    }
    await screenshot("failure").catch(() => {});
    throw error;
  }
}
async function pageContent() {
  await editor().waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelector(".page-editor .tiptap")?.children.length === 80);
  assert.equal(await editor().locator(":scope > h2").count(), 8);
  assert.equal(await editor().locator(":scope > p").count(), 72);
  await frames();
  return editor().evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { blocks: node.children.length, headings: node.querySelectorAll(":scope > h2").length,
      width: rect.width, viewport: innerWidth, left: rect.left, right: rect.right, textLength: node.textContent.length };
  });
}

try {
  assertScope("projects", await api(`/api/projects/${fixture.projects[0]}`), fixture.userId);
  originalIssue = await api(issueApi);
  originalPage = await api(pageApi);
  assertScope("issues", originalIssue, fixture.userId);
  assertScope("pages", originalPage, fixture.userId);
  assert.equal(originalIssue.project_id, fixture.projects[0]);
  assert.match(originalIssue.title, /^Performance task 1\.1:/);
  assert.equal(originalPage.title, "Performance guide 1.1");
  assert.equal(originalPage.content.content.length, 80, "Use the complete 80-block fixture Page");
  // This is a guard, not a replay: normal reads and allowed writes use the real
  // server. A test failure must never commit the temporary textarea content.
  await page.route(`**${issueApi}`, async (route) => {
    const request = route.request();
    if (request.method() === "PATCH") {
      const patch = request.postDataJSON();
      if (Object.hasOwn(patch, "title") && patch.title !== originalIssue.title) {
        blockedTitleWrites.push({ path: issueApi, titleLength: String(patch.title).length });
        await route.abort("blockedbyclient");
        return;
      }
    }
    await route.continue();
  });
  preservedTabs = (await listTabs()).filter((tab) => tab.id !== tempTab.id).map(tabFields);
  await removeTemporaryTab();
  await api("/api/me/app-tabs", "POST", { id: tempTab.id });
  const created = (await listTabs()).find((tab) => tab.id === tempTab.id);
  assert.ok(created);
  await api(`/api/me/app-tabs/${tempTab.id}`, "PATCH", { revision: created.revision, patch: { href: tempTab.href, custom_name: tempTab.custom_name } });

  if (!args.has("--routes-only")) {
    await check("long-page-content-and-viewport", async () => {
      await page.goto(`${base}${pageHref}`, { waitUntil: "domcontentloaded" });
      const content = await pageContent();
      assert.ok(content.width > 100 && content.left >= -1 && content.right <= content.viewport + 1, "Page editor exceeds the viewport");
      await screenshot("page-top");
      await editor().locator(":scope > p").last().scrollIntoViewIfNeeded();
      await editor().locator(":scope > p").last().waitFor({ state: "visible" });
      await screenshot("page-bottom");
      await editor().locator(":scope > h2").first().scrollIntoViewIfNeeded();
      return content;
    });
    await check("page-menu-and-comments", async () => {
      const menu = page.locator('.app-content-header button[aria-label="Page options"]');
      await menu.click();
      await page.locator('[role="menu"]:visible').waitFor();
      await screenshot("page-menu");
      await page.keyboard.press("Escape");
      await page.locator('.app-content-header button[aria-label="Comments"]').click();
      await page.locator('[role="textbox"][contenteditable="true"]:visible').waitFor();
      await page.getByText("Documentation discussion 1.", { exact: false }).first().waitFor({ state: "visible" });
      await screenshot("page-comments");
      const commentCount = await page.getByText(/^Documentation discussion [1-4]\./).count();
      assert.equal(commentCount, 4, "Stored Page comments are incomplete");
      const historyResponse = page.waitForResponse((response) => response.url() === `${base}${pageApi}/versions` && response.request().method() === "GET");
      await page.getByRole("tab", { name: "Versions", exact: true }).click();
      const history = await historyResponse;
      assert.ok(history.ok(), "Page history request failed");
      const { versions } = await history.json();
      assert.ok(Array.isArray(versions), "Missing version list");
      if (versions.length === 0) await page.getByText("Nothing earlier yet. Edits show up here as they happen.", { exact: true }).waitFor({ state: "visible" });
      await screenshot("page-versions");
      // Reload this isolated tab to close any desktop/mobile panel presentation.
      await page.goto(`${base}${pageHref}`, { waitUntil: "domcontentloaded" });
      await pageContent();
      return { storedComments: commentCount, composerAvailable: true, postedComment: false,
        versions: versions.length, historyScope: "Read-only versions list; no version restore or collaboration simulation" };
    });
    await check("sidebar-visibility-keeps-page-content", async () => {
      const hide = page.getByRole("button", { name: "Hide sidebar", exact: true });
      const show = page.getByRole("button", { name: "Show sidebar", exact: true });
      const initiallyShown = await hide.isVisible();
      const first = initiallyShown ? hide : show;
      if (!(await first.isVisible())) return { available: false, reason: "This responsive layout does not expose the desktop sidebar button" };
      await first.click();
      await (initiallyShown ? show : hide).waitFor({ state: "visible" });
      await pageContent();
      await screenshot("sidebar-toggled");
      await (initiallyShown ? show : hide).click();
      await first.waitFor({ state: "visible" });
      await pageContent();
      return { available: true, restored: true, blocks: 80 };
    });
    await check("assistant-panel-and-conversation-list", async () => {
      if (args.has("--restore-race")) {
        // Hold a real read, without replacing its data, to exercise choosing
        // conversation history while the initial active-pointer read is pending.
        await page.route("**/api/assistant/active-conversation", async (route) => {
          if (route.request().method() !== "GET") return route.continue();
          const response = await route.fetch();
          await new Promise((resolve) => { releaseAssistantRestore = resolve; });
          await route.fulfill({ response });
        });
      }
      await page.evaluate(() => {
        window.__assistantEvents = [];
        for (const type of ["focusin", "pointerdown", "click"]) document.addEventListener(type, (event) => {
          const target = event.target;
          window.__assistantEvents.push({ type, at: performance.now(), tag: target.tagName,
            label: target.getAttribute?.("aria-label"), role: target.getAttribute?.("role"),
            slot: target.getAttribute?.("data-slot") });
        }, true);
      });
      await page.getByRole("button", { name: mobile ? "Open Numo" : "Ask Numo", exact: true }).click();
      const panel = page.getByRole("dialog", { name: "Ask Numo", exact: true });
      await panel.waitFor({ state: "visible" });
      if (!args.has("--restore-race")) {
        // Settled-surface smoke is separate from the explicit --restore-race
        // regression, which deliberately opens history before this ready state.
        await panel.locator('[role="textbox"][contenteditable="true"]').waitFor({ state: "visible" });
        await frames();
      }
      await screenshot("assistant-panel");
      const conversationResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/assistant/conversations" && response.request().method() === "GET");
      await panel.getByRole("button", { name: "Conversations", exact: true }).click();
      const response = await conversationResponse;
      assert.ok(response.ok(), "Conversation list request failed");
      const { conversations } = await response.json();
      assert.ok(Array.isArray(conversations), "Missing conversation list");
      if (args.has("--restore-race")) {
        assert.ok(releaseAssistantRestore, "Active-conversation read was not held");
        releaseAssistantRestore();
      }
      await panel.locator('[role="textbox"][contenteditable="true"]').waitFor({ state: "visible" });
      await frames();
      // A closing Radix popover remains visually present during its exit
      // animation. Require the open state after the composer restores as well.
      const history = page.locator('[data-slot="popover-content"][data-state="open"]');
      await history.waitFor({ state: "visible" });
      if (conversations.length === 0) await history.getByText("No conversations yet", { exact: true }).waitFor({ state: "visible" });
      await screenshot("assistant-history");
      await page.goto(`${base}${pageHref}`, { waitUntil: "domcontentloaded" });
      await pageContent();
      return { conversationCount: conversations.length, promptSent: false,
        delayedActivePointer: args.has("--restore-race"),
        openedHistoryAfterInitialRestore: !args.has("--restore-race"),
        scope: "Panel and history-list read only; no thread load, generated response, or paid execution" };
    });

    if (!mobile) await check("issue-title-wrap-grow-shrink-and-restore", async () => {
      await page.goto(`${base}/all`, { waitUntil: "domcontentloaded" });
      const card = page.locator(`[data-retained-app-view][data-app-view-active="true"] [data-issue-id="${fixture.firstIssue}"]`);
      await card.waitFor({ state: "visible" });
      await card.click();
      const field = titleField();
      await field.waitFor({ state: "visible" });
      assert.equal(await field.inputValue(), originalIssue.title);
      const geometry = () => field.evaluate((node) => ({ height: node.getBoundingClientRect().height,
        scrollHeight: node.scrollHeight, clientHeight: node.clientHeight, nativeSizing: CSS.supports("field-sizing", "content") }));
      const initial = await geometry();
      try {
        await field.fill(`${originalIssue.title} ${"A long fixture-only title must wrap and keep every word visible. ".repeat(14)}`);
        await frames();
        const expanded = await geometry();
        assert.ok(expanded.height > initial.height + 30, "The title did not grow when its text wrapped");
        assert.ok(expanded.scrollHeight <= expanded.clientHeight + 2, "Wrapped title content is clipped");
        await screenshot("title-expanded");
        await field.fill("Short fixture title");
        await frames();
        const shortened = await geometry();
        assert.ok(shortened.height < expanded.height - 30, "The title did not shrink after shortening");
        await screenshot("title-shortened");
        await field.fill(originalIssue.title);
        await field.blur();
        await frames();
        assert.equal((await api(issueApi)).title, originalIssue.title, "Fixture title changed on the server");
        await page.keyboard.press("Escape");
        return { initial, expanded, shortened, draftRestoredBeforeBlur: true, serverTitleUnchanged: true };
      } finally {
        if (await field.isVisible().catch(() => false)) {
          await field.fill(originalIssue.title);
          await field.blur();
        }
      }
    });
    else results.checks.push({ name: "issue-title-wrap-grow-shrink-and-restore", status: "not-run", reason: "This run covers the mobile Page surface; desktop title sizing is a separate check" });
  }

  if (args.has("--routes") || args.has("--routes-only")) {
    const routes = [
      { name: "home", href: "/home", expected: "/home" },
      { name: "inbox-compatibility", href: "/inbox", expected: "/home" },
      { name: "routines", href: "/routines", expected: "/routines" },
      { name: "account-settings", href: "/settings", expected: "/settings" },
      { name: "cycle-settings", href: "/settings?tab=cycles", expected: "/settings?tab=cycles" },
      { name: "project-objectives", href: `/projects/${fixture.projects[0]}/objectives`, expected: `/projects/${fixture.projects[0]}/objectives` },
      { name: "project-triage", href: `/projects/${fixture.projects[0]}/triage`, expected: `/projects/${fixture.projects[0]}/triage` },
      { name: "agents-compatibility", href: "/agents", expected: "/home" },
    ];
    for (const route of routes) await check(`route-${route.name}`, async () => {
      await page.goto(`${base}${route.href}`, { waitUntil: "domcontentloaded" });
      await page.waitForURL(`${base}${route.expected}`);
      await page.locator(".app-shell").waitFor({ state: "visible" });
      if (route.name === "inbox-compatibility") {
        // The compatibility URL is transient: the mounted Inbox consumes its
        // query parameter and normalizes the URL before the next navigation.
        await page.locator('#inbox-popover[data-state="open"]').waitFor({ state: "visible" });
      }
      // Route smoke checks the settled destination. A separate fast-navigation
      // probe may deliberately interrupt these outstanding prefetch requests.
      if (!args.has("--rapid-routes")) await page.waitForLoadState("networkidle");
      await frames();
      assert.ok(!(await page.getByText("This page could not be found.", { exact: true }).count()), "Route is a 404");
      const visibleText = await page.locator(".app-shell").innerText();
      assert.ok(visibleText.trim().length > 30, "The application shell is empty");
      await screenshot(`route-${route.name}`);
      return { requested: route.href, location: new URL(page.url()).pathname + new URL(page.url()).search,
        documentTitle: await page.title(), networkSettled: !args.has("--rapid-routes"),
        scope: "Route and visible shell smoke only; no configuration changes or assistant execution" };
    });
  } else results.checks.push({ name: "additional-routes", status: "not-run", reason: "Use --routes for read-only route and shell smoke checks" });
  assert.equal((await api(issueApi)).title, originalIssue.title);
  assert.deepEqual((await api(pageApi)).content, originalPage.content, "Page content changed during read-only smoke checks");
  results.status = "passed";
} catch (error) {
  results.status = "failed";
  results.error = error.message;
  process.exitCode = 1;
} finally {
  releaseAssistantRestore?.();
  await page.close().catch(() => {});
  try {
    if (originalIssue) assert.equal((await api(issueApi)).title, originalIssue.title, "Fixture title changed");
    if (originalPage) assert.deepEqual((await api(pageApi)).content, originalPage.content, "Fixture Page content changed");
    await removeTemporaryTab();
    const remaining = await listTabs();
    assert.ok(!remaining.some((tab) => tab.id === tempTab.id), "Temporary tab survived cleanup");
    for (const before of preservedTabs) {
      const current = remaining.find((tab) => tab.id === before.id);
      assert.ok(current, "An existing tab disappeared");
      assert.deepEqual(tabFields(current), before, "An existing tab changed");
    }
    results.cleanup.push("Removed only the deterministic temporary tab; preserved existing tabs, issue title, and Page content");
  } catch (error) {
    results.status = "failed";
    results.cleanup.push({ error: error.message });
    process.exitCode = 1;
  }
  await writeFile(`${output}/${label}.json`, JSON.stringify(results, null, 2));
  await context.close();
  await browser.close();
}
