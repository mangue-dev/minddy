// @vitest-environment jsdom
//
// The block menu opens on a `position: fixed` anchor. Inside a transformed
// ancestor (the notebook dialog, MIN-728) `fixed` is measured from that
// ancestor, not the viewport: the anchor must subtract its offset, or the
// menu opens beside the block instead of on its handle.
import { afterEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { fixedContainingBlockOffset } = await import("./block-gutter");

afterEach(() => {
  document.body.innerHTML = "";
});

function nest(style: Partial<CSSStyleDeclaration>) {
  const dialog = document.body.appendChild(document.createElement("div"));
  Object.assign(dialog.style, style);
  dialog.getBoundingClientRect = () => ({ top: 40, left: 300 } as DOMRect);
  const inner = dialog.appendChild(document.createElement("div"));
  return inner.appendChild(document.createElement("span"));
}

it("measures from the viewport without a transformed ancestor", () => {
  expect(fixedContainingBlockOffset(nest({}))).toEqual({ top: 0, left: 0 });
});

it("measures from a transformed or translated dialog", () => {
  expect(fixedContainingBlockOffset(nest({ transform: "translate(-50%, -50%)" })))
    .toEqual({ top: 40, left: 300 });
  expect(fixedContainingBlockOffset(nest({ translate: "10px 0" } as Partial<CSSStyleDeclaration>)))
    .toEqual({ top: 40, left: 300 });
});
