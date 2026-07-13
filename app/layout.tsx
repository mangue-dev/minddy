import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, Instrument_Serif } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { ThemeProvider, Toaster } from "mangue-ui";
import { Analytics } from "@vercel/analytics/next";
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
  const t = await getTranslations("Meta");
  return {
    // `default` applies to pages without their own title; `template` wraps
    // per-page titles set by nested (server) layouts, e.g. "Inbox · minddy".
    title: { default: "minddy", template: "%s · minddy" },
    description: t("description"),
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
        {/* Applique le thème AVANT le premier paint — le ThemeProvider de
            mangue-ui ne le fait qu'en useEffect, d'où un flash light→dark à
            chaque chargement, surtout visible sur les pages publiques
            anonymes. Même logique que lui : localStorage "mangue-ui-theme",
            défaut piloté par le serveur ("dark" pour l'app, "system" pour le
            public). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("mangue-ui-theme")||"${defaultTheme}";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){document.documentElement.classList.toggle("dark",${
              defaultTheme === "system"
                ? `matchMedia("(prefers-color-scheme: dark)").matches`
                : "true"
            });}})();`,
          }}
        />
      </head>
      <body
        className={`${inter.variable} ${instrumentSerif.variable} antialiased`}
      >
        <ThemeProvider defaultTheme={defaultTheme}>
          <NextIntlClientProvider messages={messages}>
            {children}
            <Toaster />
          </NextIntlClientProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
