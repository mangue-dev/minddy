import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { boardReady } from "./board-readiness.mjs";

function fixture(rendered = 1) {
  const dom = new JSDOM(`<div data-app-view-active="true" data-board-read-state="fresh">
    ${[0, 1].map((column) => `<section><header><h2>Status</h2><span>50</span></header><div><div data-board-column-scroller data-column="${column}">
      ${Array.from({ length: rendered }, (_, index) => `<div data-issue-id="${column}-${index}"><p>Performance task 1.${index}</p></div>`).join("")}
    </div></div></section>`).join("")}</div>`);
  const { document, HTMLElement } = dom.window;
  HTMLElement.prototype.getClientRects = () => [{}];
  HTMLElement.prototype.getBoundingClientRect = function () {
    const left = this.hasAttribute("data-board-column-scroller") ? Number(this.dataset.column) * 500 : 0;
    return { left, right: this.hasAttribute("data-board-column-scroller") ? left + 500 : 1000, top: 100, bottom: 800, height: 700 };
  };
  document.elementFromPoint = (x) => document.querySelector(`[data-column="${x < 500 ? 0 : 1}"] [data-issue-id] p`);
  const evaluate = () => vm.runInNewContext(`(${boardReady.toString()})(100, "Performance task 1.")`, {
    document, innerWidth: 1000, getComputedStyle: () => ({ visibility: "visible" }),
  });
  return { dom, document, evaluate };
}

test("full and windowed DOM verify the same complete source counts and populated viewport", () => {
  for (const rendered of [1, 50]) {
    const { dom, evaluate } = fixture(rendered);
    try { assert.equal(evaluate(), true); } finally { dom.window.close(); }
  }
});

test("a retained source count cannot conceal an error, incomplete collection or blank viewport", () => {
  for (const change of [
    (document) => { document.querySelector('[data-app-view-active]').dataset.boardReadState = "error"; },
    (document) => { document.querySelector('[data-app-view-active]').setAttribute("inert", ""); },
    (document) => { document.querySelector("header span").textContent = "49"; },
    (document) => { document.elementFromPoint = () => document.querySelector('[data-issue-id]'); },
    (document) => { document.querySelector('[data-issue-id] p').textContent = "Wrong project"; },
  ]) {
    const { dom, document, evaluate } = fixture();
    try { change(document); assert.equal(evaluate(), false); } finally { dom.window.close(); }
  }
});
