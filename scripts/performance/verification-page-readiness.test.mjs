import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { verificationPageReady, focusPageRestorationState, verifiedFocusAbsence, parseVerificationInactiveMs } from "./verification-page-readiness.mjs";

test("bounds configured inactivity before any fixture connection", () => {
  assert.equal(parseVerificationInactiveMs(undefined), 75_000);
  for (const value of ["16000", "70000", "75000", "300000"]) assert.equal(parseVerificationInactiveMs(value), Number(value));
  for (const value of ["", "15999", "300001", "75000.5", " 75000", "1e5", "Infinity", "-75000", 75_000, null])
    assert.throws(() => parseVerificationInactiveMs(value), /integer from 16000 to 300000/);
});

test("remote verification refuses writes without observed sustained real focus loss", () => {
  const before = { focused: true };
  const away = { focused: false, visibility: "visible", wallClock: 10_000, at: 1000 };
  const current = { focused: false, visibility: "visible", wallClock: 26_000, at: 17_000 };
  assert.equal(verifiedFocusAbsence(before, away, current), true);
  assert.equal(verifiedFocusAbsence(before, { ...away, focused: true }, current), false);
  assert.equal(verifiedFocusAbsence(before, away, { ...current, focused: true }), false);
  assert.equal(verifiedFocusAbsence(before, away, { ...current, wallClock: 24_999 }), false);
  assert.equal(verifiedFocusAbsence({ focused: false }, away, current), false);
  assert.equal(verifiedFocusAbsence(before, away, { focused: false }), false);
  assert.equal(verifiedFocusAbsence(before, away, current, 75_000), false);
  const longAbsence = { ...current, wallClock: 85_000, at: 76_000 };
  assert.equal(verifiedFocusAbsence(before, away, longAbsence, 75_000), true);
  assert.equal(verifiedFocusAbsence(before, away, { ...longAbsence, at: 75_999.9 }, 75_000), false);
  assert.equal(verifiedFocusAbsence(before, away, { ...longAbsence, wallClock: 84_999 }, 75_000), false);
  assert.equal(verifiedFocusAbsence(before, away, { ...longAbsence, focused: true }, 75_000), false);
  assert.equal(verifiedFocusAbsence(before, away, longAbsence, 15_000), false);
});

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
