// @vitest-environment jsdom
// A palette row can color its title, as an objective's name in its color
// (MIN-785).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// CSS modules do not load under Vitest; the row's own class names do not matter here.
vi.mock("../styles/ResultItem.module.css", () => ({ default: { title: "title" } }));
vi.mock("../config", () => ({ usePaletteConfig: () => ({ t: (key: string) => key }) }));

const { ResultItem } = await import("./ResultItem");

describe("palette result row", () => {
  it("applies the item's title class and style to the title only", () => {
    const html = renderToStaticMarkup(createElement(ResultItem, {
      item: {
        id: "objective-1",
        title: "Launch",
        filterCategory: "objectives",
        titleClassName: "objective-tone",
        titleStyle: { color: "rgb(1, 2, 3)" },
      },
      isActive: false,
      onSelect: () => {},
      hasActions: false,
    }));
    expect(html).toMatch(/<span class="title objective-tone" style="color:rgb\(1, 2, 3\)">Launch<\/span>/);
  });
});
