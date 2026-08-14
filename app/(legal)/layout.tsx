import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

/**
 * Pages légales (mentions, CGU, confidentialité, cookies) — accessibles sans
 * compte, d'où leur présence dans PUBLIC_ROUTES du proxy. Elles partagent le
 * chrome du site public depuis MIN-73 : même navigation, même pied de page (dont
 * la colonne « Légal » qui remplace l'ancienne navigation croisée). Seule la
 * colonne de texte leur est propre.
 *
 * `Analytics` et `SpeedInsights` vivent ICI, pas au layout racine (MIN-323).
 *
 * Ils installent des `PerformanceObserver` et un écouteur de navigation sur tout
 * ce qu'ils couvrent. Au layout racine, ils tournaient dans l'app authentifiée —
 * qui n'en a pas l'usage : sa mesure d'audience passe par PostHog, et ses écrans
 * ne sont pas des pages publiques dont on optimise le Web Vital.
 *
 * Contrepartie assumée : plus de pageviews Vercel sur l'app connectée. C'est
 * exactement ce qu'on cherchait — la mesure suit les pages publiques.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <MarketingNav />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-6 py-10">{children}</main>
      <MarketingFooter />
      <Analytics />
      <SpeedInsights />
    </div>
  );
}
