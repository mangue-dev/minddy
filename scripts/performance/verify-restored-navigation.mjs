import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, _electron } from "playwright";
import { openFixture, stableTabs, stableManifestPath, assertStableTabs } from "./stable-restored-tabs.mjs";
import { assertScope, id } from "./seed.mjs";
import { loadForgeWorkload, forgeLinkFingerprint } from "./measure-forge-navigation.mjs";
import { boardReady, revealBoardIssue } from "./board-readiness.mjs";
import { verificationPageReady, focusPageRestorationState, verifiedFocusAbsence } from "./verification-page-readiness.mjs";
import { secondaryManifestPath } from "./enrich-secondary-workload.mjs";

// This mutating diagnostic is intentionally separate from ordinary comparisons.
// Its journal retains original fixture content before every ambiguous transport.
const label = process.env.MINDDY_PERF_LABEL ?? "min683-restored-verification";
assert.match(label, /^[a-zA-Z0-9_-]+$/);
const output = path.resolve("output/playwright/performance");
await mkdir(output, { recursive: true });
const journalPath = path.join(output, `${label}-restoration-journal.json`);
const resultPath = path.join(output, `${label}.json`);
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const result = { label, protocol: "min683-restored-correctness-v2-mounted-focus-body", excludedFromLatencyAggregates: true,
  timestamp: new Date().toISOString(), status: "running", assertions: [], errors: [], cleanup: [],
  limitations: ["Browser reload/forced-quit draft recovery is not verified by this diagnostic.",
    "Read failure and permission denial need separate hook tests; no live account permission is changed."] };
const journal = { label, dirtyIssue: false, dirtyPages: [], issue: null, pages: [], attempts: [] };
let session, browser, context, page, userData, tabs, forge, originalTabs, originalBoard, trees, failure;
let browserCdp, distractionPage, distractionTargetId;
const createdTabs = new Set();
const pendingRoutes = new Set();
const responseProbes = new Set();
let journalWrites = Promise.resolve();
const recordJournal = () => {
  const snapshot = JSON.stringify(journal, null, 2);
  journalWrites = journalWrites.then(() => writeFile(journalPath, snapshot));
  return journalWrites;
};
const tabFields = ({ id, user_id, custom_name, pinned, position }) => ({ id, user_id, custom_name, pinned, position });
const immutableIssue = ({ title: _title, updated_at: _at, updated_by: _by, ...rest }) => rest;
const immutablePage = ({ version: _version, updated_at: _at, updated_by: _by, updated_kind: _kind, updated_api_key_id: _key, ...rest }) => rest;
function promiseGate() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
try {
  session = await openFixture();
  const { api, fixture, base, cookies } = session;
  const secondaryManifest = JSON.parse(await readFile(secondaryManifestPath, "utf8"));
  assert.equal(secondaryManifest.status, "complete", "Correctness verification requires a quiescent complete fixture before any tab or content write");
  assert.equal(secondaryManifest.userId, fixture.userId); assert.equal(secondaryManifest.email, fixture.email);
  Object.assign(journal, { userId: fixture.userId, email: fixture.email, marker: fixture.marker });
  forge = await loadForgeWorkload(api);
  tabs = stableTabs(fixture, forge);
  const manifest = JSON.parse(await readFile(stableManifestPath, "utf8"));
  assert.equal(manifest.userId, fixture.userId);
  assert.deepEqual(manifest.specs, tabs);
  originalTabs = await assertStableTabs(api, fixture, tabs);
  for (const spec of tabs) {
    const tab = originalTabs.find((row) => row.id === spec.id);
    if (tab.href !== spec.href && process.argv.includes("--verify")) await api(`/api/me/app-tabs/${tab.id}`, "PATCH", { revision: tab.revision, patch: { href: spec.href } });
  }
  originalTabs = await assertStableTabs(api, fixture, tabs);
  const issue = await api(`/api/issues/${fixture.firstIssue}`);
  assertScope("issues", issue, fixture.userId);
  assert.equal(issue.id, id("issue-0-0"));
  assert.equal(issue.project_id, fixture.projects[0]);
  assert.equal(issue.title, "Performance task 1.1: Navigation state");
  assertScope("projects", await api(`/api/projects/${fixture.projects[0]}`), fixture.userId);
  journal.issue = issue;
  const foreignTab = tabs.find((tab) => tab.pageId === id("page-1-0"));
  const focusPage = { ...foreignTab, pageId: id("page-1-1"), title: "Performance guide 2.2",
    href: `/projects/${fixture.projects[1]}/pages/${id("page-1-1")}` };
  for (const spec of [...tabs.filter((tab) => tab.kind === "page"), focusPage]) {
    const href = `/api/projects/${spec.projectId}/pages/${spec.pageId}`;
    const body = await api(href);
    assertScope("pages", body, fixture.userId);
    assert.equal(body.id, spec.pageId);
    assert.equal(body.project_id, spec.projectId);
    assert.ok([id("page-0-10"), id("page-1-0"), id("page-1-1")].includes(body.id));
    assert.equal(body.title, spec.title ?? (spec.pageId === id("page-0-10") ? "Performance guide 1.11" : "Performance guide 2.1"));
    assert.equal(body.content.content.length, 80);
    assert.equal(new Set(body.content.content.map((block) => block.attrs?.blockId)).size, 80);
    assert.ok(body.content.content.every((block) => typeof block.attrs?.blockId === "string"));
    assertScope("projects", await api(`/api/projects/${spec.projectId}`), fixture.userId);
    journal.pages.push({ href, original: body });
  }
  originalBoard = await api("/api/me/board");
  assert.equal(originalBoard.issues.length, secondaryManifest.counts.allSourceIssues, "A capped global source cannot prove unrelated issue preservation");
  result.secondaryCohort = { marker: secondaryManifest.marker, counts: secondaryManifest.counts };
  trees = await Promise.all(fixture.projects.map(async (project) => ({ project, rows: await api(`/api/projects/${project}/pages`) })));
  result.fixture = { account: fixture.email, userId: fixture.userId, pages: journal.pages.map(({ original }) => ({ id: original.id, version: original.version, fingerprint: digest(original) })), issue: issue.id, tabCount: tabs.length };
  const productRoot = process.env.MINDDY_PERF_BUILD_ROOT ?? process.cwd();
  result.build = (await readFile(path.join(productRoot, ".next/BUILD_ID"), "utf8")).trim();
  result.product = JSON.parse(await readFile(path.join(productRoot, ".next/min683-product.json"), "utf8"));
  assert.equal(result.product.build, result.build, "Verification requires the measured product's explicit source manifest");
  assert.match(result.product.sha, /^[a-f0-9]{40}$/);
  assert.deepEqual(Object.keys(result.product.environmentFiles ?? {}).sort(), [".env", ".env.local", ".env.production", ".env.production.local"].sort(), "New verification requires the actual build's environment-file hashes");
  assert.match(result.product.environmentFiles[".env"], /^[a-f0-9]{64}$/);
  assert.ok(Object.values(result.product.environmentFiles).every((value) => value === null || /^[a-f0-9]{64}$/.test(value)));
  result.environmentFiles = result.product.environmentFiles;
  result.sha = result.product.sha;
  result.runnerSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  result.runnerSourceHashScope = ["verify-restored-navigation.mjs", "verification-page-readiness.mjs", "board-readiness.mjs", "stable-restored-tabs.mjs",
    "measure-forge-navigation.mjs", "secondary-navigation-workload.mjs", "enrich-secondary-workload.mjs", "seed.mjs"];
  result.runnerSourceHash = digest(await Promise.all(result.runnerSourceHashScope.map((file) => readFile(path.resolve("scripts/performance", file), "utf8"))));
  if (!process.argv.includes("--verify")) {
    result.status = "read-only-preflight";
    result.assertions.push({ verifiedFixtureIdentityAndSyntheticMutationScope: true, mutations: false });
  } else {
    await recordJournal();
    if (process.argv.includes("--electron")) {
      userData = await mkdtemp(path.join(tmpdir(), "minddy-min683-verify-"));
      const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
      Object.assign(env, { MINDDY_DESKTOP_ORIGIN: base, MINDDY_DESKTOP_TEST_USER_DATA: userData });
      browser = await _electron.launch({ args: [`--user-data-dir=${userData}`, path.resolve("desktop")], cwd: path.resolve("desktop"), env, timeout: 30000 });
      const runtime = await browser.evaluate(({ app }) => ({ packaged: app.isPackaged, userData: app.getPath("userData"), sessionData: app.getPath("sessionData"), electron: process.versions.electron, chromium: process.versions.chrome }));
      assert.equal(runtime.packaged, false);
      assert.equal(runtime.userData, userData);
      assert.equal(runtime.sessionData, userData);
      result.runtime = runtime;
      context = browser.context();
    } else {
      browser = await chromium.launch({ headless: false });
      context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light", locale: "en-US" });
      page = await context.newPage();
      result.runtime = { chromium: browser.version(), headless: false };
    }
    await context.addCookies(cookies.map(({ name, value }) => ({ name, value, url: base, sameSite: "Lax" })));
    await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: base }]);
    if (process.argv.includes("--electron")) page = await browser.firstWindow();
    const installVerificationProbe = ({ boardSource, pageSource }) => {
      localStorage.setItem("cookie_consent", "declined");
      window.__restoredVerify ??= {};
      window.__restoredVerify.boardReady ??= new Function(`return (${boardSource})`)();
      window.__restoredVerify.pageReady ??= new Function(`return (${pageSource})`)();
    };
    const verificationProbeArgs = { boardSource: boardReady.toString(), pageSource: verificationPageReady.toString() };
    await context.addInitScript(installVerificationProbe, verificationProbeArgs);
    await page.addInitScript(installVerificationProbe, verificationProbeArgs);
    await page.evaluate(installVerificationProbe, verificationProbeArgs);
    page.setDefaultTimeout(20000);
    page.on("pageerror", (error) => result.errors.push(error.message));
    page.on("requestfinished", (req) => {
      if (req.method() !== "GET" || new URL(req.url()).pathname !== `/api/projects/${focusPage.projectId}/pages/${focusPage.pageId}`) return;
      const task = (async () => {
        const response = await req.response(), body = await response.json();
        (result.focusBodyReads ??= []).push({ status: response.status(), version: body.version ?? null, startTime: req.timing().startTime,
          responseObservedAt: Date.now(), ...(body.content ? { contentFingerprint: digest(body.content) } : {}) });
      })().catch((error) => (result.probeErrors ??= []).push(error.message)).finally(() => responseProbes.delete(task));
      responseProbes.add(task);
    });
    page.on("requestfinished", async (req) => {
      if (req.method() !== "POST" || new URL(req.url()).pathname !== "/api/me/app-tabs") return;
      const body = req.postDataJSON();
      if ((await req.response())?.ok() && typeof body?.id === "string") createdTabs.add(body.id);
    });
    const cdp = await context.newCDPSession(page);
    const frames = () => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    async function clickTarget(target) {
      await target.scrollIntoViewIfNeeded();
      await frames();
      const box = await target.boundingBox();
      assert.ok(box);
      await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 25), button: "left", clickCount: 1 });
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 25), button: "left", clickCount: 1 });
    }
    const activate = (spec) => clickTarget(page.locator(`[data-app-tab-id="${spec.id}"]`));
    const waitTab = (spec) => page.waitForFunction((spec) => !!document.querySelector(`[data-app-tab-id="${spec.id}"][aria-selected="true"]`) &&
      location.pathname === new URL(spec.href, location.origin).pathname, spec);
    const waitBoard = (cards) => page.waitForFunction((cards) => window.__restoredVerify.boardReady(cards), cards);
    await page.goto(`${base}/all`, { waitUntil: "domcontentloaded" });
    await page.evaluate(installVerificationProbe, verificationProbeArgs);
    const kanbanCount = (projectId) => originalBoard.issues.filter((entry) => (!projectId || entry.project_id === projectId) && !["triage", "duplicate"].includes(entry.status)).length;
    await waitTab(tabs[0]); await waitBoard(kanbanCount());
    await page.evaluate(() => {
      let fiber = document.querySelector('[data-app-tab-id]');
      fiber = fiber?.[Object.keys(fiber).find((key) => key.startsWith("__reactFiber$"))];
      for (let depth = 0; fiber && depth < 100; depth++, fiber = fiber.return) {
        if (typeof fiber.memoizedProps?.client?.getQueryCache === "function") { window.__restoredVerify.client = fiber.memoizedProps.client; break; }
      }
      if (!window.__restoredVerify.client) throw new Error("Diagnostic could not find the account QueryClient");
    });
    await revealBoardIssue(page, issue.id, issue.status);
    // Mount a third exact synthetic document before leaving focus. Keep the
    // typing document unvisited and the screenshot document unchanged.
    await activate(foreignTab); await waitTab(foreignTab);
    await page.locator(`[data-page-surface-id="${foreignTab.pageId}"] .tiptap[contenteditable="true"]`).waitFor();
    await clickTarget(page.locator(`[data-sidebar-page-row] a[href="${focusPage.href}"]:visible`));
    const focusRecord = journal.pages.find(({ original }) => original.id === focusPage.pageId);
    const focusOriginal = focusRecord.original;
    const focusApi = `/api/projects/${focusPage.projectId}/pages/${focusPage.pageId}`;
    const focusSpec = { ...focusPage, version: focusOriginal.version,
      text: focusOriginal.content.content.find((block) => block.type === "paragraph").content.find((node) => node.type === "text").text };
    await page.waitForFunction((spec) => window.__restoredVerify.pageReady(spec), focusSpec);
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });
    result.focusProtocol = { focusEmulationDisabled: true, genuineWindowMinimization: process.argv.includes("--electron"),
      genuineSameWindowTabActivation: !process.argv.includes("--electron"),
      absenceBasis: "Observed document.hasFocus=false before and after the inactivity interval; visibility is recorded independently",
      playwrightBackgroundThrottlingOverridesRemain: true };
    if (process.argv.includes("--electron")) await browser.evaluate(({ BrowserWindow }, base) => {
      const window = BrowserWindow.getAllWindows().find((item) => item.webContents.getURL().startsWith(base));
      window.show(); window.focus();
    }, base);
    else await page.bringToFront();
    await page.waitForFunction(() => document.hasFocus());
    const focusBefore = await page.evaluate(() => ({ visibility: document.visibilityState, focused: document.hasFocus() }));
    let originalTargetId;
    if (process.argv.includes("--electron")) await browser.evaluate(({ BrowserWindow }, base) => {
      const window = BrowserWindow.getAllWindows().find((item) => item.webContents.getURL().startsWith(base));
      if (!window) throw new Error("Missing fixture renderer window");
      window.minimize(); window.blur();
    }, base);
    else {
      // A real tab in the same browser window produces document focus loss
      // even where a second macOS window fails to become the key window.
      browserCdp = await browser.newBrowserCDPSession();
      const { targetInfo } = await cdp.send("Target.getTargetInfo");
      originalTargetId = targetInfo.targetId;
      const newPage = context.waitForEvent("page", { predicate: (candidate) => candidate !== page, timeout: 20000 })
        .then((created) => ({ page: created }), (error) => ({ error }));
      ({ targetId: distractionTargetId } = await browserCdp.send("Target.createTarget", { url: "about:blank", newWindow: false, background: false,
        ...(targetInfo.browserContextId ? { browserContextId: targetInfo.browserContextId } : {}) }));
      const opened = await newPage;
      if (opened.error) throw opened.error;
      distractionPage = opened.page;
      const distractionCdp = await context.newCDPSession(distractionPage);
      await Promise.all([cdp.send("Emulation.setFocusEmulationEnabled", { enabled: false }),
        distractionCdp.send("Emulation.setFocusEmulationEnabled", { enabled: false })]);
      const originalWindow = await browserCdp.send("Browser.getWindowForTarget", { targetId: originalTargetId });
      const distractionWindow = await browserCdp.send("Browser.getWindowForTarget", { targetId: distractionTargetId });
      assert.equal(originalWindow.windowId, distractionWindow.windowId, "The distraction must be a real tab in the same browser window");
      result.focusProtocol.windows = { originalWindowId: originalWindow.windowId, distractionWindowId: distractionWindow.windowId };
      await browserCdp.send("Target.activateTarget", { targetId: distractionTargetId });
      await distractionPage.bringToFront();
    }
    // Do not mutate until the original renderer actually lost focus.
    await page.waitForFunction(() => !document.hasFocus());
    const away = await page.evaluate(() => ({ visibility: document.visibilityState, focused: document.hasFocus(), at: performance.now(), wallClock: Date.now() }));
    await page.waitForTimeout(16000);
    const awayBeforeMutation = await page.evaluate(() => ({ visibility: document.visibilityState, focused: document.hasFocus(), at: performance.now(), wallClock: Date.now() }));
    result.focusProtocol.observedAbsence = { focusBefore, away, awayBeforeMutation };
    assert.ok(verifiedFocusAbsence(focusBefore, away, awayBeforeMutation), "No fixture write is allowed without a real observed inactivity interval");
    // Journal before transport, so cleanup can restore after an ambiguous ACK.
    const remoteTitle = `${issue.title} [MIN-683 resume ${randomUUID()}]`;
    journal.expectedIssueTitle = remoteTitle;
    journal.dirtyIssue = true; await recordJournal();
    await api(`/api/issues/${issue.id}`, "PATCH", { title: remoteTitle });
    const remoteFocusText = ` [MIN-683 mounted focus update ${randomUUID()}]`;
    const focusContent = structuredClone(focusOriginal.content);
    focusContent.content.findLast((block) => block.type === "paragraph").content.push({ type: "text", text: remoteFocusText });
    focusRecord.expectedMutatedContent = focusContent;
    focusRecord.expectedMutationBaseVersion = focusOriginal.version;
    journal.dirtyPages.push(focusPage.pageId); await recordJournal();
    const focusUpdated = await api(focusApi, "PATCH", { content: focusContent, version: focusOriginal.version });
    assert.equal(focusUpdated.id, focusPage.pageId); assert.ok(focusUpdated.version > focusOriginal.version);
    focusRecord.expectedSavedVersion = focusUpdated.version; await recordJournal();
    const updatedBeforeResume = await page.evaluate(({ id, text }) => !!document.querySelector(`[data-page-surface-id="${id}"] .tiptap`)?.textContent.includes(text),
      { id: focusPage.pageId, text: remoteFocusText });
    if (process.argv.includes("--electron")) await browser.evaluate(({ BrowserWindow }, base) => {
      const window = BrowserWindow.getAllWindows().find((item) => item.webContents.getURL().startsWith(base));
      window.restore(); window.show(); window.focus();
    }, base);
    else {
      await browserCdp.send("Target.activateTarget", { targetId: originalTargetId });
      await page.bringToFront();
    }
    await page.waitForFunction(() => document.visibilityState === "visible" && document.hasFocus());
    const returned = await page.evaluate(() => ({ visibility: document.visibilityState, focused: document.hasFocus(), at: performance.now(), wallClock: Date.now() }));
    await page.waitForFunction((spec) => window.__restoredVerify.pageReady(spec), { ...focusSpec, text: remoteFocusText, version: focusUpdated.version });
    const focusAccepted = await page.evaluate((id) => window.__restoredVerify.client.getQueryData(["page", id]), focusPage.pageId);
    assert.deepEqual(focusAccepted.content, focusUpdated.content, "The mounted body must reflect the accepted remote version after real focus return");
    result.assertions.push({ mountedPageRemoteBodyAndVersionVisibleOnResume: true, pageId: focusPage.pageId,
      originalVersion: focusOriginal.version, remoteVersion: focusUpdated.version, updatedBeforeResume,
      contentFingerprint: digest(focusAccepted.content) });
    await activate(tabs[0]); await waitTab(tabs[0]);
    await waitBoard(kanbanCount());
    await revealBoardIssue(page, issue.id, issue.status);
    await page.locator(`[data-app-view-active="true"] [data-issue-id="${issue.id}"]`).getByText(remoteTitle, { exact: true }).waitFor();
    await activate(tabs[1]); await waitTab(tabs[1]); await waitBoard(kanbanCount(fixture.projects[0]));
    await revealBoardIssue(page, issue.id, issue.status);
    await page.locator(`[data-app-view-active="true"] [data-issue-id="${issue.id}"]`).getByText(remoteTitle, { exact: true }).waitFor();
    result.assertions.push({ actualFocusAbsenceAndResume: true, focusBefore, away, awayBeforeMutation, returned, absenceMs: returned.at - away.at,
      remoteIssueVisibleInActiveAndOtherBoard: true });
    if (distractionTargetId) { await browserCdp.send("Target.closeTarget", { targetId: distractionTargetId }); distractionTargetId = undefined; distractionPage = undefined; }
    // Return the existing foreign tab to its untouched screenshot document
    // before the later departure-save journey targets that same tab.
    await activate(foreignTab);
    await clickTarget(page.locator(`[data-sidebar-page-row] a[href="${foreignTab.href}"]:visible`));
    await waitTab(foreignTab);
    await page.locator(`[data-page-surface-id="${foreignTab.pageId}"] .tiptap[contenteditable="true"]`).waitFor();
    // Let the real preparation owner acquire the body; never inject a fake
    // response or fixture JSON into the application cache.
    const primary = tabs.find((tab) => tab.pageId === id("page-0-10"));
    const other = tabs.find((tab) => tab.pageId === id("page-1-0"));
    const original = journal.pages.find(({ original }) => original.id === primary.pageId).original;
    const primaryRecord = journal.pages.find(({ original }) => original.id === primary.pageId);
    async function recordPrimaryMutation(input) {
      assert.ok(Number.isInteger(input.version) && input.version >= original.version && input.content,
        "The diagnostic must journal an exact versioned body before its transport");
      (primaryRecord.restorationCandidates ??= []).push({ version: input.version + 1, content: input.content });
      await recordJournal();
    }
    const pageApi = `/api/projects/${primary.projectId}/pages/${primary.pageId}`;
    await page.waitForFunction((pageId) => {
      const state = window.__restoredVerify.client.getQueryState(["page", pageId]);
      return state?.status === "success" && state.data?.id === pageId && state.data.version > 0;
    }, primary.pageId, { timeout: 30000 });
    const accepted = await page.evaluate((pageId) => window.__restoredVerify.client.getQueryData(["page", pageId]), primary.pageId);
    assert.equal(accepted.id, original.id);
    assert.equal(accepted.project_id, original.project_id);
    assert.equal(accepted.version, original.version);
    assert.deepEqual(accepted.content, original.content, "The accepted prepared body must match the authorized original");
    assert.equal(await page.locator(`[data-page-surface-id="${primary.pageId}"]`).count(), 0, "First editing activation must not have been visited");
    const readSeen = promiseGate(), allowRead = promiseGate();
    const heldReads = [];
    await page.route(`**${pageApi}`, async (route) => {
      if (route.request().method() !== "GET") {
        if (route.request().method() === "PATCH") await recordPrimaryMutation(route.request().postDataJSON());
        await route.continue(); return;
      }
      const heldRead = { startedAt: Date.now(), continuedAt: null };
      heldReads.push(heldRead);
      readSeen.resolve();
      const held = Promise.all([new Promise((done) => setTimeout(done, 800)), allowRead.promise]);
      pendingRoutes.add(allowRead);
      try { await held; heldRead.continuedAt = Date.now(); await route.continue(); }
      catch (error) { heldRead.transportFailure = error.message; }
      finally { pendingRoutes.delete(allowRead); }
    });
    await page.evaluate((pageId) => window.__restoredVerify.client.invalidateQueries({ queryKey: ["page", pageId], exact: true, refetchType: "none" }), primary.pageId);
    await activate(primary);
    await Promise.race([readSeen.promise, new Promise((_, reject) => setTimeout(() => reject(new Error("No actual mounted Page GET was intercepted")), 20000))]);
    assert.ok(await page.evaluate((pageId) => window.__restoredVerify.client.getQueryCache().find({ queryKey: ["page", pageId], exact: true })?.getObserversCount() > 0, primary.pageId));
    const editor = page.locator(`[data-page-surface-id="${primary.pageId}"] .tiptap[contenteditable="true"]:visible`);
    await editor.waitFor();
    assert.ok(heldReads.length && heldReads.every((read) => read.continuedAt === null), "Accepted cached editor must be usable before the fresh read");
    const localText = ` MIN-683 immediate draft ${randomUUID()}`;
    const remoteText = ` MIN-683 remote block ${randomUUID()}`;
    journal.dirtyPages.push(primary.pageId); await recordJournal();
    await editor.locator("p").first().click();
    await page.keyboard.insertText(localText);
    assert.ok((await editor.textContent()).includes(localText), "Typing must paint before network reconciliation");
    const remoteDoc = structuredClone(original.content);
    const remoteBlock = remoteDoc.content.findLast((block) => block.type === "paragraph");
    remoteBlock.content.push({ type: "text", text: remoteText });
    await recordPrimaryMutation({ content: remoteDoc, version: original.version });
    await api(pageApi, "PATCH", { content: remoteDoc, version: original.version });
    allowRead.resolve();
    await page.waitForFunction(({ id, localText, remoteText }) => {
      const node = document.querySelector(`[data-page-surface-id="${id}"] .tiptap`);
      return !!node?.getClientRects().length && node.textContent.includes(localText) && node.textContent.includes(remoteText);
    }, { id: primary.pageId, localText, remoteText });
    await page.unroute(`**${pageApi}`);
    const patchSeen = promiseGate(), allowPatch = promiseGate();
    let heldPatch;
    await page.route(`**${pageApi}`, async (route) => {
      if (route.request().method() !== "PATCH") { await route.continue(); return; }
      const input = route.request().postDataJSON();
      await recordPrimaryMutation(input);
      if (heldPatch) { await route.continue(); return; }
      heldPatch = { startedAt: Date.now(), continuedAt: null, version: input.version, hasContent: !!input.content };
      patchSeen.resolve(); pendingRoutes.add(allowPatch);
      try { await Promise.all([new Promise((done) => setTimeout(done, 800)), allowPatch.promise]); heldPatch.continuedAt = Date.now(); await route.continue(); }
      catch (error) { heldPatch.transportFailure = error.message; }
      finally { pendingRoutes.delete(allowPatch); }
    });
    const departureText = ` MIN-683 departure ${randomUUID()}`;
    await editor.locator("p").first().click(); await page.keyboard.insertText(departureText);
    await activate(other);
    await Promise.race([patchSeen.promise, new Promise((_, reject) => setTimeout(() => reject(new Error("No departure PATCH was intercepted")), 20000))]);
    assert.ok(heldPatch.version > 0 && heldPatch.hasContent, "Body saves must use an acquired version");
    await frames();
    assert.equal(await page.locator(`[data-app-tab-id="${primary.id}"]`).getAttribute("aria-selected"), "true", "Departure must wait for the held save");
    assert.ok((await editor.textContent()).includes(departureText));
    allowPatch.resolve();
    await waitTab(other);
    const persisted = await api(pageApi);
    assert.ok(JSON.stringify(persisted.content).includes(localText));
    assert.ok(JSON.stringify(persisted.content).includes(remoteText));
    assert.ok(JSON.stringify(persisted.content).includes(departureText));
    assert.ok(persisted.version > original.version);
    assert.equal(focusPageRestorationState(primaryRecord, persisted), "owned-mutation",
      "The persisted primary document must match a body and version journaled before transport");
    await page.unroute(`**${pageApi}`);
    result.assertions.push({ immediateCachedTypingBeforeActualFreshGET: true, nonoverlappingRemoteAndLocalEditsMerged: true,
      departureWaitedForVersionedSave: true, serverPersistedAllEdits: true, heldReads, heldPatch,
      originalVersion: original.version, persistedVersion: persisted.version });
    // The destination document was never edited. Crop only its complete
    // synthetic surface, avoiding shared-project text in the surrounding UI.
    const untouched = journal.pages.find(({ original }) => original.id === other.pageId).original;
    assert.deepEqual(await api(journal.pages.find(({ original }) => original.id === other.pageId).href), untouched);
    await page.emulateMedia({ colorScheme: "light" });
    await page.waitForFunction((id) => {
      const surface = document.querySelector(`[data-page-surface-id="${id}"]`);
      const editor = surface?.querySelector('.tiptap[contenteditable="true"]');
      return !!editor?.getClientRects().length && !editor.closest('[inert]') && editor.querySelectorAll(':scope > h2').length === 8 &&
        editor.querySelectorAll(':scope > p').length === 72;
    }, other.pageId);
    const screenshot = path.join(output, `${label}-fixture-page.png`);
    await page.locator(`[data-page-surface-id="${other.pageId}"]:visible`).screenshot({ path: screenshot });
    result.screenshots = [{ path: screenshot, fixturePageId: other.pageId, croppedToSyntheticContent: true, unchangedDocumentVerified: true, requestedColorScheme: "light" }];
    assert.equal(result.errors.length, 0, "Renderer errors during correctness verification");
    result.status = "passed";
  }
} catch (error) {
  failure = error; result.status = "failed"; result.failure = error.stack;
} finally {
  for (const gate of pendingRoutes) gate.resolve();
  if (page) await page.unrouteAll({ behavior: "wait" }).catch(() => {});
  await Promise.allSettled(responseProbes);
  if (distractionTargetId) await browserCdp?.send("Target.closeTarget", { targetId: distractionTargetId }).catch(() => {});
  if (distractionPage && !distractionPage.isClosed()) await distractionPage.close().catch(() => {});
  if (browser) await browser.close().catch((error) => { result.cleanup.push({ error: error.message }); failure ??= error; });
  if (session) {
    const { api, fixture } = session;
    try {
      if (journal.dirtyIssue) {
        const current = await api(`/api/issues/${journal.issue.id}`);
        assert.deepEqual(immutableIssue(current), immutableIssue(journal.issue), "Preserve unexpected issue changes during diagnostic cleanup");
        assert.ok([journal.issue.title, journal.expectedIssueTitle].includes(current.title), "Preserve an unknown concurrent issue title for reconciliation");
        if (current.title !== journal.issue.title) await api(`/api/issues/${journal.issue.id}`, "PATCH", { title: journal.issue.title });
        const restored = await api(`/api/issues/${journal.issue.id}`);
        assert.equal(restored.title, journal.issue.title);
        assert.deepEqual(immutableIssue(restored), immutableIssue(journal.issue));
        result.cleanup.push({ issueTitleRestored: true, expectedUpdatedAtAdvancement: restored.updated_at !== journal.issue.updated_at });
        journal.dirtyIssue = false; await recordJournal();
      }
      for (const item of journal.pages) {
        let current = await api(item.href);
        if (journal.dirtyPages.includes(item.original.id)) {
          const restoration = focusPageRestorationState(item, current);
          if (restoration === "unchanged") {
            journal.dirtyPages = journal.dirtyPages.filter((value) => value !== item.original.id); await recordJournal();
            result.cleanup.push({ page: item.original.id, unmodifiedTransportOutcomeConfirmed: true });
            continue;
          }
          assert.equal(restoration, "owned-mutation", "Preserve an unexpected Page version or body for manual reconciliation");
          journal.attempts.push({ restoringPage: item.original.id, currentVersion: current.version }); await recordJournal();
          await api(item.href, "PATCH", { title: item.original.title, icon: item.original.icon, content: item.original.content, version: current.version });
          current = await api(item.href);
          assert.deepEqual(immutablePage(current), immutablePage(item.original));
          assert.ok(current.version > item.original.version);
          assert.notEqual(current.updated_at, item.original.updated_at);
          result.cleanup.push({ pageRestored: item.original.id, originalVersion: item.original.version, restoredVersion: current.version,
            expectedVersionAndTimestampAdvancement: true, originalUpdatedAt: item.original.updated_at, restoredUpdatedAt: current.updated_at });
          journal.dirtyPages = journal.dirtyPages.filter((value) => value !== item.original.id); await recordJournal();
        } else assert.deepEqual(current, item.original, "The untouched selected Page must remain identical");
      }
      if (originalBoard) {
        const after = await api("/api/me/board");
        assert.deepEqual(after.issues.filter((issue) => issue.id !== journal.issue.id), originalBoard.issues.filter((issue) => issue.id !== journal.issue.id), "All unrelated issues must be unchanged");
      }
      for (const tree of trees ?? []) {
        const current = await api(`/api/projects/${tree.project}/pages`);
        const changed = new Set(journal.pages.map(({ original }) => original.id));
        assert.deepEqual(current.filter((row) => !changed.has(row.id)), tree.rows.filter((row) => !changed.has(row.id)), "All unrelated Page metadata must be unchanged");
      }
      if (originalTabs) {
        for (const tab of await api("/api/me/app-tabs")) {
          assert.equal(tab.user_id, fixture.userId);
          if (!originalTabs.some((row) => row.id === tab.id)) {
            assert.ok(createdTabs.has(tab.id), "Refusing to delete an unowned tab");
            await api(`/api/me/app-tabs/${tab.id}`, "DELETE", { revision: tab.revision });
          }
        }
        for (const original of originalTabs) {
          const tab = (await api("/api/me/app-tabs")).find((row) => row.id === original.id);
          assert.deepEqual(tabFields(tab), tabFields(original));
          if (tab.href !== original.href) await api(`/api/me/app-tabs/${tab.id}`, "PATCH", { revision: tab.revision, patch: { href: original.href } });
        }
        await assertStableTabs(api, fixture, tabs);
      }
      if (forge) {
        const { link } = await api(`/api/projects/${forge.project}/git-link`);
        assert.equal(forgeLinkFingerprint(link), forge.linkFingerprint);
      }
      result.cleanup.push({ stableTabCount: tabs?.length, unrelatedIssueAndPageMetadataUnchanged: true, githubConnectionPreserved: true });
    } catch (error) { result.cleanup.push({ error: error.stack, journalPath }); result.status = "failed"; failure ??= error; }
    await session.close();
  }
  if (userData) await rm(userData, { recursive: true, force: true });
  result.finishedAt = new Date().toISOString();
  await writeFile(resultPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ resultPath, journalPath, status: result.status, assertions: result.assertions, cleanup: result.cleanup }));
}
if (failure) process.exitCode = 1;
