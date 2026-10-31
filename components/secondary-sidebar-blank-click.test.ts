// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isBlankSidebarClick } from "./secondary-sidebar";

describe("isBlankSidebarClick (MIN-873)", () => {
  it("is true on the column's empty space and false on a row or a control", () => {
    document.body.innerHTML = `
      <aside><div id="blank">
        <button id="row" data-sidebar-filter-result><span id="inside">Title</span></button>
        <div data-sidebar-row><span id="tree-gap"></span></div>
        <a id="link" href="/x">x</a>
      </div></aside>`;
    const el = (id: string) => document.getElementById(id);
    expect(isBlankSidebarClick(el("blank"))).toBe(true);
    expect(isBlankSidebarClick(el("inside"))).toBe(false);
    expect(isBlankSidebarClick(el("tree-gap"))).toBe(false);
    expect(isBlankSidebarClick(el("link"))).toBe(false);
    expect(isBlankSidebarClick(null)).toBe(false);
  });
});
