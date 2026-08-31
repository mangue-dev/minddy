import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "components/app-content-header.tsx"),
  "utf8",
);
const styles = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

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

  it("moves the macOS window from empty space without swallowing controls", () => {
    expect(source).toContain("app-content-header sticky");
    expect(styles).toMatch(
      /html\[data-desktop-platform="darwin"\] \.app-content-header\s*\{\s*-webkit-app-region:\s*drag;/,
    );
    expect(styles).toMatch(
      /html\[data-desktop-platform="darwin"\] \.app-content-header[\s\S]*?:is\([\s\S]*?button,[\s\S]*?\)\s*\{\s*-webkit-app-region:\s*no-drag;/,
    );
  });
});
