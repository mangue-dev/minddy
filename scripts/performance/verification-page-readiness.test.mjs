import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { verificationPageReady, focusPageRestorationState } from "./verification-page-readiness.mjs";

test("requires the mounted focus document's real new body and matching accepted version", () => {
  const dom = new JSDOM(`<button data-app-tab-id="tab" aria-selected="true"></button><div data-page-surface-id="page">
    <textarea>Exact synthetic focus Page</textarea><div class="tiptap" contenteditable="true">${"<h2>Heading</h2>".repeat(8)}${"<p>Original body</p>".repeat(71)}<p>Remote focus update</p></div></div>`, { url: "http://localhost/projects/project/pages/page" });
  const { document, Element } = dom.window;
  Element.prototype.getClientRects = () => [{}];
  const body = { id: "page", project_id: "project", version: 11, content: { text: "Remote focus update" } };
  const spec = { id: "tab", projectId: "project", pageId: "page", version: 11, href: "/projects/project/pages/page", title: "Exact synthetic focus Page", text: "Remote focus update" };
  const context = { document, location: dom.window.location, URL, getComputedStyle: () => ({ visibility: "visible" }),
    window: { __restoredVerify: { client: { getQueryData: () => body } } } };
  const ready = () => vm.runInNewContext(`(${verificationPageReady.toString()})(${JSON.stringify(spec)})`, context);
  try {
    assert.equal(ready(), true);
    body.version = 10; assert.equal(ready(), false);
    body.version = 11; document.querySelector('.tiptap p:last-child').textContent = "Still stale";
    assert.equal(ready(), false);
    document.querySelector('.tiptap p:last-child').textContent = "Remote focus update";
    body.content.text = "Stale cache with a misleading version"; assert.equal(ready(), false);
    body.content.text = "Remote focus update"; document.querySelector('[data-page-surface-id]').setAttribute("inert", "");
    assert.equal(ready(), false);
  } finally { dom.window.close(); }
});
test("restores only the known focus mutation or an unchanged failed transport", () => {
  const original = { id: "page", version: 10, content: { text: "Original" } };
  const item = { original, expectedMutationBaseVersion: 10, expectedMutatedContent: { text: "Owned remote update" } };
  assert.equal(focusPageRestorationState(item, structuredClone(original)), "unchanged");
  assert.equal(focusPageRestorationState(item, { ...original, version: 11, content: item.expectedMutatedContent }), "owned-mutation");
  assert.equal(focusPageRestorationState(item, { ...original, version: 12, content: item.expectedMutatedContent }), "unexpected");
  assert.equal(focusPageRestorationState(item, { ...original, version: 11, content: { text: "Another actor's edit" } }), "unexpected");
  assert.equal(focusPageRestorationState(item, { ...original, title: "Concurrent title", version: 11, content: item.expectedMutatedContent }), "unexpected");
});
test("primary draft cleanup recognizes only exact bodies and versions journaled before transport", () => {
  const original = { id: "page", title: "Unchanged title", version: 10, content: { text: "Original" } };
  const item = { original, restorationCandidates: [
    { version: 11, content: { text: "Remote diagnostic text" } },
    { version: 12, content: { text: "Merged remote and local diagnostic text" } },
  ] };
  assert.equal(focusPageRestorationState(item, structuredClone(original)), "unchanged");
  for (const candidate of item.restorationCandidates) {
    assert.equal(focusPageRestorationState(item, { ...original, ...candidate, updated_at: "Later" }), "owned-mutation");
  }
  assert.equal(focusPageRestorationState(item, { ...original, version: 13, content: item.restorationCandidates[1].content }), "unexpected");
  assert.equal(focusPageRestorationState(item, { ...original, version: 12, content: { text: "Unexpected text" } }), "unexpected");
});
