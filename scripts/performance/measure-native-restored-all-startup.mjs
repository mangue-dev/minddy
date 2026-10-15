import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron } from "playwright";
import { openFixture, stableTabs, assertStableTabs } from "./stable-restored-tabs.mjs";
import { loadForgeWorkload, loadConnectedBoardWorkload, forgeLinkFingerprint } from "./measure-forge-navigation.mjs";
import { completeHomeReady, completeHomeDiagnostics } from "./complete-home-readiness.mjs";
import { boardReady } from "./board-readiness.mjs";
import { secondaryManifestPath } from "./enrich-secondary-workload.mjs";

function completeRestoredInterface({ boardSource, cards, cardIds }) {
  // Restored destination only: the fixture's active tab is All; a transient Home does not count.
  if (location.pathname !== "/all") return false;
  window.__nativeCompleteBoard ??= new Function(`return (${boardSource})`)();
  return window.__nativeCompleteBoard(cards, undefined, cardIds);
}

assert.ok(process.argv.includes("--run-diagnostic"));
assert.ok(process.env.MINDDY_PERF_BUILD_ROOT);
const root = process.cwd(), output = path.join(root, "output/playwright/performance");
await mkdir(output, { recursive: true });
const label = process.env.MINDDY_PERF_LABEL ?? "min683-native-restored-all-startup";
assert.match(label, /^[a-zA-Z0-9_-]+$/);
const hash = value => createHash("sha256").update(value).digest("hex");
const fingerprint = value => hash(JSON.stringify(value));
const result = { label, protocol: "min683-excluded-native-complete-startup-v1-persistent-fixture-auth",
  excludedFromComparison: "Natural executable startup diagnosis; authenticated renderer clocks remain separate",
  timestamp: new Date().toISOString(), runtime: "unpackaged Electron", status: "running", measurements: [], errors: [], cleanup: [],
  limitations: ["Three launches of the actual unpackaged desktop main/preload with one isolated persistent profile; no packaged signing/updater startup claim.",
    "Fixture sign-in, cookie persistence and one primer launch precede timing. No authentication injection occurs within timed process launches.",
    "Wall clock begins immediately before Electron process launch and includes process/window/preload, network and full Home readiness plus two frames.",
    "Renderer performance.now is reported separately; two frames are a paint opportunity, not hardware presentation."] };
let session, app, profile, original, specs, failure;
try {
  session = await openFixture();
  const { api, fixture, base, cookies } = session;
  const forge = await loadForgeWorkload(api);
  specs = stableTabs(fixture, forge); original = await assertStableTabs(api, fixture, specs);
  const secondary = JSON.parse(await readFile(secondaryManifestPath, "utf8"));
  const board = await loadConnectedBoardWorkload(api, fixture, secondary);
  const readySpec = { boardSource: boardReady.toString(), homeSource: completeHomeReady.toString(), cards: board.cards, cardIds: board.cardIds };
  result.workload = { sourceIssues: board.sourceIssues, cards: board.cards, contentFingerprint: board.contentFingerprint, tabs: specs.length };
  const capture = async () => ({ tabs: (await assertStableTabs(api, fixture, specs)).map(({ id, href, user_id, custom_name, position, pinned }) =>
    ({ id, href, user_id, custom_name, position, pinned })),
    versions: await Promise.all(specs.filter(spec => spec.kind === "page").map(async spec => ({ id: spec.pageId,
      fingerprint: fingerprint(await api(`/api/projects/${spec.projectId}/pages/${spec.pageId}`)) }))),
    github: forgeLinkFingerprint((await api(`/api/projects/${forge.project}/git-link`)).link),
    globalBoardFingerprint: fingerprint(await api("/api/me/board")) });
  const before = await capture();
  const productRoot = process.env.MINDDY_PERF_BUILD_ROOT;
  const product = JSON.parse(await readFile(path.join(productRoot, ".next/min683-product.json"), "utf8"));
  assert.equal(product.build, (await readFile(path.join(productRoot, ".next/BUILD_ID"), "utf8")).trim());
  Object.assign(result, product, { runnerSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    runnerSourceHash: fingerprint(await Promise.all(["measure-native-restored-all-startup.mjs", "complete-home-readiness.mjs", "stable-restored-tabs.mjs"]
      .map(file => readFile(path.join(root, "scripts/performance", file), "utf8")))),
    desktopSources: Object.fromEntries(await Promise.all(["desktop/package.json", "desktop/dist/main.js", "desktop/dist/preload.js"]
      .map(async file => [file, hash(await readFile(path.join(root, file)))]))), fixtureAccount: fixture.email });
  profile = await mkdtemp(path.join(tmpdir(), "minddy-min683-startup-"));
  const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  // Open windows without taking focus (unpackaged test bench only, see lib/desktop/test-background.ts).
  Object.assign(env, { MINDDY_DESKTOP_ORIGIN: base, MINDDY_DESKTOP_TEST_USER_DATA: profile, MINDDY_DESKTOP_TEST_BACKGROUND: "1" });
  // The optional local HTTP/2 proxy (h2-proxy.mjs) uses a self-signed localhost certificate.
  const tlsArgs = base.startsWith("https:") ? ["--ignore-certificate-errors"] : [];
  result.transport = base.startsWith("https:") ? "local h2-proxy (HTTP/2, TLS, brotli)" : "next start (HTTP/1.1)";
  const launch = () => _electron.launch({ args: [...tlsArgs, `--user-data-dir=${profile}`, path.join(root, "desktop")], cwd: path.join(root, "desktop"), env, timeout: 30000 });
  // Persist only fixture credentials in this private profile before timing.
  app = await launch();
  await app.context().addInitScript(() => localStorage.setItem("cookie_consent", "declined"));
  result.analyticsPreferenceConfiguredOnlyInExcludedSetup = true;
  await app.context().addCookies([...cookies.map(({ name, value }) => ({ name, value, url: base, sameSite: "Lax", expires: Date.now() / 1000 + 3600 })),
    { name: "NEXT_LOCALE", value: "en", url: base, expires: Date.now() / 1000 + 3600 }]);
  const primer = await app.firstWindow();
  await primer.goto(`${base}/home`, { waitUntil: "commit" });
  await primer.waitForFunction(completeRestoredInterface, readySpec, { timeout: 15000 });
  // MINDDY_PERF_SEALED_SNAPSHOT=1: let the five-second save/idle schedule seal the query cache,
  // so timed launches take the relaunch path real users take (sealed snapshot open before reads).
  if (process.env.MINDDY_PERF_SEALED_SNAPSHOT === "1") {
    await primer.waitForTimeout(7000);
    result.sealedSnapshotAfterPrimer = await primer.evaluate(() => localStorage.getItem("minddy.query-cache") !== null);
  }
  await app.evaluate(async ({ session }) => { await session.defaultSession.cookies.flushStore(); await session.defaultSession.flushStorageData(); });
  await app.close(); app = undefined;
  for (let index = 0; index < 5; index++) {
    const start = performance.now();
    app = await launch(); const processReadyMs = performance.now() - start;
    const runtime = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, userData: app.getPath("userData"),
      sessionData: app.getPath("sessionData"), electron: process.versions.electron, chromium: process.versions.chrome }));
    assert.equal(runtime.packaged, false); assert.equal(runtime.userData, profile); assert.equal(runtime.sessionData, profile);
    const page = await app.firstWindow(); const firstWindowObservedMs = performance.now() - start;
    const errors = []; page.on("pageerror", error => errors.push(error.name));
    await page.waitForFunction(completeRestoredInterface, readySpec, { timeout: 15000 });
    const rendererCompleteMs = await page.evaluate(() => performance.now());
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const processToCompleteInterfaceMs = performance.now() - start;
    result.measurements.push({ name: "native-executable-complete-restored-interface", index, processReadyMs, firstWindowObservedMs,
      rendererCompleteMs, processToCompleteInterfaceMs, driverMs: processToCompleteInterfaceMs, paintMs: processToCompleteInterfaceMs,
      cookieInjectionDuringTiming: false, completeRestoredDestination: await page.evaluate(() => location.pathname), versions: runtime, errors });
    assert.equal(errors.length, 0);
    console.log(JSON.stringify({ index, processToCompleteInterfaceMs, rendererCompleteMs }));
    await app.close(); app = undefined;
  }
  if (!process.argv.includes("--skip-recovery")) {
  // A saved creation draft is a different guarantee from unacknowledged typing.
  app = await launch();
  let recoveryPage = await app.firstWindow();
  const creationWrites = [];
  const recordCreation = request => {
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "POST" && /\/api\/(projects\/[^/]+\/issues|issues)$/.test(pathname)) creationWrites.push(pathname);
  };
  recoveryPage.on("request", recordCreation);
  const projectSpec = specs.find(spec => spec.kind === "board");
  await recoveryPage.goto(`${base}${projectSpec.href}`, { waitUntil: "commit" });
  await recoveryPage.locator('[data-app-tab-id]').first().waitFor();
  const draftTitle = "MIN-683 acknowledged forced-quit recovery";
  await recoveryPage.keyboard.press("c");
  const title = recoveryPage.getByPlaceholder("Issue title", { exact: true });
  await title.waitFor(); await title.fill(draftTitle);
  await recoveryPage.keyboard.press("Escape");
  const confirmation = recoveryPage.getByRole("alertdialog");
  await confirmation.getByRole("button", { name: "Save", exact: true }).click();
  await title.waitFor({ state: "hidden" });
  const stored = await recoveryPage.evaluate(() => {
    const raw = localStorage.getItem("minddy:drafts:issue");
    const envelope = raw ? JSON.parse(raw) : null;
    return { format: envelope?.format, hasCiphertext: typeof envelope?.ciphertext === "string", owner: envelope?.owner };
  });
  assert.equal(stored.format, "minddy-local-v1"); assert.equal(stored.owner, fixture.userId); assert.ok(stored.hasCiphertext);
  await app.evaluate(async ({ session }) => { await session.defaultSession.cookies.flushStore(); await session.defaultSession.flushStorageData(); });
  const child = app.process(), pid = child.pid;
  assert.ok(Number.isInteger(pid) && pid > 0);
  const killed = new Promise(resolve => child.once("exit", (code, signal) => resolve({ code, signal })));
  child.kill("SIGKILL");
  const exit = await killed; assert.equal(exit.signal, "SIGKILL"); app = undefined;
  app = await launch(); recoveryPage = await app.firstWindow();
  recoveryPage.on("request", recordCreation);
  await recoveryPage.waitForFunction(completeRestoredInterface, readySpec, { timeout: 15000 });
  const restartSelection = await recoveryPage.evaluate(() => ({ pathname: location.pathname,
    activeTabId: document.querySelector('[data-app-tab-id][aria-selected="true"]')?.getAttribute('data-app-tab-id') ?? null }));
  await recoveryPage.goto(`${base}${projectSpec.href}`, { waitUntil: "commit" });
  await recoveryPage.locator('[data-app-tab-id]').first().waitFor();
  await recoveryPage.keyboard.press("c");
  await recoveryPage.getByRole("button", { name: draftTitle, exact: true }).click();
  await assert.doesNotReject(() => recoveryPage.getByPlaceholder("Issue title", { exact: true }).waitFor());
  assert.equal(await recoveryPage.getByPlaceholder("Issue title", { exact: true }).inputValue(), draftTitle);
  assert.deepEqual(creationWrites, []);
  result.forcedQuit = { signal: exit.signal, acknowledgedEncryptedDraftRecovered: true,
    serverIssueCreated: false, restartSelection, selectedProjectTabDestinationPreserved: true,
    unacknowledgedTypingDurability: "Not established: creation forms and pending Page edits remain in-memory until a successful save" };
  await recoveryPage.keyboard.press("Escape");
  await recoveryPage.getByRole("alertdialog").getByRole("button", { name: "Discard", exact: true }).click();
  await app.close(); app = undefined;
  } else result.recoverySkippedBeforeMatchedLatencyComparison = true;
  for (const tab of original) {
    const current = (await api("/api/me/app-tabs")).find(value => value.id === tab.id);
    assert.ok(current);
    if (current.href !== tab.href) await api(`/api/me/app-tabs/${tab.id}`, "PATCH", { revision: current.revision, patch: { href: tab.href } });
  }
  assert.deepEqual(await capture(), before);
  result.cleanup.push({ tabDestinationsMetadataPageVersionsAndGitPreserved: true });
  result.status = "complete-excluded-diagnostic";
} catch (error) {
  failure = error; result.status = "failed"; result.errors.push({ name: error.name, message: String(error.message).split("\n")[0] });
  if (app) {
    const page = app.windows()[0];
    if (page) {
      result.rendererFailureMetadata = await page.evaluate(completeHomeDiagnostics).catch(() => ({ unavailable: true }));
      await page.screenshot({ path: path.join(output, `${label}-failure.png`) }).catch(() => {});
    }
  }
} finally {
  if (app) await app.close().catch(() => {});
  if (session && original) {
    try {
      for (const saved of original) {
        const current = (await session.api("/api/me/app-tabs")).find(value => value.id === saved.id);
        assert.ok(current);
        if (current.href !== saved.href) await session.api(`/api/me/app-tabs/${saved.id}`, "PATCH", { revision: current.revision, patch: { href: saved.href } });
      }
      await assertStableTabs(session.api, session.fixture, specs);
      result.cleanup.push({ originalDestinationsRestored: true });
    } catch (error) {
      failure ??= error; result.status = "failed"; result.cleanup.push({ originalDestinationsRestored: false });
    }
  }
  if (profile) { await rm(profile, { recursive: true, force: true }); result.cleanup.push({ isolatedProfileRemoved: true }); }
  await session?.close();
  result.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, `${label}.json`), JSON.stringify(result, null, 2));
}
if (failure) throw failure;
