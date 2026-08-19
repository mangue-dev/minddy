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

/** The product edition selected by Cloud Ops or a self-hosted operator. */
export type DeploymentEdition = "cloud" | "self-hosted";

export interface DeploymentEditionEnvironment {
  MINDDY_EDITION?: string;
}

export interface LegacyCloudDiagnosticEnvironment extends DeploymentEditionEnvironment {
  NEXT_PUBLIC_APP_URL?: string;
  VERCEL?: string;
}

/**
 * Resolves the edition without consulting a hostname, Vercel metadata, or
 * another hosting characteristic. Omitting the variable is intentionally the
 * conservative self-hosted configuration.
 */
export function resolveDeploymentEdition(
  env: DeploymentEditionEnvironment,
): DeploymentEdition {
  const value = env.MINDDY_EDITION?.trim();
  if (!value || value === "self-hosted") return "self-hosted";
  if (value === "cloud") return "cloud";
  throw new Error(
    `Invalid MINDDY_EDITION=${JSON.stringify(value)}; expected cloud or self-hosted.`,
  );
}

/** Server-side edition of the running instance. */
export function getDeploymentEdition(): DeploymentEdition {
  return resolveDeploymentEdition({ MINDDY_EDITION: process.env.MINDDY_EDITION });
}

/**
 * Temporary migration diagnostic for the former Cloud deployment shape. It
 * never changes the edition or enables a capability; it only tells Cloud Ops
 * to set the explicit replacement before a deployment loses its legacy defaults.
 */
export function legacyCloudProfileDiagnostic(
  env: LegacyCloudDiagnosticEnvironment,
): string | null {
  if (env.MINDDY_EDITION?.trim() || env.VERCEL?.trim() !== "1") return null;
  try {
    const host = new URL(env.NEXT_PUBLIC_APP_URL ?? "").hostname.toLowerCase();
    if (host === "minddy.app" || host.endsWith(".minddy.app")) {
      return "MINDDY_EDITION is unset on a legacy Minddy Cloud-shaped deployment; set MINDDY_EDITION=cloud explicitly.";
    }
  } catch {
    // An absent or invalid public URL is handled by the public-site validation.
  }
  return null;
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
