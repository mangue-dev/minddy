/**
 * The entry of the pages bundled in the mobile app (MIN-907).
 * `scripts/build-mobile.mjs` bundles it, without Next.js, into `mobile/www/`,
 * which Capacitor copies into the app.
 *
 * Only the namespaces these pages read are imported from each catalog, by
 * name, so the bundle carries a few kilobytes of copy rather than six full
 * catalogs.
 */
import { createRoot } from "react-dom/client";
import { IntlProvider } from "next-intl";
import { DesktopWelcome as deWelcome, MobileShell as deShell, ServerUnavailable as deUnavailable } from "@/messages/de.json";
import { DesktopWelcome as enWelcome, MobileShell as enShell, ServerUnavailable as enUnavailable } from "@/messages/en.json";
import { DesktopWelcome as esWelcome, MobileShell as esShell, ServerUnavailable as esUnavailable } from "@/messages/es.json";
import { DesktopWelcome as frWelcome, MobileShell as frShell, ServerUnavailable as frUnavailable } from "@/messages/fr.json";
import { DesktopWelcome as itWelcome, MobileShell as itShell, ServerUnavailable as itUnavailable } from "@/messages/it.json";
import { DesktopWelcome as ptBRWelcome, MobileShell as ptBRShell, ServerUnavailable as ptBRUnavailable } from "@/messages/pt-BR.json";
import { resolveServerChoiceLocale } from "@/lib/desktop/server-choice";
import type { Locale } from "@/i18n/config";
import { MobileShell, type MobileShellScreen } from "./shell";

/** The keys of `DesktopWelcome` the server form shares with the desktop page. */
const pickWelcome = ({ serverLabel, serverInvalid, connect, useCloud, back }: typeof enWelcome) => ({
  serverLabel,
  serverInvalid,
  connect,
  useCloud,
  back,
});

const CATALOGS: Record<Locale, { MobileShell: typeof enShell; ServerUnavailable: typeof enUnavailable; DesktopWelcome: ReturnType<typeof pickWelcome> }> = {
  en: { MobileShell: enShell, ServerUnavailable: enUnavailable, DesktopWelcome: pickWelcome(enWelcome) },
  fr: { MobileShell: frShell, ServerUnavailable: frUnavailable, DesktopWelcome: pickWelcome(frWelcome) },
  de: { MobileShell: deShell, ServerUnavailable: deUnavailable, DesktopWelcome: pickWelcome(deWelcome) },
  es: { MobileShell: esShell, ServerUnavailable: esUnavailable, DesktopWelcome: pickWelcome(esWelcome) },
  it: { MobileShell: itShell, ServerUnavailable: itUnavailable, DesktopWelcome: pickWelcome(itWelcome) },
  "pt-BR": { MobileShell: ptBRShell, ServerUnavailable: ptBRUnavailable, DesktopWelcome: pickWelcome(ptBRWelcome) },
};

// No account, so no saved theme: follow the system, live.
const dark = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () => document.documentElement.classList.toggle("dark", dark.matches);
applyTheme();
dark.addEventListener("change", applyTheme);

const locale = resolveServerChoiceLocale(navigator.languages);
document.documentElement.lang = locale;

const screen: MobileShellScreen = document.documentElement.dataset.screen === "offline" ? "offline" : "server";

createRoot(document.getElementById("root")!).render(
  <IntlProvider locale={locale} messages={CATALOGS[locale]}>
    <MobileShell screen={screen} />
  </IntlProvider>,
);
