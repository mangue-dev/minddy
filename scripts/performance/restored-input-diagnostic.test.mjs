import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { installRestoredInputDiagnostic } from "./restored-input-diagnostic.mjs";

function setup({ foreignOwner = false, wrapActivate = false, operationPromise } = {}) {
  const dom = new JSDOM('<div role="tablist"><button data-app-tab-id="a" aria-selected="true"><span>PRIVATE LABEL</span></button><button data-app-tab-id="b">Another private label</button></div><textarea>PRIVATE BODY</textarea>',
    { url: "http://localhost/projects/fixture/pages/known", runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  const tabs = [...window.document.querySelectorAll("button")];
  const listeners = new Set();
  const state = { tabs: ["a", "b"].map((id) => ({ id, user_id: foreignOwner ? "other" : "fixture" })), activeId: "a", busy: false, recovering: false, error: null };
  const returned = operationPromise ?? Promise.resolve("original result");
  const session = { owner: foreignOwner ? "other" : "fixture", guards: new window.Set([() => false]), disposed: false,
    getSnapshot: () => state, registerDeparture: () => {}, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    activate(id) { state.activeId = id; for (const fn of listeners) fn(); return returned; } };
  const original = session.activate;
  tabs[0].__reactFiber$diagnostic = { memoizedProps: {}, return: { memoizedProps: { value: { session } } } };
  window.document.elementFromPoint = () => tabs[0].firstElementChild;
  for (const [index, tab] of tabs.entries()) tab.getBoundingClientRect = () => ({ x: index * 100, y: 0, left: index * 100, right: index * 100 + 100, top: 0, bottom: 40, width: 100, height: 40 });
  window.eval(`(${installRestoredInputDiagnostic.toString()})(${JSON.stringify({ owner: "fixture", tabIds: ["a", "b"], wrapActivate })})`);
  return { dom, window, tabs, session, original, returned, listeners };
}

test("diagnostic distinguishes stale dispatch geometry from its actual hit without publishing text", () => {
  const { dom, window, tabs } = setup();
  try {
    const before = window.__restoredInput.arm({ expectedTabId: "b", kind: "page", name: "focus-return-navigation", x: 50, y: 20,
      driverRect: { x: 0, y: 0, width: 100, height: 40 }, body: "FORBIDDEN EXTRA" });
    assert.equal(before.expectedContainsHit, false);
    assert.equal(before.expectedTab.closestTabId, "b");
    assert.equal(before.hit.closestTabId, "a");
    assert.equal(before.freshExpectedRect.x, 100);
    tabs[0].firstElementChild.dispatchEvent(new window.MouseEvent("click", { bubbles: true, clientX: 50, clientY: 20 }));
    const read = window.__restoredInput.read();
    const event = read.events.find((event) => event.kind === "input-event");
    assert.equal(event.trusted, false, "A test event must never become trusted evidence");
    assert.equal(event.target.closestTabId, "a");
    assert.equal(read.state.session.guardCount, 1);
    assert.ok(!JSON.stringify(read).includes("PRIVATE"));
    assert.ok(!JSON.stringify(read).includes("FORBIDDEN"));
  } finally { window.__restoredInput.dispose(); dom.window.close(); }
});

test("optional activation observation returns the exact original promise and preserves guards", async () => {
  const { dom, window, session, original, returned, listeners } = setup({ wrapActivate: true });
  try {
    window.__restoredInput.arm({ expectedTabId: "b", x: 150, y: 20 });
    const guards = session.guards;
    assert.notEqual(session.activate, original);
    assert.equal(session.activate("b"), returned);
    await returned; await Promise.resolve();
    const read = window.__restoredInput.read();
    assert.equal(read.state.session.activeId, "b");
    assert.equal(session.guards, guards); assert.equal(guards.size, 1);
    assert.ok(read.events.some((event) => event.kind === "session-activate-call"));
    assert.ok(read.events.some((event) => event.kind === "session-transition"));
    assert.ok(read.events.some((event) => event.kind === "session-activate-settled" && event.fulfilled));
    window.__restoredInput.dispose();
    assert.equal(session.activate, original); assert.equal(listeners.size, 0);
  } finally { dom.window.close(); }
});

test("a session with a foreign owner cannot be observed or wrapped", () => {
  const { dom, window, session, original } = setup({ foreignOwner: true, wrapActivate: true });
  try {
    window.__restoredInput.arm({ expectedTabId: "b", x: 150, y: 20 });
    assert.equal(window.__restoredInput.read().state.session.found, false);
    assert.equal(session.activate, original);
  } finally { window.__restoredInput.dispose(); dom.window.close(); }
});

test("capture without document bubble exposes stopped click propagation without running React handlers", () => {
  const { dom, window, tabs } = setup();
  try {
    const onClick = () => { throw new Error("A read-only probe must not execute React props"); };
    tabs[0].__reactProps$diagnostic = { onClick };
    window.__restoredInput.arm({ expectedTabId: "a", x: 50, y: 20 });
    tabs[0].addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); });
    tabs[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    const read = window.__restoredInput.read();
    assert.equal(read.events.filter((entry) => entry.kind === "input-event" && entry.phase === "capture").length, 1);
    assert.equal(read.events.filter((entry) => entry.kind === "input-event" && entry.phase === "bubble").length, 0);
    assert.equal(read.events.find((entry) => entry.kind === "before-dispatch").expectedTab.reactHandlers.onClick, true);
    assert.equal(tabs[0].__reactProps$diagnostic.onClick, onClick);
  } finally { window.__restoredInput.dispose(); dom.window.close(); }
});

test("blocked prerequisites remain a no-input record rather than reading uninitialized sample metadata", async () => {
  const source = await readFile(new URL("./diagnose-restored-input.mjs", import.meta.url), "utf8");
  const begin = source.indexOf("  async function activate(");
  const end = source.indexOf("\n  for (const spec of specs.slice(1))", begin);
  const measurements = [];
  const blocked = { name: "first", error: "Retained original failure" };
  const activate = vm.runInNewContext(`(${source.slice(begin, end)})`, {
    failedPrerequisites: new Map([["tab:initial:default", blocked]]), result: { measurements },
  });
  await activate({ id: "tab", kind: "page", custom_name: "Known fixture" }, "restored-alternation");
  assert.equal(measurements.length, 1); assert.equal(measurements[0].status, "blocked-by-prerequisite");
  assert.equal(measurements[0].prerequisiteFailure, blocked);
});

test("disposed sessions are explicitly detached rather than reported as a current activation observer", () => {
  const { dom, window, session, original, listeners } = setup({ wrapActivate: true });
  try {
    window.__restoredInput.arm({ expectedTabId: "a", x: 50, y: 20 });
    session.disposed = true;
    window.__restoredInput.arm({ expectedTabId: "b", x: 150, y: 20 });
    const read = window.__restoredInput.read();
    assert.equal(read.state.session.found, false);
    assert.ok(read.events.some((event) => event.kind === "session-observation-lost" && event.reason === "disposed"));
    assert.equal(session.activate, original); assert.equal(listeners.size, 0);
  } finally { window.__restoredInput.dispose(); dom.window.close(); }
});

test("delayed activation settlement keeps its original operation identity after the next click is armed", async () => {
  let resolve;
  const operationPromise = new Promise((done) => { resolve = done; });
  const { dom, window, session } = setup({ wrapActivate: true, operationPromise });
  try {
    const first = window.__restoredInput.arm({ expectedTabId: "b", x: 150, y: 20 });
    assert.equal(session.activate("b"), operationPromise);
    window.__restoredInput.arm({ expectedTabId: "a", x: 50, y: 20 });
    resolve(); await operationPromise; await Promise.resolve();
    const settlement = window.__restoredInput.read().events.find((event) => event.kind === "session-activate-settled");
    assert.equal(settlement.activation, first.activation);
    assert.equal(settlement.requestedTabId, "b");
  } finally { window.__restoredInput.dispose(); dom.window.close(); }
});

for (const collector of ["measure-restored-navigation.mjs", "measure-restored-readiness-review.mjs"]) {
test(`${collector}: focus proof requires initial focus, both full-duration clocks, real absence and a visible focused return`, async () => {
  const source = await readFile(new URL(`./${collector}`, import.meta.url), "utf8");
  const begin = source.indexOf("function observedFocusInterval(");
  const end = source.indexOf("\n}", begin) + 2;
  const proof = vm.runInNewContext(`(${source.slice(begin, end)})`);
  const before = { focused: true }, away = { focused: false, start: 100, wallClock: 1000 };
  const endAbsence = { focused: false, at: 16100, wallClock: 17000 }, returned = { focused: true, visibility: "visible" };
  assert.equal(proof(before, away, endAbsence, returned, 16000), true);
  for (const args of [
    [{ focused: false }, away, endAbsence, returned, 16000],
    [before, { ...away, focused: true }, endAbsence, returned, 16000],
    [before, away, { ...endAbsence, focused: true }, returned, 16000],
    [before, away, { ...endAbsence, at: 16099.9 }, returned, 16000],
    [before, away, { ...endAbsence, wallClock: 16999 }, returned, 16000],
    [before, away, { ...endAbsence, at: undefined }, returned, 16000],
    [before, away, endAbsence, { focused: false, visibility: "visible" }, 16000],
    [before, away, endAbsence, { focused: true, visibility: "hidden" }, 16000],
    [before, away, endAbsence, returned, NaN],
  ]) assert.equal(proof(...args), false);
});
}

test("the genuine web-tab diagnostic rejects Electron before any fixture session or output work", () => {
  const run = spawnSync(process.execPath, [new URL("./diagnose-restored-input.mjs", import.meta.url).pathname,
    "--run-diagnostic", "--electron", "--genuine-focus"], { encoding: "utf8" });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /same-window web-tab protocol only/);
  assert.equal(run.stdout, "");
});
