import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "components/app-sidebar.tsx"),
  "utf8",
);

describe("primary sidebar chrome", () => {
  it("anchors the inbox badge to its icon instead of the control corner", () => {
    expect(source).toContain(
      '<span className="relative flex size-[18px] shrink-0">',
    );
    expect(source).toContain(
      'className="absolute -right-2 -top-1.5 flex items-center justify-center rounded-full bg-sidebar"',
    );
  });

  it("never draws modal window-button decoys in the collapsed rail", () => {
    expect(source).toContain(
      "{!collapsed && windowButtons.decoy && <WindowButtonDecoys />}",
    );
  });

  it("uses the stable desktop platform for the native-control pointer gap", () => {
    expect(source).toContain(
      "document.documentElement.dataset.desktopPlatform",
    );
    expect(source).not.toContain("windowButtons.reserved && e.clientX");
  });

  it("marks the no-drag titlebar only for a hovered rail", () => {
    expect(source).toContain(
      'data-rail-hovered={overlay && hovered ? "" : undefined}',
    );
  });
});
