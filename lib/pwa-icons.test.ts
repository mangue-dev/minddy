import { afterEach, describe, expect, it, vi } from "vitest";
import { pwaIcons } from "./pwa-icons";
import { GET } from "@/app/manifest.json/route";

// The static app/manifest.json this route replaced (MIN-720): production must
// keep serving exactly this document.
const PRODUCTION_MANIFEST = {
  "id": "/",
  "name": "minddy",
  "short_name": "minddy",
  "description": "An open-source issue tracker and project workspace with objectives, cycles, user feedback and coding agents.",
  "lang": "en",
  "start_url": "/home",
  "scope": "/",
  "icons": [
    {
      "src": "/web-app-manifest-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/web-app-manifest-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ],
  "screenshots": [
    {
      "src": "/pwa-install-narrow.png",
      "sizes": "720x1200",
      "type": "image/png",
      "form_factor": "narrow",
      "label": "A minddy board and an agent working through an issue"
    }
  ],
  "theme_color": "#ffffff",
  "background_color": "#ffffff",
  "display": "standalone"
};

afterEach(() => vi.unstubAllEnvs());

describe("pwaIcons", () => {
  it("gives preview installs the blue images and keeps the neutral ones elsewhere", () => {
    expect(pwaIcons("preview").manifest.map((icon) => icon.src)).toEqual([
      "/web-app-manifest-preview-192x192.png",
      "/web-app-manifest-preview-512x512.png",
    ]);
    expect(pwaIcons("preview").apple).toBe("apple-icon-preview.png");
    expect(pwaIcons("production").apple).toBe("apple-icon.png");
    expect(pwaIcons("development").manifest[0].src).toBe("/web-app-manifest-192x192.png");
  });
});

describe("/manifest.json", () => {
  it("serves the former static manifest unchanged in production", async () => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    const response = GET();
    expect(response.headers.get("content-type")).toContain("application/manifest+json");
    expect(await response.json()).toEqual(PRODUCTION_MANIFEST);
  });

  it("points a preview build at the blue icons", async () => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_ENV", "preview");
    const manifest = await GET().json();
    expect(manifest.icons.map((icon: { src: string }) => icon.src)).toEqual([
      "/web-app-manifest-preview-192x192.png",
      "/web-app-manifest-preview-512x512.png",
    ]);
  });
});
