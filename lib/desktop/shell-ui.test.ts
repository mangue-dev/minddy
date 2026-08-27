import { describe, expect, it } from "vitest";

import { MINDDY_LOGO_PATH } from "@/lib/brand";
import { desktopShellBrandHtml, desktopShellStyles } from "./shell-ui";

describe("desktop shell UI", () => {
  it("uses minddy's official brandmark and core component geometry", () => {
    expect(desktopShellBrandHtml()).toContain(MINDDY_LOGO_PATH);
    const css = desktopShellStyles();
    expect(css).toContain("--primary: oklch(0.21 0.012 265)");
    expect(css).toContain("--background: oklch(0.165 0.004 264)");
    expect(css).toContain("border-radius: 999px");
    expect(css).toContain('font-family: "Inter"');
  });

  it("embeds only a trusted local Inter data URL", () => {
    expect(desktopShellStyles("data:font/woff2;base64,AA==")).toContain(
      '@font-face { font-family: "Inter"',
    );
    expect(desktopShellStyles('data:text/css;base64,In0=</style>')).not.toContain(
      "@font-face",
    );
  });
});
