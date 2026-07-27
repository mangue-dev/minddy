import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, Instrument_Serif } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { ThemeProvider, Toaster } from "mangue-ui";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { CookieBanner } from "@/components/cookie-banner";
import { PostHogProvider } from "@/components/posthog-provider";
import { ThemeInitScript } from "@/components/theme-init-script";
import { SITE_URL, SITE_VERIFICATION } from "@/lib/site";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: "italic",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations("Meta"), getLocale()]);
  return {
    // Base des URLs relatives (canonical, OpenGraph) — sans elle, les pages
    // publiques déclarent des `og:url` relatives, que les crawlers ignorent.
    metadataBase: new URL(SITE_URL),
    // `default` applies to pages without their own title; `template` wraps
    // per-page titles set by nested (server) layouts, e.g. "Inbox · minddy".
    title: { default: "minddy", template: "%s · minddy" },
    description: t("description"),
    // Défauts de partage (MIN-88). Next DÉRIVE `twitter:*` d'`openGraph`, mais
    // il ne dérive rien de ce qui n'existe pas : sans ces défauts, une page qui
    // ne déclare pas son propre bloc — les quatre pages légales, /login —
    // partait sans la moindre vignette. `lib/seo.ts` les remplace page par page
    // sur les six routes publiques ; ceci est le filet pour tout le reste.
    openGraph: {
      type: "website",
      siteName: "minddy",
      locale: locale === "fr" ? "fr_FR" : "en_US",
      url: SITE_URL,
      title: "minddy",
      description: t("description"),
    },
    twitter: {
      card: "summary_large_image",
      title: "minddy",
      description: t("description"),
    },
    // Propriété du site dans Google Search Console / Bing Webmaster Tools.
    // Les clés à chaîne vide sont omises : tant que le jeton n'est pas collé
    // dans `lib/site.ts`, aucune balise vide n'est servie.
    verification: {
      ...(SITE_VERIFICATION.google ? { google: SITE_VERIFICATION.google } : {}),
      ...(SITE_VERIFICATION.bing
        ? { other: { "msvalidate.01": SITE_VERIFICATION.bing } }
        : {}),
    },
    // Renders <meta name="apple-mobile-web-app-title" content="minddy" />.
    // The favicon/icon/manifest tags are auto-wired from the files in app/
    // (favicon.ico, icon0.svg, icon1.png, apple-icon.png, manifest.json).
    appleWebApp: { title: "minddy" },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [locale, messages, headerList] = await Promise.all([
    getLocale(),
    getMessages(),
    headers(),
  ]);

  // Pages publiques anonymes (board de feedback, vues partagées) : le proxy pose
  // ce header pour qu'elles suivent la préférence système au lieu d'être forcées
  // en dark comme l'app interne (MIN-60).
  const defaultTheme = headerList.get("x-minddy-public") === "1" ? "system" : "dark";

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Thème appliqué AVANT le premier paint. Injecté hors de l'arbre React
            (useServerInsertedHTML) : un <script> rendu par un composant fait
            râler React 19 à chaque re-rendu client du root layout — voir le
            composant. */}
        <ThemeInitScript defaultTheme={defaultTheme} />
      </head>
      <body
        className={`${inter.variable} ${instrumentSerif.variable} antialiased`}
      >
        <ThemeProvider defaultTheme={defaultTheme}>
          <NextIntlClientProvider messages={messages}>
            {/* PostHog (MIN-78). Englobe TOUT — y compris les pages publiques
                (landing, board de feedback, vues partagées) : c'est là que se
                joue l'acquisition. L'init est différée et cookieless tant que le
                bandeau n'a pas été tranché — voir le composant. */}
            <PostHogProvider>
              {children}
              <Toaster />
              <CookieBanner />
            </PostHogProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
