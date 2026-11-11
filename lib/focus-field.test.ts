// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import type { MouseEvent } from "react";
import { focusFieldIn } from "./focus-field";

afterEach(() => document.body.replaceChildren());

function tap(box: HTMLElement, target: Element) {
  focusFieldIn({ target, currentTarget: box } as unknown as MouseEvent<HTMLElement>);
}

it("focuses the field when its box is tapped, not when a control of the box is", () => {
  const box = document.createElement("div");
  const padding = document.createElement("div");
  const field = document.createElement("textarea");
  field.value = "draft";
  const button = document.createElement("button");
  box.append(padding, field, button);
  document.body.append(box);

  tap(box, button);
  expect(document.activeElement).not.toBe(field);

  tap(box, padding);
  expect(document.activeElement).toBe(field);
  expect(field.selectionStart).toBe(5);
});
