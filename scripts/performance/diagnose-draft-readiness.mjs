import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { openFixture, stableManifestPath, assertStableTabs, stableTabs } from "./stable-restored-tabs.mjs";
import { loadForgeWorkload, forgeLinkFingerprint } from "./measure-forge-navigation.mjs";

// Real loaded-draft presentation proof, deliberately outside latency comparisons.
const expected = process.argv.includes("--expect-draft") ? "draft" : "checking";
assert.ok(process.argv.includes("--run-diagnostic"));
const label = process.env.MINDDY_PERF_LABEL;
assert.match(label ?? "", /^min683-restored-after-[a-zA-Z0-9_-]+$/);
const buildRoot = process.env.MINDDY_PERF_BUILD_ROOT;
assert.ok(buildRoot);
const output = path.resolve("output/playwright/performance");
const fingerprint = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const immutableTab = ({ id, user_id, custom_name, pinned, position, created_at }) => ({ id, user_id, custom_name, pinned, position, created_at });
const result = { label, protocol: "min683-excluded-loaded-draft-presentation-v2-scoped-header", expected,
  excludedFromComparison: "Presentation correctness proof; no startup or navigation timing claim",
  timestamp: new Date().toISOString(), status: "running", network: [], cleanup: [] };
let session, browser, context, page, originalTabs, specs, forge, originalBoard, rateLimit, failure;
const pending = new Set();
const createdTabs = new Set();
try {
  session = await openFixture();
  const { api, fixture, base } = session;
  assert.equal(fixture.userId, "86df71f9-44a7-4cc1-8085-5baa6c744490");
  forge = await loadForgeWorkload(api);
  specs = stableTabs(fixture, forge);
  const manifest = JSON.parse(await readFile(stableManifestPath, "utf8"));
  assert.deepEqual(manifest.specs, specs);
  originalTabs = await assertStableTabs(api, fixture, specs);
  originalBoard = fingerprint(await api("/api/me/board"));
  result.product = JSON.parse(await readFile(path.join(buildRoot, ".next/min683-product.json"), "utf8"));
  assert.equal(result.product.build, (await readFile(path.join(buildRoot, ".next/BUILD_ID"), "utf8")).trim());
  result.collectorHash = createHash("sha256").update(await readFile(new URL(import.meta.url))).digest("hex");
  const target = specs.find((spec) => spec.kind === "pr");
  const prId = forge.prs[0].prId;
  assert.equal(new URL(target.href, base).searchParams.get("pr"), prId);
  const messages = JSON.parse(await readFile("messages/en.json", "utf8"));
  const labels = { checking: messages.PullRequests.readinessLoading, draft: messages.PullRequests.readinessDraft };
  assert.ok(labels.checking && labels.draft);
  result.fixture = { userId: fixture.userId, marker: fixture.marker, tabCount: 10, targetPrId: prId };
  browser = await chromium.launch({ headless: false });
  context = await browser.newContext({ viewport: { width: 1440, height: 960 }, colorScheme: "light", locale: "en-US" });
  await context.addCookies(session.cookies.map(({ name, value }) => ({ name, value, url: base, sameSite: "Lax" })));
  await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: base }]);
  await context.addInitScript(() => localStorage.setItem("cookie_consent", "declined"));
  page = await context.newPage();
  page.on("response", (response) => {
    const request = response.request();
    const url = new URL(request.url());
    if (url.origin !== base || !url.pathname.startsWith("/api/")) return;
    const task = (async () => {
      if ([403, 429].includes(response.status())) rateLimit = { status: response.status(), retryAfter: await response.headerValue("retry-after"), path: url.pathname };
      if (url.pathname === `/api/pull-requests/${prId}` && response.ok()) {
        const body = await response.json();
        result.acceptedDetail = { status: response.status(), prState: body.pr?.state, readiness: body.readiness?.state,
          blockers: body.readiness?.blockers?.map((blocker) => blocker.kind), files: body.files?.length };
      }
      if (url.pathname === "/api/me/app-tabs" && request.method() === "POST" && response.ok()) {
        const body = await response.json();
        if (body.tab?.id && !originalTabs.some((tab) => tab.id === body.tab.id)) {
          assert.equal(body.tab.user_id, fixture.userId);
          createdTabs.add(body.tab.id);
        }
      }
      result.network.push({ path: url.pathname, method: request.method(), status: response.status() });
    })().finally(() => pending.delete(task));
    pending.add(task);
  });
  await page.goto(`${base}${target.href}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction((labels) => {
    const visible = (node) => !!node.getClientRects().length && !node.closest('[inert], [aria-hidden="true"]');
    return [...document.querySelectorAll('[data-testid="pr-description"]')].some(visible) &&
      [...document.querySelectorAll('[data-slot="badge"]')].filter(visible).some((node) => [labels.checking, labels.draft].includes(node.textContent.trim()));
  }, labels, { timeout: 30000 });
  await Promise.allSettled(pending);
  assert.ok(!rateLimit, "A denied or limited read cannot certify loaded-draft presentation");
  assert.equal(result.acceptedDetail?.readiness, "draft");
  result.desktop = await page.evaluate((labels) => {
    const visible = (node) => !!node.getClientRects().length && !node.closest('[inert], [aria-hidden="true"]');
    const more = [...document.querySelectorAll('[data-testid="pr-more-actions"]')].find(visible);
    const header = more?.closest(".app-content-header");
    const badges = [...(header?.querySelectorAll('[data-slot="badge"]') ?? [])].filter(visible);
    return { selectedDetailHeaderFound: !!header, checkingBadges: badges.filter((node) => node.textContent.trim() === labels.checking).length,
      draftBadges: badges.filter((node) => node.textContent.trim() === labels.draft).length,
      mergeControls: [...document.querySelectorAll('[data-testid="pr-readiness-merge"]')].filter(visible).length,
      interactiveReadinessControls: [...document.querySelectorAll('[data-testid="pr-readiness-control"]')].filter(visible).length,
      descriptionVisible: [...document.querySelectorAll('[data-testid="pr-description"]')].some(visible) };
  }, labels);
  assert.equal(result.desktop.selectedDetailHeaderFound, true);
  assert.equal(result.desktop.mergeControls, 0);
  assert.equal(result.desktop.interactiveReadinessControls, 0);
  if (expected === "checking") assert.ok(result.desktop.checkingBadges > 0, "The unchanged binary must reproduce the loaded-draft checking defect");
  else { assert.equal(result.desktop.checkingBadges, 0); assert.ok(result.desktop.draftBadges >= 2, "State and readiness must both report the accepted draft"); }
  // Crop only the fixture's readiness label, never the shared real PR sidebar.
  const badge = page.locator('[data-slot="badge"]').filter({ hasText: new RegExp(`^${labels[expected].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), visible: true }).last();
  await badge.screenshot({ path: path.join(output, `${label}.png`) });
  if (process.argv.includes("--mobile")) {
    await page.setViewportSize({ width: 640, height: 960 });
    await page.locator('[data-testid="pr-description"]').filter({ visible: true }).waitFor();
    await page.locator('[data-testid="pr-more-actions"]').filter({ visible: true }).click();
    const menu = page.locator('[data-testid="pr-readiness-menu"]').filter({ visible: true });
    await menu.waitFor();
    result.mobile = { labelMatches: (await menu.innerText()).trim() === labels[expected],
      disabled: await menu.getAttribute("aria-disabled") === "true" };
    assert.equal(result.mobile.labelMatches, true);
    assert.equal(result.mobile.disabled, true);
    await menu.screenshot({ path: path.join(output, `${label}-mobile.png`) });
    await page.keyboard.press("Escape");
  }
  result.status = "passed";
} catch (error) { failure = error; result.status = "failed"; result.failure = { name: error.name, message: error.message.split("\n")[0] }; }
finally {
  await page?.close().catch(() => {});
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await Promise.allSettled(pending);
  if (session && originalTabs) try {
    const { api, fixture } = session;
    for (const current of await api("/api/me/app-tabs")) if (!originalTabs.some((tab) => tab.id === current.id)) {
      assert.ok(createdTabs.has(current.id), "Never delete an unrecognized tab");
      await api(`/api/me/app-tabs/${current.id}`, "DELETE", { revision: current.revision });
    }
    for (const original of originalTabs) {
      const current = (await api("/api/me/app-tabs")).find((tab) => tab.id === original.id);
      assert.deepEqual(immutableTab(current), immutableTab(original));
      if (current.href !== original.href) await api(`/api/me/app-tabs/${current.id}`, "PATCH", { revision: current.revision, patch: { href: original.href } });
    }
    await assertStableTabs(api, fixture, specs);
    assert.equal(fingerprint(await api("/api/me/board")), originalBoard);
    const { link } = await api(`/api/projects/${forge.project}/git-link`);
    assert.equal(forgeLinkFingerprint(link), forge.linkFingerprint);
    result.cleanup.push({ tenTabsAndMetadataPreserved: true, originalDestinationsRestored: true, completeIssueSourceUnchanged: true, githubConnectionUnchanged: true });
  } catch { result.status = "failed-preservation"; failure ??= new Error("Fixture preservation failed"); }
  await session?.close();
  if (rateLimit) result.rateLimit = rateLimit;
  result.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, `${label}.json`), JSON.stringify(result, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ status: result.status, failure: result.failure, desktop: result.desktop, resultPath: path.join(output, `${label}.json`) }));
}
if (failure || result.status !== "passed") process.exitCode = 1;
