import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
const styles = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

describe("desktop drag band", () => {
  it("is mounted by the root layout before every route surface", () => {
    const band = layout.indexOf('className="desktop-drag-band"');
    const children = layout.indexOf("{children}", band);

    expect(band).toBeGreaterThan(-1);
    expect(children).toBeGreaterThan(band);
    expect(layout).toContain("<DesktopChrome />");
  });

  it("covers the macOS titlebar and excludes interactive controls", () => {
    expect(styles).toContain(
      'html[data-desktop-platform="darwin"] .desktop-drag-band',
    );
    expect(styles).toMatch(/\.desktop-drag-band\s*\{[\s\S]*?height:\s*44px;[\s\S]*?-webkit-app-region:\s*drag;/);
    expect(styles).toMatch(/html\[data-desktop-platform="darwin"\][\s\S]*?:is\([\s\S]*?button,[\s\S]*?\)\s*\{\s*-webkit-app-region:\s*no-drag;/);
  });

  it("keeps creation controls non-draggable below the application bar", () => {
    expect(styles.includes('.sidebar-brand-row { -webkit-app-region: no-drag; }')).toBe(true);
    expect(styles.includes('html[data-desktop-app]:has(.app-top-bar) .desktop-drag-band { display: none; }')).toBe(true);
  });
});
