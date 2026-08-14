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

/* ── Ce qui allume les safe areas ─────────────────────────────────────────────
   Sans cet export, Next sert son viewport par défaut — `width=device-width,
   initial-scale=1`, sans `viewport-fit`. Or `viewport-fit: auto` cale la fenêtre
   DANS la zone sûre : la page ne passe jamais sous l'encoche ni sous la barre
   d'indicateur d'accueil, et par conséquent **tous les `env(safe-area-inset-*)`
   valent 0**. Le dépôt en écrit sept — la pilule de navigation mobile et le
   dégagement qu'elle réserve (`--mobile-nav-height`, app/globals.css), le FAB de
   Numo, le bandeau de nouvelle version, le tiroir de la nav marketing, le
   panneau de l'assistant — et pas un seul ne mesurait quoi que ce soit.

   `cover` rend la page à fond perdu et redonne aux insets leur vraie valeur :
   c'est la ligne qui met en service tout ce travail déjà écrit. Ce qui touche un
   bord de l'écran doit donc, à partir d'ici, porter son inset — voir le bloc des
   safe areas dans app/globals.css pour les surfaces de mangue-ui.

   On ne touche NI à `maximumScale` NI à `userScalable` : brider le zoom est un
   défaut d'accessibilité, et aucun des correctifs ci-dessus n'en a besoin.

   `interactiveWidget` répond à l'autre moitié du problème : le clavier. Par
   défaut (`resizes-visual`), le clavier logiciel ne rétrécit QUE la fenêtre
   visuelle — le viewport de mise en page garde sa hauteur, donc un pied de page
   ancré en `fixed` reste calé sur un bas d'écran qui n'est plus visible, et
   passe DERRIÈRE le clavier. C'est le cas des deux composers du produit (pull
   request, session d'agent), ceux-là mêmes que `.dock-above-nav` remonte déjà
   au-dessus de la barre mobile dans app/globals.css. `resizes-content` rétrécit
   le viewport de mise en page : `h-dvh` du shell suit, et le composer remonte
   avec le clavier au lieu de disparaître dessous. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations("Meta"), getLocale()]);
  return {
    // Base des URLs relatives (canonical, OpenGraph) — sans elle, les pages
    // publiques déclarent des `og:url` relatives, que les crawlers ignorent.
    metadataBase: new URL(SITE_URL),
    // `default` applies to pages without their own title; `template` wraps
    // per-page titles set by nested (server) layouts, e.g. "Inbox · minddy".
    title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
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

  // Ce provider n'envoie au navigateur que les quatre namespaces du site public
  // au lieu des 67 du catalogue : les messages sont une PROP de composant
  // client, donc du flux RSC inline, donc 39 Ko gzippés de plus à télécharger
  // avant l'image du LCP (MIN-100).
  //
  // **Toujours les mêmes, quelle que soit la route.** Ce layout choisissait
  // autrefois entre catalogue réduit et catalogue complet selon un en-tête posé
  // par le proxy sur les pages marketing — mais un layout partagé n'est PAS
  // re-rendu lors d'une navigation cliente : partie de la landing, la page
  // `/login` héritait des quatre namespaces du marketing et affichait
  // « Auth.signIn » jusqu'au premier rechargement. Un jeu de messages dérivé de
  // la requête est figé au premier document ; il ne peut donc dépendre que de ce
  // qui est vrai partout.
  //
  // Les segments qui traduisent ailleurs montent `FullCatalogMessages`.
  const clientMessages = publicClientMessages(messages);

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
          <NextIntlClientProvider messages={clientMessages}>
            {/* La bande par laquelle on déplace la fenêtre de l'app de bureau
                (MIN-292). Ici, et pas dans un shell : c'est la seule position du
                dépôt d'où elle couvre TOUTES les configurations. Un audit en
                avait trouvé cinq sans aucune prise — mode zen, pages légales,
                board public `/f/`, page publiée `/p/`, vue partagée `/share/`,
                plus `not-found` — parce que les prises vivaient dans l'en-tête
                et la barre latérale, c'est-à-dire dans les deux meubles que ces
                écrans n'ont pas.

                **AVANT `{children}`, et ce n'est pas cosmétique** : Chromique
                calcule les régions déplaçables en parcourant l'arbre de mise en
                page dans l'ordre, et un `no-drag` rencontré PLUS TARD creuse le
                `drag` rencontré avant. Placée en dernier, la bande reprendrait
                aux boutons de l'en-tête le trou qu'ils viennent de se creuser.

                Hors app de bureau, `globals.css` la laisse en `display: none` :
                elle ne coûte rien à un navigateur. */}
            <div aria-hidden className="desktop-drag-band" />
            {children}
            {/* Marque le document dans l'app de bureau (MIN-291) : c'est ce que
                lisent les zones de déplacement de la fenêtre, qui n'ont pas
                d'autre source possible que la page. Ne rend rien. */}
            <DesktopChrome />
            <LazyToaster />
            <CookieBanner />
            {/* PostHog (MIN-78). Monté ici, donc actif PARTOUT — y compris sur
                les pages publiques (landing, board de feedback, vues partagées),
                c'est là que se joue l'acquisition. Ne rend rien et n'enveloppe
                rien : il charge le client à l'idle et le dépose dans
                `lib/analytics.ts`, ce qui garde `posthog-js` hors du bundle
                initial (MIN-94). L'init est différée et cookieless tant que le
                bandeau n'a pas été tranché — voir le composant. */}
            <PostHogInit />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
