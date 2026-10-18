import type { AppEnv } from "@/lib/env";

/**
 * The installed app's icons per environment (MIN-720). Preview installs get
 * the blue variant, like the preview favicon (`app/icon.tsx`), so a preview
 * PWA on a home screen or dock is never mistaken for production. Production
 * and local development keep the neutral images.
 */
export function pwaIcons(env: AppEnv) {
  const preview = env === "preview" ? "-preview" : "";
  return {
    manifest: [
      { src: `/web-app-manifest${preview}-192x192.png`, sizes: "192x192" },
      { src: `/web-app-manifest${preview}-512x512.png`, sizes: "512x512" },
    ],
    /** File in `public/`, served by `app/apple-icon.tsx`. */
    apple: `apple-icon${preview}.png`,
  };
}
