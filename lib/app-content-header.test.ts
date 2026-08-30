import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "components/app-content-header.tsx"),
  "utf8",
);

describe("application content header", () => {
  it("stays above the scrolling content pane", () => {
    expect(source).toContain("sticky top-0 z-[35]");
    expect(source).toContain("bg-background");
  });

  it("keeps its fixed geometry and horizontal overflow behavior", () => {
    expect(source).toContain("h-[60px] shrink-0");
    expect(source).toContain("overflow-x-auto overflow-y-hidden");
    expect(source).toContain("overscroll-x-contain");
  });
});
