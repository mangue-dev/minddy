/**
 * Where the desktop app chooses its server (MIN-781).
 *
 * The desktop app starts on minddy Cloud, like the web. Self-hosting is chosen
 * on a web page of the app, `components/desktop/server-choice.tsx`, built with
 * the product's components and catalogs but **shipped inside the desktop app**
 * and served from the app's own `minddy-app://welcome/`: it works without a
 * network, so a local or self-hosted setup never depends on Cloud being
 * reachable to choose or change its server. **Self-host minddy** under the
 * auth forms, the menu and Settings open it.
 *
 * Only that document may use the `serverChoice` bridge: the main process
 * checks the sender's URL with `isServerChoiceDocument` before every call. A
 * page of any server, Cloud included, never reaches it.
 */

import { locales, type Locale } from "@/i18n/config";
import type { AppEnv } from "@/lib/env";

export const SERVER_CHOICE_SCHEME = "minddy-app";
export const SERVER_CHOICE_HOST = "welcome";
export const SERVER_CHOICE_ORIGIN = `${SERVER_CHOICE_SCHEME}://${SERVER_CHOICE_HOST}`;

/**
 * The environment whose colour the page's logo takes, like the sign-in screen
 * of the server the window shows (`ENV_LOGO_TINT`): a local server is
 * development, a `preview.` host or a Vercel preview is preview, anything else
 * production. Read by the page from its URL, so the first frame has it.
 */
export function serverChoiceEnvironment(origin: string): AppEnv {
  try {
    const { hostname } = new URL(origin);
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") return "development";
    if (hostname.startsWith("preview.") || hostname.endsWith(".vercel.app")) return "preview";
  } catch {
    // An unreadable origin keeps the neutral production mark.
  }
  return "production";
}

export function serverChoiceUrl(origin: string): string {
  return `${SERVER_CHOICE_ORIGIN}/?env=${serverChoiceEnvironment(origin)}`;
}

/** The environment from the page's own query, allowlisted. */
export function serverChoiceEnvironmentFromSearch(search: string): AppEnv {
  const env = new URLSearchParams(search).get("env");
  return env === "development" || env === "preview" ? env : "production";
}

/** The sender is the app's own server-choice document, not any server's page. */
export function isServerChoiceDocument(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === `${SERVER_CHOICE_SCHEME}:` && parsed.host === SERVER_CHOICE_HOST;
  } catch {
    return false;
  }
}

/** The files the scheme serves, by path; anything else is a 404. */
export const SERVER_CHOICE_FILES: Record<string, { file: string; type: string }> = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/welcome.js": { file: "welcome.js", type: "text/javascript; charset=utf-8" },
  "/welcome.css": { file: "welcome.css", type: "text/css; charset=utf-8" },
  "/inter-latin.woff2": { file: "inter-latin.woff2", type: "font/woff2" },
};

/** What the page needs to know to draw itself. */
export interface DesktopServerChoiceState {
  /** The selected origin; minddy Cloud's when none is. */
  origin: string;
  /** minddy Cloud's origin, for the links the page opens in the browser. */
  cloudOrigin: string;
  isCustomServer: boolean;
  /** Shown only; the folder never travels from the page. */
  installFolder: string;
  /** An installation runs: a reloaded page shows its progress, not a new form. */
  installRunning: boolean;
  /** The release the installer clones, e.g. `0.20.1`. */
  release: string;
}

/**
 * The page's language: the first system language minddy supports, by
 * language then region (`fr-CA` reads French, any Portuguese reads
 * Brazilian Portuguese, the only Portuguese catalog), else English. There is
 * no account yet, so no saved preference to read.
 */
export function resolveServerChoiceLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const language = tag.toLowerCase().split(/[-_]/)[0];
    if (language === "pt") return "pt-BR";
    const match = locales.find((locale) => locale === language);
    if (match) return match;
  }
  return "en";
}

/**
 * The public installation wizard on its server path, per locale. Copied from
 * `PUBLIC_ROUTES` rather than imported: that table pulls the documentation
 * index into a page meant to stay small. `server-choice.test.ts` fails when
 * the two drift apart.
 */
export const SERVER_GUIDE_PATHS: Record<Locale, string> = {
  en: "/self-hosting/install",
  fr: "/fr/auto-hebergement/installer",
  de: "/de/selbst-hosten/installieren",
  es: "/es/autoalojamiento/instalar",
  it: "/it/hosting-autonomo/installa",
  "pt-BR": "/pt-br/auto-hospedagem/instalar",
};

export function serverGuideUrl(cloudOrigin: string, locale: Locale): string {
  return `${cloudOrigin}${SERVER_GUIDE_PATHS[locale]}?route=team`;
}
