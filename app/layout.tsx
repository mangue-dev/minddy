import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Inter, Instrument_Serif } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { ThemeProvider } from "mangue-ui/components/theme-provider";
import { CookieBanner } from "@/components/cookie-banner";
import { DesktopChrome } from "@/components/desktop-chrome";
import { LazyToaster } from "@/components/lazy-toaster";
import { PostHogInit } from "@/components/posthog-init";
import { ThemeInitScript } from "@/components/theme-init-script";
import { publicClientMessages } from "@/lib/public-client-messages";
import { SITE_NAME, SITE_URL, SITE_VERIFICATION } from "@/lib/site";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: "italic",
  display: "swap",
});

/* ── What lights up the safe areas ────────────────────── ───────────────────────
   Without this export, Next serves its default viewport — `width=device-width,
   initial-scale=1`, sans `viewport-fit`. Or `viewport-fit: auto scales the window
   IN the safe zone: the page never passes under the notch or under the bar
   home indicator, and therefore **all `env(safe-area-inset-*)`
   are worth 0**. The filing writes seven — the mobile browsing pill and the
   clearance that it reserves (`--mobile-nav-height`, app/globals.css), the FOB of
   Numo, the new version banner, the nav marketing drawer, the
   wizard panel — and not a single one measured anything.

   `cover` makes the page full bleed and gives the insets their true value:
   this is the line that puts all this work already written into operation. What affects a
   edge of the screen must therefore, from here, carry its inset — see the block of
   safe areas in app/globals.css for mango-ui surfaces.

   We do not touch `maximumScale` NOR `userScalable`: restricting the zoom is a
   accessibility flaw, and none of the fixes above need it.

   `interactiveWidget` addresses the other half of the problem: the keyboard. By
   default (`resizes-visual`), the software keyboard ONLY shrinks the window
   visual — the layout viewport keeps its height, therefore a footer
   anchored in `fixed` remains stuck on a bottom of the screen which is no longer visible, and
   goes BEHIND the keyboard. This is the case for the two components of the product (sweater
   request, agent session), the same ones that `.dock-above-nav` already goes back to
   above the moving bar in app/globals.css. `resizes-content` shrinks
   the layout viewport: `h-dvh` of the shell follows, and the composer goes up
   with the keyboard instead of disappearing underneath. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations("Meta"), getLocale()]);
  return {
    // Base of relative URLs (canonical, OpenGraph) — without it, the pages
    // public declare relative `og:url`, which crawlers ignore.
    metadataBase: new URL(SITE_URL),
    // `default` applies to pages without their own title; `template` wraps
    // per-page titles set by nested (server) layouts, e.g. "Inbox · minddy".
    title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
    description: t("description"),
    // Sharing faults (MIN-88). Next DERIVES `twitter:*` from `openGraph`, but
    // nothing derives from what does not exist: without these defects, a page which
    // does not declare its own block — the four legal pages, /login —
    // left without the slightest sticker. `lib/seo.ts` replaces them page by page
    // on the six public roads; this is the net for everything else.
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
    // Site ownership in Google Search Console / Bing Webmaster Tools.
    // Empty string keys are omitted: until token is stuck
    // in `lib/site.ts`, no empty tag is served.
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

  // Anonymous public pages (feedback board, shared views): the proxy poses
  // this header so that they follow the system preference instead of being forced
  // to dark mode like the internal app (MIN-60).
  const defaultTheme = headerList.get("x-minddy-public") === "1" ? "system" : "dark";

  // This provider only sends the four namespaces of the public site to the browser
  // instead of the 67 in the catalog: the messages are a component PROP
  // client, therefore of the RSC inline flow, therefore 39 KB gzipped more to download
  // before the LCP image (MIN-100).
  //
  // **Always the same, whatever the road.** This layout chose
  // formerly between reduced catalog and complete catalog according to a header placed
  // by proxy on marketing pages — but a shared layout is NOT
  // re-rendered during customer navigation: part of the landing, the page
  // `/login` inherited the four marketing namespaces and displayed
  // “Auth.signIn” until the first reload. A set of messages derived from
  // the request is fixed at the first document; it can therefore only depend on this
  // which is true everywhere.
  //
  // Segments that translate elsewhere mount `FullCatalogMessages`.
  const clientMessages = publicClientMessages(messages);

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Theme applied BEFORE the first paint. Injected out of React tree
            (useServerInsertedHTML) : un <script> rendu par un composant fait
            complaining about React 19 every time the client re-renders the root layout — see the
            composant. */}
        <ThemeInitScript defaultTheme={defaultTheme} />
      </head>
      <body
        className={`${inter.variable} ${instrumentSerif.variable} antialiased`}
      >
        <ThemeProvider defaultTheme={defaultTheme}>
          <NextIntlClientProvider messages={clientMessages}>
            {/* The strip by which you move the desktop app window
                (MIN-292). Here, and not in a shell: this is the only position of
                repository from where it covers ALL configurations. An audit in
                had found five without any catch — zen mode, legal pages,
                public board `/f/`, published page `/p/`, shared view `/share/`,
                plus `not-found` — because the sockets lived in the header
                and the sidebar, that is to say in the two pieces of furniture that these
                screens do not have.

                **BEFORE `{children}`, and it's not cosmetic**: Chromic
                calculates draggable regions by traversing the layout tree
                page in order, and a `no-drag` encountered LATER digs the
                `drag` encountered before. Placed last, the tape would resume
                to the buttons of the header the hole they have just dug for themselves.

                Outside of the desktop app, `globals.css` leaves it in `display: none`:
                it costs a browser nothing. */}
            <div aria-hidden className="desktop-drag-band" />
            {children}
            {/* Mark the document in the desktop app (MIN-291): this is what
                read the window movement zones, which do not have
                other possible source than the page. Don't give anything back. */}
            <DesktopChrome />
            <LazyToaster />
            <CookieBanner />
            {/* PostHog (MIN-78). Mounted here, therefore active EVERYWHERE — including on
                public pages (landing, feedback board, shared views),
                this is where acquisition comes into play. Don't return anything and don't wrap
                nothing: it charges the client to the idle and drops it in
                `lib/analytics.ts`, ce qui garde `posthog-js` hors du bundle
                initial (MIN-94). The init is deferred and cookieless as long as the
                headband has not been sliced ​​— see component. */}
            <PostHogInit />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
