/**
 * The entry of the server-choice page shipped inside the desktop app
 * (MIN-781). `scripts/build-desktop.mjs` bundles it, without Next.js, into
 * `desktop/dist/welcome/`, which the shell serves from `minddy-app://welcome/`.
 *
 * Only the `DesktopWelcome` namespace of each catalog is imported, by name, so
 * the bundle carries a few kilobytes of copy rather than six full catalogs.
 */
import { createRoot } from "react-dom/client";
import { IntlProvider } from "next-intl";
import { DesktopWelcome as de } from "@/messages/de.json";
import { DesktopWelcome as en } from "@/messages/en.json";
import { DesktopWelcome as es } from "@/messages/es.json";
import { DesktopWelcome as fr } from "@/messages/fr.json";
import { DesktopWelcome as it } from "@/messages/it.json";
import { DesktopWelcome as ptBR } from "@/messages/pt-BR.json";
import { resolveServerChoiceLocale, serverChoiceEnvironmentFromSearch } from "@/lib/desktop/server-choice";
import type { Locale } from "@/i18n/config";
import { DesktopServerChoice } from "./server-choice";

const CATALOGS: Record<Locale, typeof en> = { en, fr, de, es, it, "pt-BR": ptBR };

// No account, so no saved theme: follow the system, live.
const dark = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () => document.documentElement.classList.toggle("dark", dark.matches);
applyTheme();
dark.addEventListener("change", applyTheme);

// The window buttons' corner, as the server pages' pre-paint script marks it
// (`lib/theme-script.ts`): the logo clears the macOS buttons from frame one.
const platform = (window as { minddy?: { platform?: string } }).minddy?.platform;
if (platform === "darwin" || platform === "win32" || platform === "linux") {
  document.documentElement.setAttribute("data-desktop-platform", platform);
}

const locale = resolveServerChoiceLocale(navigator.languages);
document.documentElement.lang = locale;
document.title = CATALOGS[locale].selfHostHeading;

createRoot(document.getElementById("root")!).render(
  <IntlProvider locale={locale} messages={{ DesktopWelcome: CATALOGS[locale] }}>
    <DesktopServerChoice env={serverChoiceEnvironmentFromSearch(location.search)} />
  </IntlProvider>,
);
