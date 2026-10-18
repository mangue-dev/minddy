import { getAppEnv } from "@/lib/env";
import { pwaIcons } from "@/lib/pwa-icons";

/**
 * The web app manifest, at the `/manifest.json` URL installed apps and
 * `proxy.ts` already know. A route rather than the static file so its icons
 * follow the environment (MIN-720); like the favicon, it is generated once
 * per build, with the environment baked in.
 */
export const dynamic = "force-static";

export function GET() {
  const manifest = {
    id: "/",
    name: "minddy",
    short_name: "minddy",
    description: "An open-source issue tracker and project workspace with objectives, cycles, user feedback and coding agents.",
    lang: "en",
    start_url: "/home",
    scope: "/",
    icons: pwaIcons(getAppEnv()).manifest.map((icon) => ({
      ...icon,
      type: "image/png",
      purpose: "any maskable",
    })),
    screenshots: [
      {
        src: "/pwa-install-narrow.png",
        sizes: "720x1200",
        type: "image/png",
        form_factor: "narrow",
        label: "A minddy board and an agent working through an issue",
      },
    ],
    theme_color: "#ffffff",
    background_color: "#ffffff",
    display: "standalone",
  };
  return Response.json(manifest, {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
