import { describe, expect, it } from "vitest";

import { MINDDY_LOGO_PATH } from "@/lib/brand";
import {
  desktopServerUnavailableHtml,
  isDesktopServerUnavailable,
} from "./server-unavailable";

describe("isDesktopServerUnavailable", () => {
  const activeOrigin = "https://minddy.example.com";

  it("accepts a main-frame failure from the active minddy origin", () => {
    expect(
      isDesktopServerUnavailable(
        {
          errorCode: -102,
          isMainFrame: true,
          validatedUrl: `${activeOrigin}/home`,
        },
        activeOrigin,
      ),
    ).toBe(true);
  });

  it("ignores canceled loads, subframes, and unrelated origins", () => {
    expect(
      isDesktopServerUnavailable(
        { errorCode: -3, isMainFrame: true, validatedUrl: `${activeOrigin}/home` },
        activeOrigin,
      ),
    ).toBe(false);
    expect(
      isDesktopServerUnavailable(
        { errorCode: -102, isMainFrame: false, validatedUrl: `${activeOrigin}/home` },
        activeOrigin,
      ),
    ).toBe(false);
    expect(
      isDesktopServerUnavailable(
        { errorCode: -102, isMainFrame: true, validatedUrl: "https://example.com/home" },
        activeOrigin,
      ),
    ).toBe(false);
  });
});

describe("desktopServerUnavailableHtml", () => {
  it("names the configured server and provides both recovery actions", () => {
    const html = desktopServerUnavailableHtml(
      "https://minddy.example.com",
      "https://minddy.example.com/projects?view=active",
      "data:font/woff2;base64,AA==",
      "darwin",
    );

    expect(html).toContain(MINDDY_LOGO_PATH);
    expect(html).toContain('@font-face { font-family: "Inter"');
    expect(html).toContain("shell-button shell-button-primary");
    expect(html).toContain("minddy can’t reach minddy.example.com");
    expect(html).toContain("server may be stopped, or its address may be incorrect");
    expect(html).toContain('href="https://minddy.example.com/projects?view=active"');
    expect(html).toContain("Try again");
    expect(html).toContain("Check server settings");
    expect(html).toContain('data-desktop-platform="darwin"');
    expect(html).toContain('class="desktop-drag-band"');
    expect(html).toContain('-webkit-app-region: drag');
    expect(html.toLowerCase()).not.toContain("internet");
  });

  it("limits the local drag band to macOS", () => {
    const html = desktopServerUnavailableHtml(
      "https://minddy.example.com",
      "https://minddy.example.com/home",
      undefined,
      "win32",
    );

    expect(html).toContain('data-desktop-platform="win32"');
    expect(html).toContain('html[data-desktop-platform="darwin"] .desktop-drag-band');
  });

  it("escapes rendered values and refuses a retry on another origin", () => {
    const html = desktopServerUnavailableHtml(
      "https://minddy.example.com",
      'https://other.example.com/"<script>alert(1)</script>',
    );

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain('href="https://minddy.example.com/home"');
  });
});
