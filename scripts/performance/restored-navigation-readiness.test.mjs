import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { JSDOM } from "jsdom";
import { restoredDestinationReady, restoredPreparationMetadata, RESTORED_LOADING_SELECTOR } from "./restored-navigation-readiness.mjs";

let dom;
const globals = ["window", "document", "location", "getComputedStyle", "innerWidth", "innerHeight"];
const original = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
afterEach(() => {
  dom?.window.close();
  for (const key of globals) {
    if (original.get(key)) Object.defineProperty(globalThis, key, original.get(key));
    else delete globalThis[key];
  }
});
function setup(html, href = "/projects/project/pages/page") {
  dom = new JSDOM(html, { url: `http://localhost:3111${href}` });
  for (const key of globals) Object.defineProperty(globalThis, key, { configurable: true, value: key === "getComputedStyle" ? dom.window.getComputedStyle.bind(dom.window) : dom.window[key] });
  dom.window.Element.prototype.getClientRects = function () { return this.closest('[style*="display: none"]') ? [] : [{}]; };
  dom.window.__restored = { loadingSelector: RESTORED_LOADING_SELECTOR, boardReady: () => true };
}
const spec = { id: "tab", href: "/projects/project/pages/page", kind: "page", pageId: "page", title: "Performance guide 1.11", bodyText: "Expected body" };
function fullPage({ editable = true, title = spec.title, text = spec.bodyText } = {}) {
  return `<button data-app-tab-id="tab" aria-selected="true"></button><div data-page-surface-id="page"><textarea>${title}</textarea>
    <div class="page-editor"><div class="tiptap" contenteditable="${editable}">${Array.from({ length: 8 }, () => "<h2>Section</h2>").join("")}
    ${Array.from({ length: 72 }, () => `<p>${text}</p>`).join("")}</div></div></div>
    ${Array.from({ length: 20 }, (_, index) => `<div data-sidebar-page-row><a href="/page-${index}">Page</a></div>`).join("")}`;
}
test("captures missing, invalidated and fetching prerequisites without exporting bodies or granting Page write authority", () => {
  setup(fullPage());
  const body = { id: "page", project_id: "project", version: 7, title: spec.title, content: { content: [{ text: spec.bodyText }] } };
  const queries = [
    { queryKey: ["page", "page"], state: { data: body, status: "success", isInvalidated: true, fetchStatus: "fetching", dataUpdatedAt: 10 }, getObserversCount: () => 0 },
    { queryKey: ["pages", "project"], state: { data: [{ id: "page" }], status: "success", isInvalidated: false, fetchStatus: "idle", dataUpdatedAt: 9 }, getObserversCount: () => 0 },
  ];
  window.__restored.client = { getQueryData: (key) => queries.find((query) => JSON.stringify(query.queryKey) === JSON.stringify(key))?.state.data,
    getQueryCache: () => ({ findAll: ({ queryKey, exact }) => queries.filter((query) => exact ? JSON.stringify(query.queryKey) === JSON.stringify(queryKey) : queryKey.every((part, index) => part === query.queryKey[index])) }) };
  const snapshot = restoredPreparationMetadata([{ ...spec, projectId: "project" }]);
  const destination = snapshot.destinations[0];
  assert.equal(snapshot.queryClientFound, true);
  assert.equal(destination.page.version, 7);
  assert.equal(destination.page.expectedBodyTextPresent, true);
  assert.equal(destination.page.writeBasis, "Not inferred from cache metadata");
  assert.equal(destination.queries.find((entry) => entry.key[0] === "page").invalidated, true);
  assert.equal(destination.queries.find((entry) => entry.key[0] === "page").fetchStatus, "fetching");
  assert.equal(destination.queries.find((entry) => entry.key[0] === "issues").status, "missing");
  assert.deepEqual(destination.queries.find((entry) => entry.key[0] === "pages").collections, { rows: 1 });
  assert.ok(!JSON.stringify(snapshot).includes(spec.bodyText));
});
test("requires exact visible populated editable Page content and the complete tree", () => {
  setup(fullPage());
  assert.equal(restoredDestinationReady(spec), true);
  document.querySelector('[data-sidebar-page-row]').remove();
  assert.equal(restoredDestinationReady(spec), false);
});
test("rejects a Page shell and stale content from a hidden retained destination", () => {
  setup(`<button data-app-tab-id="tab" aria-selected="true"></button><div data-page-surface-id="page"><textarea>${spec.title}</textarea></div>
    <div inert>${fullPage()}</div>`);
  assert.equal(restoredDestinationReady(spec), false);
});
for (const [name, options] of [["read-only editor", { editable: false }], ["wrong document title", { title: "Another document" }], ["wrong document body", { text: "Another body" }]]) {
  test(`rejects ${name} even when the block count matches`, () => {
    setup(fullPage(options));
    assert.equal(restoredDestinationReady(spec), false);
  });
}
test("rejects visible loading while allowing suspended hidden loading", () => {
  setup(`${fullPage()}<div data-slot="skeleton"></div>`);
  assert.equal(restoredDestinationReady(spec), false);
  document.querySelector('[data-slot="skeleton"]').setAttribute("inert", "");
  assert.equal(restoredDestinationReady(spec), true);
});
test("does not count secondary headings as usable empty content without their actions", () => {
  const objective = { id: "tab", kind: "objectives", projectId: "project", href: "/projects/project/objectives" };
  setup('<button data-app-tab-id="tab" aria-selected="true"></button><h2>Set your first objectives</h2>', objective.href);
  assert.equal(restoredDestinationReady(objective), false);
  document.body.insertAdjacentHTML("beforeend", "<button>New objective</button>");
  assert.equal(restoredDestinationReady(objective), true);
  document.querySelector("button:last-child").disabled = true;
  assert.equal(restoredDestinationReady(objective), false);
});

const triage = { id: "tab", href: "/projects/project/triage", kind: "triage", projectId: "project",
  secondary: { listIds: ["first", "second"], details: [{ id: "first", title: "Fixture triage", bodyText: "Complete fixture description", commentIds: ["comment-one", "comment-two"] }] } };
function populatedTriage() {
  return `<button data-app-tab-id="tab" aria-selected="true"></button>
    <button data-navigation-href="/projects/project/triage?issue=first" aria-current="true">Fixture triage</button>
    <button data-navigation-href="/projects/project/triage?issue=second">Second fixture triage</button>
    <textarea>Fixture triage</textarea><div class="tiptap" contenteditable="true">Complete fixture description</div>
    <div role="textbox" contenteditable="true" aria-placeholder="Write a comment"></div><button>Accept</button><button>Decline</button>
    <div data-comment-id="comment-one" data-comment-state="confirmed">First actual activity</div>
    <div data-comment-id="comment-two" data-comment-state="confirmed">Second actual activity</div>`;
}
test("requires every populated secondary identity, selected complete editable detail and loaded activity", () => {
  setup(populatedTriage(), triage.href);
  assert.equal(restoredDestinationReady(triage), true);
  document.querySelector('[data-comment-id="comment-two"]').remove();
  assert.equal(restoredDestinationReady(triage), false);
});
test("rejects populated secondary rows without their complete selected detail", () => {
  setup(populatedTriage(), triage.href);
  document.querySelector('.tiptap').remove();
  assert.equal(restoredDestinationReady(triage), false);
});
test("rejects secondary duplicates, missing rows and a mismatched requested detail", () => {
  setup(populatedTriage(), triage.href);
  assert.equal(restoredDestinationReady({ ...triage, detailId: "second" }), false);
  document.querySelector('[data-navigation-href$="second"]').dataset.navigationHref = "/projects/project/triage?issue=first";
  assert.equal(restoredDestinationReady(triage), false);
});
test("a windowed collection requires its complete real query source and published count", () => {
  const ids = ["first", "second", ...Array.from({ length: 118 }, (_, index) => `offscreen-${index}`)];
  const large = { ...triage, secondary: { ...triage.secondary, listIds: ids, collectionPlaceholder: "Filter 120 issues…" } };
  setup(`${populatedTriage()}<input placeholder="Filter 120 issues…">`, triage.href);
  assert.equal(restoredDestinationReady(large), false, "Mounted rows alone are not the full source");
  const query = { state: { status: "success", dataUpdatedAt: 123, data: ids.map((id) => ({ id, status: "triage" })) } };
  window.__restored.client = { getQueryCache: () => ({ findAll: (options) => {
    assert.deepEqual(options, { queryKey: ["issues", "project"] }); return [query];
  } }) };
  assert.equal(restoredDestinationReady(large), true);
  assert.deepEqual(window.__restored.collectionProof.tab, { mode: "complete-accepted-query-source", sourceCount: 120, mountedRows: 2, queryStatus: "success", dataUpdatedAt: 123 });
  query.state.data.pop();
  assert.equal(restoredDestinationReady(large), false, "A capped source must not inherit the manifest count");
  query.state.data.push({ id: ids.at(-1), status: "triage" });
  document.querySelector('input').placeholder = "Filter 119 issues…";
  assert.equal(restoredDestinationReady(large), false);
  document.querySelector('input').placeholder = "Filter 120 issues…";
  query.state.status = "error";
  assert.equal(restoredDestinationReady(large), false);
});

const pr = { id: "tab", kind: "pr", href: "/pull-requests?pr=pr", prId: "pr", title: "Fixture PR", canComment: false,
  files: ["docs/fixture.md", "docs/fixture.csv"], commits: 2 };
function prFixture() {
  setup(`<button data-app-tab-id="tab" aria-selected="true"></button><button data-navigation-href="/pull-requests?pr=pr" aria-current="true">Fixture PR</button>
    <h1>Fixture PR</h1><button role="tab" data-x="10">Description and activity</button><button role="tab" data-x="110">Changes</button>
    <div data-testid="pr-description">A documentation-only draft</div><div data-testid="pr-activity-timeline"></div>`, "/pull-requests");
  dom.window.Element.prototype.getBoundingClientRect = function () {
    const left = Number(this.dataset.x ?? 0);
    return { left, right: left + 80, top: 10, bottom: 40, width: 80, height: 30 };
  };
  document.elementFromPoint = (x) => [...document.querySelectorAll('[data-x]')].find((node) => x >= Number(node.dataset.x) && x <= Number(node.dataset.x) + 80);
}
test("accepts the authoritative read-only PR activity view without an unavailable composer or unmounted Files toolbar", () => {
  prFixture();
  assert.equal(restoredDestinationReady(pr), true);
  assert.equal(restoredDestinationReady({ ...pr, canComment: true }), false);
  document.body.insertAdjacentHTML("beforeend", '<div data-testid="pr-comment-composer-region"><div class="tiptap" contenteditable="true"></div></div>');
  assert.equal(restoredDestinationReady({ ...pr, canComment: true }), true);
});
test("requires hit-testable enabled PR navigation independently of complete description text", () => {
  prFixture();
  document.querySelector('[data-x="110"]').disabled = true;
  assert.equal(restoredDestinationReady(pr), false);
  document.querySelector('[data-x="110"]').disabled = false;
  document.elementFromPoint = () => document.body;
  assert.equal(restoredDestinationReady(pr), false);
});
test("requires both real file patches before the distinct commits journey can complete", () => {
  prFixture();
  const files = { ...pr, prSubview: "files" };
  assert.equal(restoredDestinationReady(files), false);
  document.body.insertAdjacentHTML("beforeend", '<button data-testid="pr-commits-trigger" data-x="210">2 commits</button><div data-testid="pr-diff-view"></div>');
  const diff = document.querySelector('[data-testid="pr-diff-view"]');
  for (const path of pr.files) {
    const card = document.createElement("div"); card.id = `pr-file-${path}`;
    const container = document.createElement("diffs-container"); container.attachShadow({ mode: "open" }).textContent = path.endsWith(".csv") ? "paint_opportunity_ms" : "Minddy pull request performance validation";
    card.append(container); diff.append(card);
  }
  assert.equal(restoredDestinationReady(files), true);
  const commits = { ...pr, prSubview: "commits" };
  assert.equal(restoredDestinationReady(commits), false);
  document.body.insertAdjacentHTML("beforeend", '<div data-testid="pr-commits-popover"><ul><li role="button">First source commit</li><li role="button">Second source commit</li></ul></div>');
  assert.equal(restoredDestinationReady(commits), true);
  diff.lastElementChild.remove();
  assert.equal(restoredDestinationReady(commits), false);
});
