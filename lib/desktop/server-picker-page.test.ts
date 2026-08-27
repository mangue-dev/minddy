import { describe, expect, it } from "vitest";

import { MINDDY_LOGO_PATH } from "@/lib/brand";
import { desktopServerPickerHtml } from "./server-picker-page";

describe("desktopServerPickerHtml", () => {
  it("renders the shared minddy design and all server choices", () => {
    const html = desktopServerPickerHtml(
      "https://self-hosted.example.com",
      true,
      "data:font/woff2;base64,AA==",
    );

    expect(html).toContain(MINDDY_LOGO_PATH);
    expect(html).toContain('@font-face { font-family: "Inter"');
    expect(html).toContain("shell-button shell-button-primary");
    expect(html).toContain("Run local minddy on this computer");
    expect(html).toContain("Remote servers require HTTPS; localhost can use HTTP.");
    expect(html).toContain("Use minddy Cloud");
    expect(html).toContain('value="https://self-hosted.example.com"');
  });

  it("escapes the current origin and hides the cloud action on cloud", () => {
    const html = desktopServerPickerHtml(
      'https://example.com/"><script>alert(1)</script>',
      false,
    );

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("Use minddy Cloud");
  });
});
