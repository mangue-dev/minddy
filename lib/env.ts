/**
 * Which deployment environment the app is running in, and the accent colors
 * used to make each one visually distinct (favicon + env badge).
 *
 * `VERCEL_ENV` is a server-only system var on Vercel, so `next.config.mjs`
 * bridges it into the public `NEXT_PUBLIC_VERCEL_ENV` — that lets client
 * components (the sidebar badge) read it too. Neither is set during local
 * `next dev`, so that case resolves to "development".
 *
 *   production  → neutral (no badge)   www.minddy.app
 *   preview     → blue                 preview.minddy.app + PR previews
 *   development → pink                 localhost
 */
export type AppEnv = "production" | "preview" | "development";

export interface AppEnvironment {
  NEXT_PUBLIC_VERCEL_ENV?: string;
  VERCEL_ENV?: string;
  NODE_ENV?: string;
}

/** Pure resolution: Vercel refines production/preview, Node covers any other host. */
export function resolveAppEnv(env: AppEnvironment): AppEnv {
  const v = env.NEXT_PUBLIC_VERCEL_ENV ?? env.VERCEL_ENV;
  if (v === "production") return "production";
  if (v === "preview") return "preview";
  if (env.NODE_ENV === "production") return "production";
  return "development";
}

export function getAppEnv(): AppEnv {
  return resolveAppEnv(process.env);
}

/**
 * Favicon mark colors per environment, one value for light browser chrome and
 * one for dark (the generated icon embeds a `prefers-color-scheme` rule). Used
 * by app/icon.tsx. Production keeps the neutral near-black / near-white mark.
 */
export const FAVICON_COLORS: Record<AppEnv, { light: string; dark: string }> = {
  production: { light: "#0a0a0a", dark: "#fafafa" },
  preview: { light: "#2563eb", dark: "#60a5fa" }, // blue-600 / blue-400
  development: { light: "#db2777", dark: "#f472b6" }, // pink-600 / pink-400
};
