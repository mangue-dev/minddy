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

export function getAppEnv(): AppEnv {
  const v = process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV;
  if (v === "production") return "production";
  if (v === "preview") return "preview";
  return "development";
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

/**
 * Tailwind text-color classes that tint the brand logo mark to match the
 * current environment (the mark is `fill="currentColor"`). Empty in production
 * so the logo keeps its inherited color; blue in preview, pink locally — same
 * hues as FAVICON_COLORS, with the lighter shade for dark mode.
 */
export const ENV_LOGO_TINT: Record<AppEnv, string> = {
  production: "",
  preview: "text-blue-600 dark:text-blue-400",
  development: "text-pink-600 dark:text-pink-400",
};

/**
 * Le mot posé à côté du brandmark dans la barre latérale, qui se lit comme la
 * suite du logo. `null` en production : la marque y est seule, sans mention.
 *
 * Volontairement hors des catalogues i18n — ce sont les noms d'environnement de
 * Vercel, des identifiants techniques identiques en français et en anglais, au
 * même titre qu'un numéro de version. Ils ne sortent jamais en production.
 */
export const ENV_LABEL: Record<AppEnv, string | null> = {
  production: null,
  preview: "preview",
  development: "dev",
};
