// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Delete02Icon, Target01Icon } from "@hugeicons/core-free-icons";
import { IsoIcon } from "@/components/illustrations/iso-icon";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(node: React.ReactNode) {
  act(() => root.render(node));
  return container;
}

/** The visible icon is the last nested `<svg>`: the first one lives in the knockout mask. */
function visibleIcon(el: HTMLElement) {
  const icons = el.querySelectorAll("svg svg");
  return icons[icons.length - 1];
}

describe("IsoIcon", () => {
  it("draws the icon and its dots in the account's accent, not the fixed brand colour", () => {
    const el = render(<IsoIcon icon={Target01Icon} />);
    expect(visibleIcon(el)?.getAttribute("class")).toContain("text-primary");
    expect(el.querySelector("circle.fill-primary\\/75")).not.toBeNull();
    expect(el.innerHTML).not.toContain("brand");
  });

  it("keeps the destructive tone red", () => {
    const el = render(<IsoIcon icon={Delete02Icon} tone="destructive" />);
    expect(visibleIcon(el)?.getAttribute("class")).toContain("text-destructive");
    expect(el.querySelector("circle.fill-destructive\\/75")).not.toBeNull();
  });

  it("draws every dot whole: no mask or clip path can cut one in half", () => {
    const el = render(<IsoIcon icon={Target01Icon} />);
    expect(el.querySelector("mask, clipPath, pattern")).toBeNull();
    const radii = new Set([...el.querySelectorAll("circle")].map((dot) => dot.getAttribute("r")));
    expect(radii.size).toBe(1);
  });

  it("leaves the icon's square free of dots when the drawing cannot be measured", () => {
    // jsdom has no layout: this is the server render and hidden-element case.
    const el = render(<IsoIcon icon={Target01Icon} />);
    const dots = [...el.querySelectorAll("circle")];
    expect(dots.length).toBeGreaterThan(0);
    const insideIconSquare = dots.filter((dot) => {
      const x = Number(dot.getAttribute("cx"));
      const y = Number(dot.getAttribute("cy"));
      return Math.max(Math.abs(x - 50), Math.abs(y - 50)) < 19.5;
    });
    expect(insideIconSquare).toEqual([]);
  });

  it("fades the dots out towards the edge, one opacity per dot", () => {
    const el = render(<IsoIcon icon={Target01Icon} />);
    const grey = [...el.querySelectorAll("circle.fill-foreground\\/15")];
    const opacityAt = (x: number, y: number) =>
      Number(grey.find((dot) => dot.getAttribute("cx") === String(x) && dot.getAttribute("cy") === String(y))?.getAttribute("opacity"));
    expect(opacityAt(50, 26)).toBeGreaterThan(opacityAt(50, 90));
  });
});
