import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { HeroShader } from "@/components/marketing/hero-shader";
import { Hero } from "@/components/marketing/hero";
import { SectionTracker } from "@/components/marketing/section-tracker";
import { SectionSpeed } from "@/components/marketing/section-speed";
import { SectionAgents } from "@/components/marketing/section-agents";
import { SectionFeedback } from "@/components/marketing/section-feedback";
import { SectionMore } from "@/components/marketing/section-more";
import { SectionPricingTeaser } from "@/components/marketing/section-pricing-teaser";
import { SectionFaq } from "@/components/marketing/section-faq";
import { SectionCta } from "@/components/marketing/section-cta";
import { StructuredData } from "@/components/marketing/structured-data";
import { LandingViewed } from "@/components/marketing/landing-viewed";

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({ routeKey: "home", locale: (await getLocale()) as Locale });
}

/**
 * Le rebond « déjà connecté → /home » a déménagé dans `proxy.ts` (MIN-88).
 * Ici, il coûtait un `auth.getUser()` : un aller-retour RÉSEAU vers GoTrue
 * avant le premier octet de la landing, et une page que le CDN ne pouvait pas
 * mettre en cache (mesuré en prod : `cache-control: private, no-store`,
 * `x-vercel-cache: MISS` à chaque appel). Le middleware fait la même chose en
 * vérifiant la signature du JWT localement, et il s'exécute AVANT le cache :
 * les connectés sont redirigés, les autres reçoivent la page mise en cache.
 */
export default async function LandingPage() {
  return (
    <>
      <StructuredData />
      <LandingViewed />
      {/* Fond de page : posé ici et non dans le hero pour qu'il parte du haut
          du document et passe derrière la navbar. Il s'ancre sur le
          `relative isolate` du layout marketing (<main> n'est pas positionné). */}
      <HeroShader />
      <Hero />
      {/* Six sections de contenu, dans l'ordre de la démonstration : le hero
          promet la boucle agent, le tracker rassure aussitôt (« et dessous,
          c'est un vrai tracker »), la section Agents prouve la promesse, la
          vitesse suit, puis ce qui entre depuis l'extérieur, puis le rappel que
          le reste est déjà là.
          Agents est passée devant Speed (MIN-148) : la preuve doit suivre la
          promesse, pas attendre deux sections. Le menu « Produit » de la nav se
          lit comme le plan de cette page, il suit le même ordre. */}
      <SectionTracker />
      <SectionAgents />
      <SectionSpeed />
      <SectionFeedback />
      <SectionMore />
      <SectionPricingTeaser />
      <SectionFaq />
      <SectionCta />
    </>
  );
}
