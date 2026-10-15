// Write paths of the global issue cache on the All board (MIN-683): undo and redo of a field,
// a relation added and removed, a card moved to trash, a remote edit and a remote creation,
// plus two read-only paths on the fixture (All after a project read, resume after 16 s away).
// The protected fixture is never written. Write scenarios act on a disposable project created
// for the run and removed completely afterwards (soft delete, then trash purge, which cascades
// its issues, relations and events). Its id is journaled before creation so `--cleanup` can
// finish an interrupted run. Each write repeat adds six issues to the probe; the approved run
// uses one repeat. Tab hrefs moved by the side panel are restored like the journey.
// Per scenario: requests from the gesture until the network is quiet (count, wire bytes,
// /api/me/board reads), realtime joins and leaves, long tasks, and the time until the board
// cache shows the change when one is expected.
// Usage: MINDDY_PERF_BASE_URL=https://localhost:3443 node scripts/performance/measure-board-writes.mjs <label> [repeats]
//        add --read-only to run only the two fixture paths, without any probe project;
//        MINDDY_PERF_BASE_URL=https://localhost:3443 node scripts/performance/measure-board-writes.mjs --cleanup
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, request } from "playwright";
import { openFixture, stableTabs, assertStableTabs } from "./stable-restored-tabs.mjs";
import { boardReady, revealBoardIssue } from "./board-readiness.mjs";
import { loadForgeWorkload, loadConnectedBoardWorkload } from "./measure-forge-navigation.mjs";
import { secondaryManifestPath } from "./enrich-secondary-workload.mjs";

const output = path.resolve("output/playwright/performance");
const journalPath = path.join(output, "min683-board-writes-journal.json");
const PROBE_NAME = "MIN-683 write probe";
const AWAY_MS = 16_500;
const cleanupOnly = process.argv.includes("--cleanup");
const readOnly = process.argv.includes("--read-only");
const [label = "min683-board-writes", repeatArg = "1"] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const repeats = Number(repeatArg);

const session = await openFixture();
const { base, cookies, api, fixture } = session;
// Raw requests for statuses the asserting helper refuses (404 after removal, 409 on a taken key).
const raw = await request.newContext({ baseURL: base, ignoreHTTPSErrors: base.startsWith("https:"),
  extraHTTPHeaders: { Cookie: cookies.map(({ name, value }) => `${name}=${value}`).join("; ") } });

async function removeProbe(projectId) {
  const removed = await raw.fetch(`/api/projects/${projectId}`, { method: "DELETE" });
  assert.ok([200, 204, 404].includes(removed.status()), `DELETE probe project: ${removed.status()}`);
  const purged = await raw.fetch(`/api/me/trash/project/${projectId}`, { method: "DELETE" });
  assert.ok([200, 204, 404].includes(purged.status()), `purge probe project: ${purged.status()}`);
  assert.equal((await raw.fetch(`/api/projects/${projectId}`)).status(), 404, "The probe project must be gone");
  const { items } = await api("/api/me/trash");
  assert.ok(!items.some((item) => item.id === projectId || item.project_id === projectId), "Leave nothing of the probe in trash");
  const board = await api("/api/me/board");
  assert.ok(!board.issues.some((issue) => issue.project_id === projectId), "Leave no probe issue on the board");
  await rm(journalPath, { force: true });
}

if (cleanupOnly) {
  const journal = JSON.parse(await readFile(journalPath, "utf8"));
  assert.equal(journal.userId, fixture.userId);
  await removeProbe(journal.projectId);
  console.log(JSON.stringify({ cleaned: journal.projectId }));
  await raw.dispose(); await session.close();
  process.exit(0);
}

assert.ok(!existsSync(journalPath), "A previous probe project is journaled: run with --cleanup first");
const forge = await loadForgeWorkload(api);
const specs = stableTabs(fixture, forge);
const original = await assertStableTabs(api, fixture, specs);
// Validated before the probe exists: the fixture source alone, exactly as the startup collectors see it.
const board = await loadConnectedBoardWorkload(api, fixture, JSON.parse(await readFile(secondaryManifestPath, "utf8")));
const all = specs.find((spec) => spec.kind === "all"), project = specs.find((spec) => spec.kind === "board");
assert.ok(all && project);

const projectId = readOnly ? null : randomUUID();
if (projectId) await writeFile(journalPath, JSON.stringify({ projectId, userId: fixture.userId, label, createdAt: new Date().toISOString() }, null, 2));
const letters = () => Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");

const results = { label, base, repeats, readOnly, projectId, scenarios: [] };
let browser;
try {
  let created = readOnly;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    // Smart Assign and auto-assign stay off; issues below also opt out of smart fill: no AI call.
    const response = await raw.fetch("/api/projects", { method: "POST", data: { id: projectId, name: PROBE_NAME, key: `Z${letters()}`,
      smart_assign_enabled: false, auto_assign_enabled: false } });
    if (response.status() === 409) continue;
    assert.equal(response.status(), 201, `create probe project: ${response.status()} ${await response.text()}`);
    created = true;
  }
  assert.ok(created, "Could not reserve a probe project key");
  async function createIssue(title, extra = {}) {
    const response = await raw.fetch(`/api/projects/${projectId}/issues`, { method: "POST",
      data: { title, status: "todo", priority: "low", smart_fill: false, ...extra } });
    assert.equal(response.status(), 201, `create probe issue: ${response.status()} ${await response.text()}`);
    const issue = await response.json();
    assert.equal(issue.project_id, projectId);
    return issue;
  }
  // Per repeat: one field target, a relation pair, one trash target and one remote-edit target.
  const probe = [];
  for (let index = 0; index < (readOnly ? 0 : repeats); index++) {
    probe.push({ field: await createIssue(`Probe field ${index}`), source: await createIssue(`Probe source ${index}`),
      target: await createIssue(`Probe target ${index}`), trash: await createIssue(`Probe trash ${index}`),
      remote: await createIssue(`Probe remote ${index}`) });
  }
  const probeIds = probe.flatMap((entry) => Object.values(entry).map((issue) => issue.id));
  const ready = { source: boardReady.toString(), cards: board.cards + probeIds.length, ids: [...board.cardIds, ...probeIds] };

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: base.startsWith("https:") });
  await context.addInitScript(() => {
    localStorage.setItem("cookie_consent", "declined");
    window.__longTasks = [];
    try {
      new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__longTasks.push([e.startTime, e.duration]); })
        .observe({ type: "longtask", buffered: true });
    } catch {}
    // Toasts must not intercept the measured clicks; they still render.
    addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "[data-sonner-toaster]{pointer-events:none!important}";
      document.head.append(style);
    });
  });
  await context.addCookies([...cookies.map(({ name, value }) => ({ name, value, url: base, sameSite: "Lax" })),
    { name: "NEXT_LOCALE", value: "en", url: base }]);
  const page = await context.newPage();

  // Network and realtime recorder. Requests outside /api/ that reach Supabase are kept too:
  // realtime authorization and topic resolution do not go through the Next server.
  const inflight = new Map(), done = [], frames = [];
  const tracked = (url) => url.pathname.startsWith("/api/") || url.hostname.endsWith(".supabase.co");
  const normalize = (url) => (url.hostname.endsWith(".supabase.co") ? "sb:" : "") +
    url.pathname.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "{id}");
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (tracked(url)) inflight.set(req, { at: Date.now(), method: req.method(), path: normalize(url) });
  });
  const finish = (req, failed) => {
    const entry = inflight.get(req);
    if (!entry) return;
    inflight.delete(req);
    Object.assign(entry, { end: Date.now(), failed });
    done.push(entry);
    req.sizes().then((sizes) => { entry.bytes = sizes.responseBodySize; }).catch(() => { entry.bytes = 0; });
  };
  page.on("requestfinished", (req) => finish(req, false));
  page.on("requestfailed", (req) => finish(req, true));
  // Realtime timeline: joins, leaves, replies, errors and socket lifecycle (heartbeats excluded).
  const timeline = [];
  page.on("websocket", (socket) => {
    timeline.push({ at: Date.now(), event: "socket-open" });
    socket.on("close", () => timeline.push({ at: Date.now(), event: "socket-close" }));
    const record = (direction) => ({ payload }) => {
      if (typeof payload !== "string") return;
      try {
        const message = JSON.parse(payload);
        const event = Array.isArray(message) ? message[3] : message.event;
        const topic = Array.isArray(message) ? message[2] : message.topic;
        if (topic === "phoenix") return;
        const status = (Array.isArray(message) ? message[4] : message.payload)?.status;
        if (direction === "sent" && (event === "phx_join" || event === "phx_leave")) frames.push({ at: Date.now(), event, topic });
        if (["phx_join", "phx_leave", "phx_reply", "phx_error", "phx_close", "system"].includes(event))
          timeline.push({ at: Date.now(), direction, event, topic: topic.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "{id}"), status });
      } catch {}
    };
    socket.on("framesent", record("sent"));
    socket.on("framereceived", record("received"));
  });

  const queryClient = () => {
    let fiber = document.querySelector("[data-app-tab-id]");
    fiber = fiber?.[Object.keys(fiber).find((key) => key.startsWith("__reactFiber$"))];
    for (let depth = 0; fiber && depth < 200; depth++, fiber = fiber.return) {
      if (typeof fiber.memoizedProps?.client?.getQueryCache === "function") return fiber.memoizedProps.client;
    }
    return null;
  };
  /** Time until the aggregate board cache satisfies `check`, polled at 16 ms. */
  async function applied(from, check, arg) {
    await page.waitForFunction(({ finder, check, arg }) => {
      const client = new Function(`return (${finder})`)()();
      const data = client?.getQueryData(["me", "board"]);
      return !!data && new Function("data", "arg", `return (${check})(data, arg)`)(data, arg);
    }, { finder: queryClient.toString(), check: check.toString(), arg }, { timeout: 20_000, polling: 16 });
    return Date.now() - from;
  }

  /** Keep the board rows' object identities to count the rows a later write replaced. */
  const keepBoardRows = () => page.evaluate((finder) => {
    const client = new Function(`return (${finder})`)()();
    window.__boardRows = new Map(client.getQueryData(["me", "board"]).issues.map((issue) => [issue.id, issue]));
  }, queryClient.toString());
  const boardState = () => page.evaluate((finder) => {
    const client = new Function(`return (${finder})`)()();
    const query = client.getQueryCache().find({ queryKey: ["me", "board"], exact: true });
    const issues = query.state.data.issues;
    return { changedRows: issues.filter((issue) => window.__boardRows.get(issue.id) !== issue).length,
      boardInvalidated: query.state.isInvalidated, boardUpdatedAt: query.state.dataUpdatedAt };
  }, queryClient.toString());
  /** Time until the board holds data read after `from` and no board read is in flight. */
  const boardFresh = async (from) => {
    await page.waitForFunction(({ finder, from }) => {
      const client = new Function(`return (${finder})`)()();
      const query = client?.getQueryCache().find({ queryKey: ["me", "board"], exact: true });
      return !!query && query.state.dataUpdatedAt >= from && query.state.fetchStatus === "idle";
    }, { finder: queryClient.toString(), from }, { timeout: 25_000, polling: 16 });
    return Date.now() - from;
  };

  /** Requests, frames and long tasks from `from` until no tracked request ran for 2 s
      (or over a fixed window when background warming never pauses). */
  async function settle(name, from, pageFrom, extra = {}, fixedMs) {
    const deadline = from + 25_000;
    let quietAt;
    if (fixedMs) {
      await page.waitForTimeout(Math.max(0, from + fixedMs - Date.now()));
      quietAt = from + fixedMs;
    }
    for (; !quietAt;) {
      const now = Date.now();
      const started = done.filter((entry) => entry.at >= from);
      const last = Math.max(from, ...started.map((entry) => entry.end));
      const busy = [...inflight.values()].some((entry) => entry.at >= from - 5_000);
      if (!busy && now - last >= 2_000 && now - from >= 2_500) { quietAt = last; break; }
      if (now >= deadline) { quietAt = now; extra.capped = true; break; }
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(100);
    const slice = done.filter((entry) => entry.at >= from && entry.at <= quietAt);
    const count = (predicate) => slice.filter(predicate).length;
    const longTasks = await page.evaluate((start) => window.__longTasks.filter(([at]) => at >= start), pageFrom);
    const scenario = {
      name, quietMs: quietAt - from, ...extra,
      boardReads: count((entry) => entry.method === "GET" && entry.path === "/api/me/board"),
      boardReadsCancelled: count((entry) => entry.method === "GET" && entry.path === "/api/me/board" && entry.failed),
      topicResolutions: count((entry) => entry.path === "sb:/rest/v1/rpc/resolve_realtime_topic"),
      boardBytes: slice.filter((entry) => entry.method === "GET" && entry.path === "/api/me/board").reduce((sum, entry) => sum + (entry.bytes ?? 0), 0),
      snapshotReads: count((entry) => entry.method === "GET" && entry.path === "/api/me/issues"),
      issueReads: count((entry) => entry.method === "GET" && entry.path === "/api/issues/{id}"),
      projectListReads: count((entry) => entry.method === "GET" && entry.path === "/api/projects"),
      requests: slice.length, wireBytes: slice.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0),
      joins: frames.filter((frame) => frame.at >= from && frame.at <= quietAt && frame.event === "phx_join").length,
      leaves: frames.filter((frame) => frame.at >= from && frame.at <= quietAt && frame.event === "phx_leave").length,
      longTasks: longTasks.length, longTaskMs: Math.round(longTasks.reduce((sum, [, duration]) => sum + duration, 0)),
      paths: Object.entries(slice.reduce((counts, entry) => ({ ...counts, [`${entry.method} ${entry.path}`]: (counts[`${entry.method} ${entry.path}`] ?? 0) + 1 }), {})),
    };
    console.log(JSON.stringify({ name, quietMs: scenario.quietMs, appliedMs: scenario.appliedMs, activationMs: scenario.activationMs,
      boardFreshMs: scenario.boardFreshMs, changedRows: scenario.changedRows, boardReads: scenario.boardReads,
      boardReadsCancelled: scenario.boardReadsCancelled, topicResolutions: scenario.topicResolutions,
      issueReads: scenario.issueReads, snapshotReads: scenario.snapshotReads, projectListReads: scenario.projectListReads,
      joins: scenario.joins, leaves: scenario.leaves, longTaskMs: scenario.longTaskMs, capped: scenario.capped }));
    results.scenarios.push(scenario);
    return scenario;
  }
  const mark = async () => [Date.now(), await page.evaluate(() => performance.now())];
  const root = () => page.locator('[data-app-view-active="true"]');
  const card = (issueId) => root().locator(`[data-issue-id="${issueId}"]`);
  const blurActive = () => page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });

  async function allReady() {
    await page.waitForFunction(({ source, cards, ids }) => {
      if (location.pathname !== "/all") return false;
      window.__allReady ??= new Function(`return (${source})`)();
      return window.__allReady(cards, undefined, ids);
    }, ready, { timeout: 30_000, polling: 16 });
  }
  async function clickTab(spec) {
    const tab = page.locator(`[data-app-tab-id="${spec.id}"]`);
    const box = await tab.boundingBox();
    assert.ok(box, `missing tab ${spec.kind}`);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }

  await page.goto(`${base}/home`, { waitUntil: "commit" });
  await allReady();
  await page.waitForTimeout(3_000);

  // Unmeasured first round: the project's first activation warms Pages and pull requests for ~20 s.
  await clickTab(project);
  await page.waitForFunction((projectId) => location.pathname === `/projects/${projectId}`, project.projectId, { timeout: 20_000 });
  await page.waitForTimeout(2_500);
  await clickTab(all);
  await allReady();
  await page.waitForTimeout(20_000);

  for (let index = 0; index < repeats; index++) {
    // Read-only: All after the project board read its issues.
    await keepBoardRows();
    await clickTab(project);
    await page.waitForFunction((projectId) => location.pathname === `/projects/${projectId}` &&
      ["fresh", "refreshing"].includes(document.querySelector('[data-app-view-active="true"]')?.dataset.boardReadState), project.projectId,
    { timeout: 20_000, polling: 16 });
    await page.waitForTimeout(2_500);
    let [from, pageFrom] = await mark();
    await clickTab(all);
    await allReady();
    const activationMs = Date.now() - from;
    await page.waitForTimeout(Math.max(0, from + 4_000 - Date.now()));
    await settle("all-after-project", from, pageFrom, { activationMs, ...await boardState() }, 4_000);

    // Read-only: resume after 16.5 s away (blur, then focus: the desktop window path).
    await page.evaluate(() => dispatchEvent(new Event("blur")));
    await page.waitForTimeout(AWAY_MS);
    [from, pageFrom] = await mark();
    await page.evaluate(() => dispatchEvent(new Event("focus")));
    const resumed = await settle("resume", from, pageFrom, { boardFreshMs: await boardFresh(from) });
    resumed.timeline = timeline.filter((entry) => entry.at >= from).map(({ at, ...entry }) => ({ ms: at - from, ...entry }));
  }

  for (const [index, entry] of probe.entries()) {
    // Field change on a probe card, then undo and redo through the keyboard.
    await revealBoardIssue(page, entry.field.id, "todo");
    let [from, pageFrom] = await mark();
    await card(entry.field.id).getByRole("button", { name: "Change priority", exact: true }).click();
    await page.locator('[data-floating-surface]').filter({ visible: true }).first().waitFor();
    await page.locator('[data-floating-surface] [cmdk-item][data-value="high"]').filter({ visible: true }).first().click();
    await settle("field-edit", from, pageFrom);
    await blurActive();
    [from, pageFrom] = await mark();
    await page.keyboard.press("ControlOrMeta+z");
    const undoApplied = await applied(from, (data, arg) => data.issues.find((issue) => issue.id === arg)?.priority === "low", entry.field.id);
    await settle("undo", from, pageFrom, { appliedMs: undoApplied });
    [from, pageFrom] = await mark();
    await page.keyboard.press("ControlOrMeta+Shift+z");
    const redoApplied = await applied(from, (data, arg) => data.issues.find((issue) => issue.id === arg)?.priority === "high", entry.field.id);
    await settle("redo", from, pageFrom, { appliedMs: redoApplied });

    // Relation added and removed from the side panel.
    await revealBoardIssue(page, entry.source.id, "todo");
    await card(entry.source.id).click();
    const panel = page.locator('[data-slot="side-panel-content"]').filter({ visible: true }).first();
    await panel.waitFor();
    await panel.getByRole("button", { name: "Link an issue or objective", exact: true }).click();
    await page.locator('[cmdk-item][data-value="related"]').filter({ visible: true }).first().click();
    const targetItem = page.locator(`[cmdk-item][data-value="${entry.target.id}"]`).filter({ visible: true }).first();
    await targetItem.waitFor();
    [from, pageFrom] = await mark();
    await targetItem.click();
    const row = panel.locator("li, [role='listitem'], div").filter({ hasText: entry.target.title })
      .filter({ has: page.getByRole("button", { name: "Remove", exact: true }) }).last();
    await row.waitFor();
    await settle("relation-add", from, pageFrom, { appliedMs: await applied(from, (data, arg) =>
      (data.relations ?? []).some((relation) => [relation.source_id, relation.target_id].includes(arg.source) &&
        [relation.source_id, relation.target_id].includes(arg.target)), { source: entry.source.id, target: entry.target.id }) });
    await row.hover();
    [from, pageFrom] = await mark();
    await row.getByRole("button", { name: "Remove", exact: true }).click();
    await settle("relation-remove", from, pageFrom, { appliedMs: await applied(from, (data, arg) =>
      !(data.relations ?? []).some((relation) => [relation.source_id, relation.target_id].includes(arg.source) &&
        [relation.source_id, relation.target_id].includes(arg.target)), { source: entry.source.id, target: entry.target.id }) });
    for (let attempt = 0; attempt < 4 && await panel.isVisible(); attempt++) await page.keyboard.press("Escape");
    await panel.waitFor({ state: "hidden" });

    // Card moved to trash from its context menu.
    await revealBoardIssue(page, entry.trash.id, "todo");
    await card(entry.trash.id).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Move to trash", exact: true }).click();
    const confirm = page.getByRole("alertdialog").getByRole("button", { name: "Move to trash", exact: true });
    await confirm.waitFor();
    [from, pageFrom] = await mark();
    await confirm.click();
    await settle("trash", from, pageFrom, { appliedMs: await applied(from, (data, arg) => !data.issues.some((issue) => issue.id === arg), entry.trash.id) });

    // Remote edit: another client (this collector) renames a probe issue.
    const title = `Probe remote ${index} edited`;
    [from, pageFrom] = await mark();
    await api(`/api/issues/${entry.remote.id}`, "PATCH", { title });
    await settle("remote-edit", from, pageFrom, { appliedMs: await applied(from, (data, arg) =>
      data.issues.find((issue) => issue.id === arg.id)?.title === arg.title, { id: entry.remote.id, title }) });

    // Remote creation: also bumps the probe project's issue counter.
    [from, pageFrom] = await mark();
    const issue = await createIssue(`Probe created ${index}`);
    await settle("remote-create", from, pageFrom, { appliedMs: await applied(from, (data, arg) => data.issues.some((value) => value.id === arg), issue.id) });
  }
  await context.close();
} finally {
  await browser?.close();
  try {
    for (const tab of original) {
      const current = (await api("/api/me/app-tabs")).find((value) => value.id === tab.id);
      if (current && current.href !== tab.href) await api(`/api/me/app-tabs/${tab.id}`, "PATCH", { revision: current.revision, patch: { href: tab.href } });
    }
    await assertStableTabs(api, fixture, specs);
  } finally {
    if (projectId) await removeProbe(projectId);
    await raw.dispose();
    await session.close();
  }
}
await writeFile(path.join(output, `${label}.json`), JSON.stringify(results, null, 2));
