import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, _electron } from "playwright";
import { openFixture, stableTabs, stableManifestPath, assertStableTabs } from "./stable-restored-tabs.mjs";
import { forgeLinkFingerprint, loadConnectedBoardWorkload, loadForgeWorkload } from "./measure-forge-navigation.mjs";
import { optionalSecondaryWorkload, secondaryEvidence } from "./secondary-navigation-workload.mjs";
import { boardReady } from "./board-readiness.mjs";
import { restoredDestinationReady, RESTORED_LOADING_SELECTOR } from "./restored-navigation-readiness.mjs";
import { assertScope } from "./seed.mjs";

// Deliberately excluded: route interception changes scheduling. This runner
// proves selection recovery and cleanup, never startup/navigation latency.
// Run only after every ordinary comparison and other UI owner has stopped.
assert.ok(process.argv.includes("--execute-excluded"), "Pass --execute-excluded only in a separately authorized quiet UI window");
assert.equal(process.env.MINDDY_PERF_EXCLUSIVE_UI_OWNER, "task47", "The operator must reserve the sole UI owner for this excluded diagnostic");
const electron = process.argv.includes("--electron");
const label = process.env.MINDDY_PERF_LABEL ?? `min683-restored-after-scaled-window-selection-protocol-diagnostic-${electron ? "native" : "web"}-1`;
assert.match(label, /^min683-restored-after-[a-zA-Z0-9_-]+$/);
const output = path.resolve("output/playwright/performance");
await mkdir(output, { recursive: true });
const resultPath = path.join(output, `${label}.json`);
const lockPath = path.join(output, ".task47-exclusive-ui-owner.lock");
const lease = await open(lockPath, "wx");
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const result = { protocol: "min683-excluded-window-selection-v1", excludedFromLatencyAggregates: true,
  excludedFromComparison: "Held window-selection persistence diagnostic; never ordinary latency evidence",
  interpretation: "Correctness under held window-selection persistence; diagnostic durations are never latency acceptance evidence",
  label, runtime: electron ? "unpackaged Electron" : "headful Chromium", startedAt: new Date().toISOString(),
  status: "running", checks: [], metadata: [], network: { windowSeals: [], snapshotOpens: [], rateLimits: [] }, cleanup: [],
  limitations: ["A hard reload cannot guarantee receipt of the latest optional persistence ACK before unload.",
    "A successful recovery must show the actual PR identity and complete useful content, including its ordinary authorization result.",
    "No remote/content write, editor input, personal browser profile, intentional tab creation, or forced GitHub refresh belongs to this diagnostic."] };
let fixtureSession, browser, context, page, userData, originalTabs, specs, forge, secondary, board, releaseHeld;
let failure, held, armed = false;
const createdIds = new Set();
const preservedPages = [];
const pending = new Set();
const mutations = [];
const runnerSources = [fileURLToPath(import.meta.url), ...["stable-restored-tabs.mjs", "measure-forge-navigation.mjs", "secondary-navigation-workload.mjs", "enrich-secondary-workload.mjs",
  "board-readiness.mjs", "restored-navigation-readiness.mjs", "seed.mjs"].map((file) => path.resolve("scripts/performance", file))];
const runnerHash = async () => digest(await Promise.all(runnerSources.map((file) => readFile(file, "utf8"))));
const knownTabFields = ({ id, user_id, custom_name, pinned, position }) => ({ id, user_id, custom_name, pinned, position });
const pendingTask = (operation) => {
  const task = operation.catch((error) => { result.checks.push({ asynchronousError: String(error.message).slice(0, 200) }); })
    .finally(() => pending.delete(task));
  pending.add(task);
};
const waitUntil = async (predicate, label, timeoutMs = 15_000) => {
  const end = Date.now() + timeoutMs;
  while (!predicate()) {
    assert.ok(Date.now() < end, label);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

try {
  fixtureSession = await openFixture();
  const { api, fixture, base } = fixtureSession;
  forge = await loadForgeWorkload(api);
  specs = stableTabs(fixture, forge);
  const manifest = JSON.parse(await readFile(stableManifestPath, "utf8"));
  assert.equal(manifest.email, fixture.email);
  assert.equal(manifest.userId, fixture.userId);
  assert.equal(manifest.marker, fixture.marker);
  assert.deepEqual(manifest.specs, specs);
  originalTabs = await assertStableTabs(api, fixture, specs);
  assert.equal(originalTabs.length, 10);
  for (const spec of specs) {
    const current = originalTabs.find((tab) => tab.id === spec.id);
    if (current.href !== spec.href) await api(`/api/me/app-tabs/${spec.id}`, "PATCH", { revision: current.revision, patch: { href: spec.href } });
  }
  secondary = await optionalSecondaryWorkload(api, fixture);
  board = await loadConnectedBoardWorkload(api, fixture, secondary);
  const all = specs.find((spec) => spec.kind === "all");
  Object.assign(all, { cards: board.cards, cardIds: board.cardIds });
  const document = specs.find((spec) => spec.kind === "page");
  const home = specs.find((spec) => spec.kind === "home");
  const pr = specs.find((spec) => spec.kind === "pr");
  Object.assign(pr, forge.prs[0], { files: forge.files, commits: forge.commits });
  for (const spec of specs.filter((spec) => spec.kind === "page")) {
    const url = `/api/projects/${spec.projectId}/pages/${spec.pageId}`;
    const data = await api(url);
    assertScope("pages", data, fixture.userId);
    assert.equal(data.content.content.length, 80);
    Object.assign(spec, { title: data.title, bodyText: data.content.content.find((block) => block.type === "paragraph")?.content?.find((node) => node.type === "text")?.text });
    assert.ok(spec.bodyText);
    preservedPages.push({ url, fingerprint: digest(data), version: data.version });
  }
  const buildRoot = process.env.MINDDY_PERF_BUILD_ROOT ?? process.cwd();
  const build = (await readFile(path.join(buildRoot, ".next/BUILD_ID"), "utf8")).trim();
  const product = JSON.parse(await readFile(path.join(buildRoot, ".next/min683-product.json"), "utf8"));
  assert.equal(product.build, build);
  assert.match(product.sha, /^[a-f0-9]{40}$/);
  assert.deepEqual(Object.keys(product.environmentFiles ?? {}).sort(), [".env", ".env.local", ".env.production", ".env.production.local"].sort());
  assert.match(product.environmentFiles[".env"], /^[a-f0-9]{64}$/);
  assert.ok(Object.values(product.environmentFiles).every((entry) => entry === null || /^[a-f0-9]{64}$/.test(entry)));
  Object.assign(result, { sha: product.sha, build, product: { sha: product.sha, build, environmentFiles: product.environmentFiles }, runnerSha: git("rev-parse", "HEAD"),
    runnerSourceHash: await runnerHash(), runnerSourceHashScope: runnerSources.map((file) => path.relative(process.cwd(), file)), owner: fixture.userId,
    fixture: { stableTabCount: specs.length, sourceIssueCount: board.sourceIssues, forgeCohortCount: forge.prs.length,
      targets: [document, home, pr, all].map(({ id, kind }) => ({ id, kind })) } });

  if (electron) {
    userData = await mkdtemp(path.join(tmpdir(), "minddy-min683-window-selection-"));
    const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
    Object.assign(env, { MINDDY_DESKTOP_ORIGIN: base, MINDDY_DESKTOP_TEST_USER_DATA: userData });
    browser = await _electron.launch({ args: [`--user-data-dir=${userData}`, path.resolve("desktop")], cwd: path.resolve("desktop"), env, timeout: 30_000 });
    const actual = await browser.evaluate(({ app }) => ({ packaged: app.isPackaged, userData: app.getPath("userData"), sessionData: app.getPath("sessionData") }));
    assert.equal(actual.packaged, false);
    assert.equal(path.resolve(actual.userData), userData);
    assert.equal(path.resolve(actual.sessionData), userData);
    context = browser.context();
  } else {
    browser = await chromium.launch({ headless: false });
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light", locale: "en-US" });
  }
  await context.addCookies(fixtureSession.cookies.map(({ name, value }) => ({ name, value, url: base, sameSite: "Lax" })));
  await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: base }]);
  page = electron ? await browser.firstWindow() : await context.newPage();
  const installReadiness = ({ readinessSource, boardSource, loadingSelector }) => {
    localStorage.setItem("cookie_consent", "declined");
    window.__restored = { loadingSelector, boardReady: new Function(`return (${boardSource})`)(),
      ready: new Function(`return (${readinessSource})`)(), prPermissions: {} };
  };
  await context.addInitScript(installReadiness, { readinessSource: restoredDestinationReady.toString(), boardSource: boardReady.toString(), loadingSelector: RESTORED_LOADING_SELECTOR });
  page.setDefaultTimeout(20_000);

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== base) { await route.abort(); throw new Error("Refuse a foreign API origin"); }
    const method = request.method();
    if (["GET", "HEAD", "OPTIONS"].includes(method)) return route.continue();
    if (url.pathname === "/api/me/local-snapshots" && method === "POST") {
      const body = request.postDataJSON();
      if (body.operation === "seal" && body.slot === "window-tabs") {
        const known = specs.find((spec) => spec.id === body.value?.id);
        assert.ok(known, "Window selection must reference a known stable tab");
        const event = { ordinal: result.network.windowSeals.length, slot: "window-tabs", knownTabId: known.id, kind: known.kind, completed: false, held: false };
        result.network.windowSeals.push(event);
        request.__windowSealMetadata = event;
        if (armed && !held) {
          armed = false;
          const release = new Promise((resolve) => { releaseHeld = resolve; });
          held = { request, event };
          event.held = true;
          await release;
          try { await route.continue(); } catch { await route.abort().catch(() => {}); }
          return;
        }
      }
      if (body.operation === "open") result.network.snapshotOpens.push({ slot: ["query-cache", "window-tabs", "issue-drafts", "objective-drafts", "search-history", "page-list-settings"].includes(body.slot) ? body.slot : "unknown",
        ownerMatches: body.snapshot?.owner === fixture.userId });
      return route.continue();
    }
    if (url.pathname.startsWith("/api/me/app-tabs") && ["POST", "PATCH", "DELETE"].includes(method)) return route.continue();
    mutations.push({ path: url.pathname, method });
    await route.abort();
  });
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith("/api/me/app-tabs") && ["POST", "PATCH", "DELETE"].includes(request.method())) {
      pendingTask(request.response().then((response) => response?.finished()));
    }
  });
  page.on("response", (response) => pendingTask((async () => {
    const request = response.request();
    const pathname = new URL(response.url()).pathname;
    if ([403, 429].includes(response.status())) {
      const retryAfter = await response.headerValue("retry-after");
      const seconds = retryAfter?.trim() ? Number(retryAfter) : NaN;
      const body = pathname.startsWith("/api/pull-requests/") ? await response.json().catch(() => ({})) : {};
      // Persist only fixed classifications and numeric backoff metadata. Never
      // retain a forge error payload, arbitrary response headers or credentials.
      const primaryRateLimit = /API rate limit exceeded/i.test(String(body.error ?? ""));
      const secondaryRateLimit = /secondary rate limit|abuse detection/i.test(String(body.error ?? ""));
      if (response.status() === 429 || retryAfter !== null || primaryRateLimit || secondaryRateLimit) {
        result.network.rateLimits.push({ path: pathname, status: response.status(), retryAfterPresent: retryAfter !== null,
          ...(Number.isFinite(seconds) && seconds >= 0 ? { retryAfterSeconds: seconds } : {}), primaryRateLimit, secondaryRateLimit });
      }
    }
    if (request.__windowSealMetadata) {
      const event = request.__windowSealMetadata;
      event.completed = true;
      event.status = response.status();
      if (response.ok()) {
        const body = await response.json();
        event.envelopePresent = body.snapshot?.format === "minddy-local-v1";
        event.ownerMatches = body.snapshot?.owner === fixture.userId;
        assert.equal(event.ownerMatches, true);
      }
    }
    if (pathname === "/api/me/app-tabs" && request.method() === "POST" && response.ok()) {
      const body = await response.json();
      if (body.tab?.id && !originalTabs.some((tab) => tab.id === body.tab.id)) {
        assert.equal(body.tab.user_id, fixture.userId);
        createdIds.add(body.tab.id);
      }
    }
    if (pathname === `/api/pull-requests/${pr.prId}` && request.method() === "GET" && response.ok()) {
      const body = await response.json();
      const capability = body.viewer?.capability;
      if (typeof capability === "string") {
        pr.canComment = ["read", "write"].includes(capability);
        await page.evaluate(({ id, canComment }) => {
          if (window.__restored) window.__restored.prPermissions[id] = canComment;
        }, { id: pr.prId, canComment: pr.canComment }).catch(() => {});
      }
    }
  })()));
  page.on("requestfailed", (request) => {
    if (request.__windowSealMetadata) request.__windowSealMetadata.failed = true;
  });

  const metadata = async (phase) => {
    const values = await page.evaluate(({ owner, windowKey }) => {
      const read = (storage, key) => {
        try {
          const raw = storage.getItem(key);
          if (!raw) return { present: false, envelopePresent: false, ownerMatches: null };
          const envelope = JSON.parse(raw);
          return { present: true, envelopePresent: envelope.format === "minddy-local-v1", ownerMatches: envelope.owner === owner };
        } catch { return { present: true, envelopePresent: false, ownerMatches: null }; }
      };
      return { restoredTabCount: document.querySelectorAll("[data-app-tab-id]").length,
        selectedTabId: document.querySelector('[data-app-tab-id][aria-selected="true"]')?.dataset.appTabId ?? null,
        slots: { "window-tabs": read(sessionStorage, windowKey), "query-cache": read(localStorage, "minddy.query-cache") } };
    }, { owner: fixture.userId, windowKey: `minddy.app-tabs.${fixture.userId}` });
    result.metadata.push({ phase, ...values });
    assert.equal(values.restoredTabCount, 10);
    for (const slot of Object.values(values.slots)) if (slot.envelopePresent) assert.equal(slot.ownerMatches, true);
    return values;
  };
  const ready = async (spec) => {
    await page.waitForFunction((target) => window.__restored?.ready(target), spec, { timeout: 20_000 });
    assert.equal(await page.locator('[data-app-tab-id][aria-selected="true"]').getAttribute("data-app-tab-id"), spec.id);
  };
  const activate = async (spec) => {
    await page.locator(`[data-app-tab-id="${spec.id}"]`).scrollIntoViewIfNeeded();
    await page.locator(`[data-app-tab-id="${spec.id}"]`).click();
    await ready(spec);
  };
  const completedSeal = (spec, since = 0) => result.network.windowSeals.slice(since).some((event) => event.knownTabId === spec.id && event.completed && event.status === 200 && event.envelopePresent && event.ownerMatches);

  await page.goto(`${base}/all`, { waitUntil: "domcontentloaded" });
  await ready(all);
  await activate(pr);
  await activate(document);
  const warmReturnSince = result.network.windowSeals.length;
  await activate(all);
  await waitUntil(() => completedSeal(all, warmReturnSince), "The settled starting selection must have an authorized envelope");
  await waitUntil(() => result.network.windowSeals.every((event) => event.completed || event.failed), "Earlier warmup seals must drain before interception");
  await metadata("warm-full-Page-and-PR-returned-All");
  // Hold exactly the first older Page seal. Do not delay query-cache seals,
  // canonical tabs, Page content, PR detail, or the subsequent reload itself.
  armed = true;
  await activate(document);
  await waitUntil(() => !!held, "The older Page selection seal must be intercepted");
  assert.equal(held.event.knownTabId, document.id);
  await activate(home);
  await activate(pr);
  await page.waitForFunction(() => location.pathname === "/pull-requests" && !new URL(location.href).searchParams.has("pr"));
  assert.equal(held.event.completed, false);
  const preReload = await metadata("rapid-Page-Home-PR-before-real-reload");
  result.checks.push({ case: "rapid-selection", olderSealHeldAtReload: true,
    latestSelectionHadAcknowledgedSealBeforeReload: completedSeal(pr, held.event.ordinal + 1),
    selectedTabId: preReload.selectedTabId, barePrAddress: true, expectedPrId: pr.prId });
  const navigated = page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame());
  const reload = page.reload({ waitUntil: "domcontentloaded" });
  // The real unload owns its own flush semantics. Release the obsolete
  // transport only after navigation commits; its ACK is never a prerequisite.
  await navigated;
  releaseHeld();
  await reload;
  await ready(pr);
  await metadata("rapid-real-reload-complete-PR");
  assert.equal((await assertStableTabs(api, fixture, specs)).length, 10);
  result.checks.push({ case: "rapid-reload-identity", sameStablePrTab: true, actualPrId: pr.prId, completeUsefulPrBody: true });

  await activate(all);
  const settledSince = result.network.windowSeals.length;
  await activate(pr);
  await waitUntil(() => completedSeal(pr, settledSince), "The control selection must settle normally before reload");
  await metadata("settled-control-before-reload");
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready(pr);
  await metadata("settled-control-after-reload");
  result.checks.push({ case: "settled-reload-identity", sameStablePrTab: true, actualPrId: pr.prId, completeUsefulPrBody: true });
  assert.deepEqual(mutations, [], "No content or other account mutation is permitted");
  assert.deepEqual(result.network.rateLimits, [], "Stop on rate limiting; never bypass Retry-After");
  assert.equal(createdIds.size, 0, "The product must reuse the ten existing tabs after both reloads");
  assert.ok(!result.checks.some((check) => check.asynchronousError));
  result.status = "passed";
} catch (error) {
  failure = error;
  result.status = "failed";
  result.failure = { name: error.name, message: String(error.message).slice(0, 500) };
} finally {
  releaseHeld?.();
  if (page) await page.unrouteAll({ behavior: "wait" }).catch(() => {});
  await Promise.allSettled(pending);
  await browser?.close().catch(() => {});
  await Promise.allSettled(pending);
  if (fixtureSession && originalTabs) {
    try {
      const { api, fixture } = fixtureSession;
      for (const tab of await api("/api/me/app-tabs")) {
        assert.equal(tab.user_id, fixture.userId);
        if (!originalTabs.some((original) => original.id === tab.id)) {
          assert.ok(createdIds.has(tab.id), "Never remove an unrecognized tab");
          await api(`/api/me/app-tabs/${tab.id}`, "DELETE", { revision: tab.revision });
          result.cleanup.push({ removedKnownRendererCreatedId: tab.id });
        }
      }
      for (const original of originalTabs) {
        const current = (await api("/api/me/app-tabs")).find((tab) => tab.id === original.id);
        assert.ok(current, "Never recreate a missing stable tab silently");
        assert.deepEqual(knownTabFields(current), knownTabFields(original));
        if (current.href !== original.href) await api(`/api/me/app-tabs/${current.id}`, "PATCH", { revision: current.revision, patch: { href: original.href } });
      }
      const restored = await assertStableTabs(api, fixture, specs);
      assert.ok(originalTabs.every((original) => restored.find((tab) => tab.id === original.id)?.href === original.href));
      for (const page of preservedPages) assert.equal(digest(await api(page.url)), page.fingerprint, "Preserve Page content and versions");
      if (secondary) assert.deepEqual(secondaryEvidence(await optionalSecondaryWorkload(api, fixture)), secondaryEvidence(secondary));
      if (board) assert.deepEqual(await loadConnectedBoardWorkload(api, fixture, secondary), board, "Preserve every issue and complete board source");
      const { link } = await api(`/api/projects/${forge.project}/git-link`);
      assert.equal(forgeLinkFingerprint(link), forge.linkFingerprint);
      result.cleanup.push({ exactOriginalTabCount: originalTabs.length, metadataAndDestinationsRestored: true,
        issuesAndPagesUnchanged: true, pageVersionsUnchanged: true, githubConnectionPreserved: true });
    } catch (error) {
      result.status = "failed";
      failure ??= error;
      result.cleanup.push({ error: String(error.message).slice(0, 500) });
    }
  }
  await fixtureSession?.close();
  if (userData) await rm(userData, { recursive: true, force: true });
  if (result.runnerSourceHash) {
    result.runnerSourcesUnchanged = await runnerHash().then((current) => current === result.runnerSourceHash, () => false);
    if (!result.runnerSourcesUnchanged) { result.status = "failed"; failure ??= new Error("Diagnostic sources changed during execution"); }
  }
  result.finishedAt = new Date().toISOString();
  await writeFile(resultPath, JSON.stringify(result, null, 2));
  await lease.close();
  await rm(lockPath, { force: true });
  console.log(JSON.stringify({ excludedFromComparison: true, status: result.status, resultPath }));
}
if (failure) process.exitCode = 1;
