import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { JSDOM } from "jsdom";
import { broadIssueReady, broadPageReady, broadPageSpec, broadPageTreeReady } from "./broad-navigation-readiness.mjs";

let dom;
const keys = ["document", "location", "getComputedStyle"];
const originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
afterEach(() => {
  dom?.window.close();
  for (const key of keys) {
    if (originals.get(key)) Object.defineProperty(globalThis, key, originals.get(key));
    else delete globalThis[key];
  }
});
function setup(html) {
  dom = new JSDOM(html, { url: "http://localhost:3111/projects/project/pages/page" });
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, "location", { configurable: true, value: dom.window.location });
  Object.defineProperty(globalThis, "getComputedStyle", { configurable: true, value: dom.window.getComputedStyle.bind(dom.window) });
  dom.window.Element.prototype.getClientRects = function () { return this.closest('[style*="display: none"]') ? [] : [{}]; };
}
const issue = { title: "Canonical issue", description: "Complete expected body", comments: [{ id: "one", body: "First whole note" }, { id: "two", body: "Second whole note" }] };
function issueDOM() {
  return `<div role="dialog"><textarea>${issue.title}</textarea><div class="tiptap" contenteditable="true">${issue.description}</div>
    <div role="textbox" contenteditable="true" aria-placeholder="Comment"></div><div data-query-read-phase="fresh">
    ${issue.comments.map((comment) => `<div data-comment-id="${comment.id}" data-comment-state="confirmed">${comment.body}</div>`).join("")}</div></div>`;
}
test("requires the full editable issue and every exact confirmed comment beyond its title shell", () => {
  setup(issueDOM());
  assert.equal(broadIssueReady(issue), true);
  document.querySelector('[data-comment-id="two"]').remove();
  assert.equal(broadIssueReady(issue), false);
});
test("rejects unavailable activity, pending comments, wrong body and unavailable writing controls", () => {
  for (const [selector, attribute, value] of [
    ['[data-query-read-phase]', 'data-query-read-phase', 'loading'],
    ['[data-query-read-phase]', 'data-query-read-phase', 'paused'],
    ['[data-query-read-phase]', 'data-query-read-phase', 'error'],
    ['[data-comment-id]', 'data-comment-state', 'sending'],
    ['.tiptap', 'contenteditable', 'false'],
    ['[role="textbox"]', 'contenteditable', 'false'],
    ['textarea', 'readonly', 'true'],
  ]) {
    setup(issueDOM());
    document.querySelector(selector).setAttribute(attribute, value);
    assert.equal(broadIssueReady(issue), false, selector);
    dom.window.close();
  }
  setup(issueDOM());
  document.querySelector('.tiptap').textContent = "Only a preview";
  assert.equal(broadIssueReady(issue), false);
});
test("complete canonical content remains usable while its accepted timeline reconciles", () => {
  setup(issueDOM());
  document.querySelector('[data-query-read-phase]').setAttribute('data-query-read-phase', 'refreshing');
  assert.equal(broadIssueReady(issue), true);
  document.querySelector('[data-comment-id="two"]').textContent = "An outdated note";
  assert.equal(broadIssueReady(issue), false);
  document.querySelector('[data-comment-id="two"]').textContent = issue.comments[1].body;
  document.querySelector('[role="textbox"]').setAttribute('contenteditable', 'false');
  assert.equal(broadIssueReady(issue), false);
  document.querySelector('[role="textbox"]').setAttribute('contenteditable', 'true');
  document.querySelector('[data-comment-id="two"]').remove();
  assert.equal(broadIssueReady(issue), false);
});
test("never accepts a complete issue retained behind an inert surface", () => {
  setup(`<div inert>${issueDOM()}</div>`);
  assert.equal(broadIssueReady(issue), false);
});
const body = { id: "page", title: "Canonical Page", content: { type: "doc", content: [
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Section" }] },
  { type: "paragraph", content: [{ type: "text", text: "Exact body" }] },
] } };
const page = broadPageSpec(body, "/projects/project/pages/page", "tab");
const pageDOM = '<button data-app-tab-id="tab" aria-selected="true"></button><div data-page-surface-id="page"><textarea>Canonical Page</textarea><div class="page-editor"><div class="tiptap" contenteditable="true"><h2>Section</h2><p>Exact body</p></div></div></div>';
test("accepts the exact ordered Page blocks only with its editable scoped surface", () => {
  setup(pageDOM);
  assert.equal(broadPageReady(page), true);
  document.querySelector('p').textContent = "Different document";
  assert.equal(broadPageReady(page), false);
});
test("rejects matching Page shells with wrong identity, disabled title or read-only editor", () => {
  for (const [selector, attribute, value] of [
    ['[data-page-surface-id]', 'data-page-surface-id', 'other'],
    ['textarea', 'readonly', 'true'],
    ['.tiptap', 'contenteditable', 'false'],
    ['button', 'aria-selected', 'false'],
  ]) {
    setup(pageDOM);
    document.querySelector(selector).setAttribute(attribute, value);
    assert.equal(broadPageReady(page), false, selector);
    dom.window.close();
  }
});
test("source projection rejects incomplete and unsupported fixture documents", () => {
  assert.throws(() => broadPageSpec({}, "/page", "tab"));
  assert.throws(() => broadPageSpec({ content: { type: "doc", content: [{ type: "unknown" }] } }, "/page", "tab"));
});

test("selects the visible scoped Page when an earlier retained copy has the same identity", () => {
  const surface = pageDOM.replace('<button data-app-tab-id="tab" aria-selected="true"></button>', "");
  setup(`<button data-app-tab-id="tab" aria-selected="true"></button><div data-app-view-active="false" data-retained-tab-id="other" inert>${surface}</div><div data-app-view-active="true" data-retained-tab-id="tab">${surface}</div>`);
  assert.equal(broadPageReady(page), true);
  document.querySelector('[data-app-view-active="true"]').setAttribute("data-retained-tab-id", "wrong");
  assert.equal(broadPageReady(page), false);
});

test("accepts exact complete Page trees in an existing authorized destination tab", () => {
  const href = "/projects/project/pages";
  const spec = { href, tabIds: ["original", "existing"], pageIds: ["one", "two"] };
  setup('<button data-app-tab-id="existing" aria-selected="true"></button><div data-sidebar-page-row><a href="/projects/project/pages/one">One</a></div><div data-sidebar-page-row><a href="/projects/project/pages/two">Two</a></div>');
  dom.window.history.replaceState(null, "", href);
  assert.equal(broadPageTreeReady(spec), true);
  dom.window.history.replaceState(null, "", `${href}/one`);
  assert.equal(broadPageTreeReady(spec), true);
  dom.window.history.replaceState(null, "", `${href}/unknown`);
  assert.equal(broadPageTreeReady(spec), false);
  dom.window.history.replaceState(null, "", href);
  assert.equal(broadPageTreeReady({ ...spec, tabIds: ["original"] }), false);
  assert.equal(broadPageTreeReady({ ...spec, pageIds: ["one", "different"] }), false);
  document.querySelectorAll('[data-sidebar-page-row]')[1].remove();
  assert.equal(broadPageTreeReady(spec), false);
});
