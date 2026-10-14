import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { _electron } from "playwright";
import { openFixture, stableManifestPath, assertStableTabs } from "./stable-restored-tabs.mjs";
import { digest, persistenceProbeSource, metadataExpression, restoreMetadataExpression, snapshotWireMetadata, publishedFeedbackProof } from "./diagnose-query-snapshot-source.mjs";

// EXCLUDED diagnostic: pause the unchanged production closure and inspect only
// aggregate metadata. No debug endpoint, app source edit, cookie or body export.
assert.ok(process.argv.includes("--diagnostic"), "This script is an excluded diagnostic only");
const require = createRequire(import.meta.url);
assert.equal(path.resolve(require("electron")), path.resolve("desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"),
  "Use NODE_PATH=./desktop/node_modules to resolve the existing fixture Electron runtime");
const label = process.env.MINDDY_PERF_LABEL ?? "min683-query-snapshot-before-scaled-diagnostic-1";
const expectCompact = process.env.MINDDY_PERF_EXPECT_COMPACT === "1";
assert.match(label, /^[a-zA-Z0-9_-]+$/);
const productRoot = process.env.MINDDY_PERF_BUILD_ROOT;
assert.ok(productRoot, "Declare the exact unchanged production build root");
const product = JSON.parse(await readFile(path.join(productRoot, ".next/min683-product.json"), "utf8"));
assert.equal(product.sha, process.env.MINDDY_PERF_EXPECT_SHA ?? "4979abaf981d43e11ce4e91e18a4d34a845fadca");
assert.equal(product.build, (await readFile(path.join(productRoot, ".next/BUILD_ID"), "utf8")).trim());
const output = path.resolve("output/playwright/performance", `${label}.json`);
const result = { label, protocol: "min683-excluded-actual-persist-client-v1", timestamp: new Date().toISOString(),
  excludedFromComparison: "Debugger pauses and metadata traversals invalidate all latency measurements", product,
  status: "running", observations: [], snapshots: [], compactSnapshots: [], restoreBoundaries: [], feedbackSources: [], activatedKinds: [], probeErrors: [], cleanup: [] };
result.runnerSourceHashScope = ["diagnose-query-snapshot.mjs", "diagnose-query-snapshot-source.mjs"];
result.runnerSourceHash = digest((await Promise.all(result.runnerSourceHashScope.map((file) => readFile(path.resolve("scripts/performance", file), "utf8")))).join("\n"));
let session, browser, page, context, cdp, userData, originalTabs, originals, specs, linkBefore, issuesBefore;
let phase = "setup", pauseWork = Promise.resolve();
const breakpointIds = new Map(), sources = new Map();
const feedbackProofs = new Map();
const wireValues = new WeakMap();
const fingerprint = (value) => digest(JSON.stringify(value));
const tabFields = ({ id, user_id, custom_name, pinned, position, href }) => ({ id, user_id, custom_name, pinned, position, href });
const networkWork = new Set();
try {
  const chunks = path.join(productRoot, ".next/static/chunks");
  for (const name of await readdir(chunks)) {
    if (!name.endsWith(".js")) continue;
    const source = await readFile(path.join(chunks, name), "utf8");
    if (!source.includes("persistClient:") || !source.includes("2097152")) continue;
    const probe = persistenceProbeSource(source, name);
    if (probe) sources.set(name, probe);
  }
  assert.ok(sources.size, "Locate the actual production persistence closure");
  result.probeSources = [...sources.values()].map(({ filename, sourceHash, budgetSourceHash, predicateSourceHash, lineNumber, columnNumber }) =>
    ({ filename, sourceHash, budgetSourceHash, predicateSourceHash, lineNumber, columnNumber }));
  session = await openFixture();
  assert.equal(session.base, expectCompact ? "http://localhost:3111" : "http://localhost:3112");
  const manifest = JSON.parse(await readFile(stableManifestPath, "utf8"));
  assert.equal(manifest.userId, session.fixture.userId); assert.equal(manifest.email, session.fixture.email);
  assert.equal(manifest.marker, session.fixture.marker); specs = manifest.specs;
  assert.equal(specs.length, 10);
  originalTabs = await assertStableTabs(session.api, session.fixture, specs);
  const board = await session.api("/api/me/board");
  assert.equal(board.issues.length, 1206);
  issuesBefore = fingerprint([...board.issues].sort((a, b) => a.id.localeCompare(b.id)));
  result.issueSourceFingerprint = issuesBefore;
  const expectedProjectIds = session.fixture.projects.slice(0, 2).map((id) => board.issues.filter((issue) => issue.project_id === id).map((issue) => issue.id).sort());
  assert.deepEqual(expectedProjectIds.map((ids) => ids.length), [670, 100]);
  const cardIds = board.issues.filter((issue) => !["triage", "duplicate"].includes(issue.status)).map((issue) => issue.id).sort();
  assert.equal(cardIds.length, 1086);
  result.fixture = { identityVerified: true, stableTabs: 10, sourceIssues: 1206, boardCards: cardIds.length };
  const forgeProject = manifest.forge.project;
  linkBefore = fingerprint(await session.api(`/api/projects/${forgeProject}/git-link`));
  result.githubLinkFingerprint = linkBefore;
  originals = await Promise.all(specs.filter((spec) => spec.kind === "page").map(async (spec) => {
    const endpoint = `/api/projects/${spec.projectId}/pages/${spec.pageId}`;
    const body = await session.api(endpoint);
    assert.equal(body.id, spec.pageId); assert.equal(body.project_id, spec.projectId);
    return { endpoint, fingerprint: fingerprint(body) };
  }));
  result.pageFingerprints = originals.map(({ fingerprint }) => fingerprint);
  userData = await mkdtemp(path.join(tmpdir(), "minddy-min683-cache-probe-"));
  const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  Object.assign(env, { MINDDY_DESKTOP_ORIGIN: session.base, MINDDY_DESKTOP_TEST_USER_DATA: userData });
  browser = await _electron.launch({ args: [`--user-data-dir=${userData}`, path.resolve("desktop")], cwd: path.resolve("desktop"), env, timeout: 30000 });
  context = browser.context();
  await context.addCookies(session.cookies.map(({ name, value }) => ({ name, value, url: session.base, sameSite: "Lax" })));
  await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: session.base }]);
  await context.addInitScript(() => localStorage.setItem("cookie_consent", "declined"));
  page = await browser.firstWindow();
  await page.evaluate(() => localStorage.setItem("cookie_consent", "declined"));
  cdp = await context.newCDPSession(page);
  await cdp.send("Debugger.enable");
  for (const [name, probe] of sources) {
    const added = await cdp.send("Debugger.setBreakpointByUrl", { url: `${session.base}/_next/static/chunks/${name}`,
      lineNumber: probe.lineNumber, columnNumber: probe.columnNumber });
    breakpointIds.set(added.breakpointId, { probe, kind: "persist" });
    if (expectCompact) {
      assert.ok(probe.restore, "Locate the exact ordinary restored freshness boundary");
      const restore = await cdp.send("Debugger.setBreakpointByUrl", { url: `${session.base}/_next/static/chunks/${name}`,
        lineNumber: probe.restore.lineNumber, columnNumber: probe.restore.columnNumber });
      breakpointIds.set(restore.breakpointId, { probe, kind: "restore" });
    }
  }
  cdp.on("Debugger.paused", (event) => {
    pauseWork = pauseWork.then(async () => {
      try {
        const boundary = event.hitBreakpoints?.map((id) => breakpointIds.get(id)).find(Boolean);
        assert.ok(boundary, "Only an authorized production persistence boundary may pause");
        const { probe, kind } = boundary;
        const frame = event.callFrames[0];
        const script = await cdp.send("Debugger.getScriptSource", { scriptId: frame.location.scriptId });
        assert.equal(digest(script.scriptSource), probe.sourceHash, "Verify exact served build source before inspecting scope");
        const inspection = await cdp.send("Debugger.evaluateOnCallFrame", { callFrameId: frame.callFrameId,
          expression: kind === "restore" ? restoreMetadataExpression(probe, session.fixture.projects) : metadataExpression(probe, session.fixture.projects), returnByValue: true, silent: true });
        assert.ok(!inspection.exceptionDetails, "The constrained metadata expression must resolve in the actual closure");
        if (kind === "persist") {
          assert.equal(typeof inspection.result.value?.productionFits, "boolean");
          result.observations.push({ phase, at: new Date().toISOString(), sourceHash: probe.sourceHash, ...inspection.result.value });
        } else result.restoreBoundaries.push({ phase, sourceHash: probe.sourceHash, ...inspection.result.value });
      } catch (error) { result.probeErrors.push({ phase, name: error.name, message: error.message.slice(0, 300) }); }
      finally { await cdp.send("Debugger.resume").catch(() => {}); }
    });
  });
  context.on("requestfinished", (request) => {
    const url = new URL(request.url());
    const feedback = url.pathname === `/api/projects/${session.fixture.projects[0]}/feedback`;
    if (request.url() !== `${session.base}/api/me/local-snapshots` && !feedback) return;
    const pending = (async () => {
      const response = await request.response();
      if (feedback) {
        if (!response?.ok()) return;
        const value = await response.json();
        if (!Array.isArray(value.posts) || !value.posts.every((post) => typeof post?.id === "string")) return;
        const proof = { posts: value.posts.length, rowIdsSha256: fingerprint(value.posts.map((post) => post.id).sort()) };
        feedbackProofs.set(proof.rowIdsSha256, { ...proof, ids: value.posts.map((post) => post.id) });
        result.feedbackSources.push({ phase, ...proof });
        return;
      }
      const body = request.postDataJSON();
      result.snapshots.push({ phase, operation: ["seal", "open"].includes(body?.operation) ? body.operation : "other",
        slot: /^[a-z-]{1,40}$/.test(body?.slot) ? body.slot : "other", status: response?.status() });
      if (body?.slot !== "query-cache" || !response?.ok()) return;
      const wire = body.operation === "seal" ? request.postData() : body.operation === "open" ? await response.text() : null;
      if (!wire) return;
      const source = [...sources.values()].find((probe) => result.observations.some((capture) => capture.sourceHash === probe.sourceHash)) ?? [...sources.values()][0];
      const metadata = snapshotWireMetadata(source, wire, session.fixture.projects);
      metadata.budgetSourceHash = source.budgetSourceHash;
      const value = JSON.parse(wire).value;
      metadata.completeProjects = expectedProjectIds.map((ids, index) => {
        const query = value.clientState.queries.find((query) => query.queryKey[0] === "issues" && query.queryKey[1] === session.fixture.projects[index]);
        const actual = query?.state.data;
        return { scope: `synthetic-project-${index + 1}`, expectedRows: ids.length,
          rows: Array.isArray(actual) ? actual.length : null, completeIdsMatch: Array.isArray(actual) && fingerprint(actual.map((row) => row.id).sort()) === fingerprint(ids) };
      });
      metadata.completeFeedback = metadata.queries.filter((query) => query.collections.posts === 96).map((query) => ({
        rows: 96, ordinaryResponseIdsMatch: feedbackProofs.has(query.rowIdsSha256), rowIdsSha256: query.rowIdsSha256,
      }));
      const capture = { phase, operation: body.operation, status: response.status(), ...metadata };
      result.compactSnapshots.push(capture); wireValues.set(capture, value);
    })().catch(() => result.probeErrors.push({ phase, message: "Snapshot request metadata unavailable" }))
      .finally(() => networkWork.delete(pending));
    networkWork.add(pending);
  });
  await page.goto(`${session.base}/all`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-app-tab-id][aria-selected="true"]', { timeout: 30000 });
  const rendererTabs = await page.evaluate(async () => {
    const response = await fetch("/api/me/app-tabs"); if (!response.ok) throw new Error("Fixture renderer session is unauthorized"); return response.json();
  });
  assert.equal(rendererTabs.length, 10);
  assert.ok(rendererTabs.every((tab) => tab.user_id === session.fixture.userId && specs.some((spec) => spec.id === tab.id)));
  result.fixture.rendererIdentityVerified = true;
  const all = specs.find((spec) => spec.kind === "all");
  if (await page.locator(`[data-app-tab-id="${all.id}"]`).getAttribute("aria-selected") !== "true") {
    await page.locator(`[data-app-tab-id="${all.id}"]`).click();
  }
  await page.waitForFunction((id) => {
    if (!document.querySelector(`[data-app-tab-id="${id}"][aria-selected="true"]`)) return false;
    let fiber = document.querySelector('[data-app-tab-id]');
    fiber = fiber?.[Object.keys(fiber).find((key) => key.startsWith('__reactFiber$'))];
    for (let depth = 0; fiber && depth < 100; depth++, fiber = fiber.return) {
      const client = fiber.memoizedProps?.client;
      if (typeof client?.getQueryCache === "function") return client.getQueryData(["me", "board"])?.issues?.length === 1206;
    }
    return false;
  }, all.id, { timeout: 30000 });
  // This is a persistence occupancy probe, not a DOM/full-paint measurement.
  // The actual eligible snapshot below proves its contents and budget result.
  result.fixture.initialSelectedGlobalSourceComplete = true;
  phase = "initial-complete-board";
  await page.waitForTimeout(12000);
  for (const spec of specs.filter((spec) => spec.kind !== "all")) {
    phase = `activate-${spec.kind}`;
    const tab = page.locator(`[data-app-tab-id="${spec.id}"]`);
    await tab.click();
    await page.waitForFunction((id) => document.querySelector(`[data-app-tab-id="${id}"][aria-selected="true"]`), spec.id, { timeout: 15000 });
    // This diagnostic establishes occupancy, not first-paint latency. Let each
    // actual surface mount its ordinary readers before moving to another tab.
    await page.waitForTimeout(2500);
    result.activatedKinds.push(spec.kind);
  }
  phase = "all-ten-activated";
  await page.waitForTimeout(15000);
  result.finalEnvelope = await page.evaluate(() => {
    const raw = localStorage.getItem("minddy.query-cache");
    if (!raw) return { present: false, encodedBytes: 0 };
    try { const saved = JSON.parse(raw); return { present: true, formatMatches: saved.format === "minddy-local-v1", encodedBytes: new TextEncoder().encode(raw).length }; }
    catch { return { present: true, invalid: true }; }
  });
  await pauseWork;
  await Promise.allSettled(networkWork);
  assert.ok(result.observations.length, "At least one actual persistClient invocation is required");
  if (expectCompact) {
    assert.equal(result.finalEnvelope.present, true, "The compact query cache must actually be stored");
    const tabs = await assertStableTabs(session.api, session.fixture, specs);
    const feedbackSpec = specs.find((spec) => spec.kind === "feedback");
    const href = new URL(tabs.find((tab) => tab.id === feedbackSpec.id).href, session.base);
    assert.equal(href.pathname, `/projects/${feedbackSpec.projectId}/feedback`);
    const feedbackContext = { projectId: feedbackSpec.projectId, postId: href.searchParams.get("post") };
    assert.ok(feedbackContext.postId, "The actual feedback tab must publish its selected post before using the unfiltered scope");
    result.feedbackPublishedScope = { postParameterPresent: true, ordinaryFactoryFilters: "empty", consumerListFilters: "empty",
      filteredUnresolvedQueryNoLongerListed: true };
    const unresolved = [...feedbackProofs.values()].find((proof) => proof.posts === 96);
    const ordinary = [...feedbackProofs.values()].find((proof) => proof.posts === 120);
    assert.ok(unresolved && ordinary, "Both ordinary authorized list scopes must have actual response proofs");
    const feedbackFor = (capture) => {
      const query = wireValues.get(capture)?.clientState.queries.find((query) => query.queryKey[0] === "feedback" && query.queryKey.length === 2);
      const proof = publishedFeedbackProof(query, ordinary.ids, unresolved.ids, feedbackContext);
      capture.publishedFeedback = proof;
      return proof.accepted;
    };
    const complete = result.compactSnapshots.findLast((snapshot) => snapshot.operation === "seal");
    assert.ok(complete && complete.completeProjects.every((project) => project.completeIdsMatch) && feedbackFor(complete),
      "The latest actual seal must retain both complete projects and the published complete feedback scope including every unresolved row");
    assert.equal(complete.productionFits, true);
    phase = "refresh-reopen";
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-app-tab-id][aria-selected="true"]', { timeout: 30000 });
    await page.waitForTimeout(12000);
    await pauseWork; await Promise.allSettled(networkWork);
    const reopened = result.compactSnapshots.findLast((snapshot) => snapshot.operation === "open");
    assert.ok(reopened && reopened.completeProjects.every((project) => project.completeIdsMatch) && feedbackFor(reopened),
      "Refresh must reopen the accepted complete working set through the ordinary server route");
    assert.equal(reopened.productionFits, true);
    assert.ok(result.restoreBoundaries.some((boundary) => boundary.phase === "refresh-reopen" &&
      boundary.eligible.some((query) => query.prefix === "issues" && query.scope === "synthetic-project-1" && query.rows === 670) &&
      boundary.eligible.some((query) => query.prefix === "issues" && query.scope === "synthetic-project-2" && query.rows === 100) &&
      boundary.eligible.some((query) => query.prefix === "feedback" && query.scope === "synthetic-project-1" && query.collections.posts === 120)), "The ordinary before-mount predicate must invalidate the restored complete working set");
    result.refreshReopenedCompleteWorkingSet = true;
    result.refreshedEnvelope = await page.evaluate(() => {
      const raw = localStorage.getItem("minddy.query-cache");
      if (!raw) return { present: false, encodedBytes: 0 };
      const saved = JSON.parse(raw);
      return { present: true, formatMatches: saved.format === "minddy-local-v1", encodedBytes: new TextEncoder().encode(raw).length };
    });
  }
  assert.equal(result.probeErrors.length, 0, "Every capture must retain exact source and metadata scope");
  result.status = "complete";
} catch (error) {
  result.status = "failed";
  result.failure = { name: error.name, message: error.message.slice(0, 300) };
} finally {
  if (cdp) {
    await cdp.send("Debugger.resume").catch(() => {});
    await pauseWork.catch(() => {});
    await cdp.send("Debugger.disable").catch(() => {});
  }
  if (browser) await browser.close().catch(() => {});
  if (session && originalTabs) {
    try {
      let tabs = await assertStableTabs(session.api, session.fixture, specs);
      for (const original of originalTabs) {
        const current = tabs.find((tab) => tab.id === original.id);
        if (current.href !== original.href) await session.api(`/api/me/app-tabs/${original.id}`, "PATCH", { revision: current.revision, patch: { href: original.href } });
      }
      tabs = await assertStableTabs(session.api, session.fixture, specs);
      assert.equal(fingerprint(tabs.map(tabFields)), fingerprint(originalTabs.map(tabFields)));
      const board = await session.api("/api/me/board");
      assert.equal(fingerprint([...board.issues].sort((a, b) => a.id.localeCompare(b.id))), issuesBefore);
      for (const original of originals ?? []) assert.equal(fingerprint(await session.api(original.endpoint)), original.fingerprint);
      assert.equal(fingerprint(await session.api(`/api/projects/${JSON.parse(await readFile(stableManifestPath, "utf8")).forge.project}/git-link`)), linkBefore);
      result.cleanup.push({ stableTabs: 10, tabMetadataAndDestinationsRestored: true, issueContentUnchanged: true,
        pageContentAndVersionsUnchanged: true, githubConnectionPreserved: true });
    } catch (error) { result.cleanup.push({ failed: true, name: error.name, message: error.message.slice(0, 300) }); result.status = "failed"; }
  }
  if (session) await session.close();
  if (userData) await rm(userData, { recursive: true, force: true });
  await Promise.allSettled(networkWork);
  result.finishedAt = new Date().toISOString();
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ output, status: result.status, captures: result.observations.length,
    productionRejected: result.observations.filter((value) => !value.productionFits).length, cleanup: result.cleanup,
    ...(result.failure ? { failure: result.failure } : {}) }));
}
if (result.status !== "complete") process.exitCode = 1;
