import type { AppEnv } from "@/lib/env";

/**
 * The installed app's icons per environment (MIN-720). Preview installs get
 * the blue variant, like the preview favicon (`app/icon.tsx`), so a preview
 * PWA on a home screen or dock is never mistaken for production. Production
 * and local development keep the neutral images.
 *
 * The `any` icons carry their own rounded light plate; the `maskable` one is
 * full-bleed with the mark inside the safe zone, so a platform that crops
 * icons to its own shape (Android, Chrome on macOS) never cuts the mark.
 */
export function pwaIcons(env: AppEnv) {
  const preview = env === "preview" ? "-preview" : "";
  return {
    manifest: [
      { src: `/web-app-manifest${preview}-192x192.png`, sizes: "192x192", purpose: "any" },
      { src: `/web-app-manifest${preview}-512x512.png`, sizes: "512x512", purpose: "any" },
      { src: `/web-app-manifest${preview}-maskable-512x512.png`, sizes: "512x512", purpose: "maskable" },
    ],
    /** File in `public/`, served by `app/apple-icon.tsx`. */
    apple: `apple-icon${preview}.png`,
  };
}
