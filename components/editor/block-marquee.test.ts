// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from "vitest";
import { EDITOR_RESERVE_ATTR, startsMarquee } from "@/components/editor/block-marquee";

let pane: HTMLElement;
let root: HTMLElement;
let dom: HTMLElement;
let paragraph: HTMLElement;
let handle: HTMLElement;
let reserve: HTMLElement;
let title: HTMLElement;

beforeEach(() => {
  // pane > column > [title, root > [handle, dom > p, reserve]]
  document.body.innerHTML = `
    <div id="pane"><div id="column">
      <textarea id="title"></textarea>
      <div id="root">
        <button id="handle"></button>
        <div id="dom" contenteditable="true" style="padding-left: 96px; padding-right: 40px"><p id="p">Text</p></div>
        <div id="reserve" ${EDITOR_RESERVE_ATTR}></div>
      </div>
    </div></div>`;
  const byId = (id: string) => document.getElementById(id)!;
  [pane, root, dom, paragraph, handle, reserve, title] = ["pane", "root", "dom", "p", "handle", "reserve", "title"].map(byId);
  // The editor spans 0–736px; its text column is 96–696px.
  dom.getBoundingClientRect = () => new DOMRect(0, 0, 736, 400);
});

afterEach(() => {
  document.body.innerHTML = "";
});

it("starts from the pane and the column around the editor, and from the reserve under it", () => {
  expect(startsMarquee(pane, 10, root, dom)).toBe(true);
  expect(startsMarquee(document.getElementById("column"), 10, root, dom)).toBe(true);
  expect(startsMarquee(reserve, 300, root, dom)).toBe(true);
});

it("starts from the editor's bands beside its text, not from the text column", () => {
  expect(startsMarquee(dom, 40, root, dom)).toBe(true);
  expect(startsMarquee(dom, 720, root, dom)).toBe(true);
  expect(startsMarquee(dom, 300, root, dom)).toBe(false);
  expect(startsMarquee(paragraph, 40, root, dom)).toBe(false);
});

it("leaves their own press to fields, buttons and what lies beside the editor", () => {
  expect(startsMarquee(handle, 40, root, dom)).toBe(false);
  expect(startsMarquee(title, 300, root, dom)).toBe(false);
});
