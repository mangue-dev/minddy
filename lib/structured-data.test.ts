import { describe, expect, it } from "vitest";
import { breadcrumbList, serializeJsonLd } from "@/lib/structured-data";

describe("public structured data", () => {
  it("numbers a breadcrumb trail from the home page down to the page", () => {
    const page = "https://minddy.example/docs/pages";
    const trail = breadcrumbList(page, [
      { name: "minddy", url: "https://minddy.example" },
      { name: "Documentation", url: "https://minddy.example/docs" },
      { name: "Pages", url: page },
    ]);

    expect(trail["@id"]).toBe(`${page}#breadcrumb`);
    expect(trail.itemListElement.map(({ position }) => position)).toEqual([1, 2, 3]);
    expect(trail.itemListElement.at(-1)).toMatchObject({ name: "Pages", item: page });
  });

  it("keeps catalog text from closing the script element", () => {
    const graph = [{ "@type": "WebPage", name: "</script><script>alert(1)</script>" }];
    const serialized = serializeJsonLd(graph);

    expect(serialized).not.toContain("<");
    expect(JSON.parse(serialized)["@graph"]).toEqual(graph);
  });
});
