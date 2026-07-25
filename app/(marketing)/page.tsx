import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase-server";
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
  const t = await getTranslations("Landing");
  return {
    // `absolute` : le titre porte déjà la marque, le template « %s · minddy »
    // du layout racine la répéterait.
    title: { absolute: t("metaTitle") },
    description: t("metaDescription"),
    alternates: { canonical: "/" },
    openGraph: {
      title: t("metaTitle"),
      description: t("metaDescription"),
      url: "/",
      type: "website",
    },
  };
}

export default async function LandingPage() {
  // Un visiteur déjà connecté qui tape minddy.app veut son app, pas l'argumentaire.
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/home");

  return (
    <>
      <StructuredData />
      <LandingViewed />
      {/* Fond de page : posé ici et non dans le hero pour qu'il parte du haut
          du document et passe derrière la navbar. Il s'ancre sur le
          `relative isolate` du layout marketing (<main> n'est pas positionné). */}
      <HeroShader />
      <Hero />
      {/* Six sections de contenu au lieu de neuf, dans l'ordre de la
          démonstration : le produit d'abord (c'est un vrai tracker), la vitesse
          ensuite (peu de gestes, pas seulement peu d'écrans), l'IA en troisième
          (elle s'y branche, elle ne le remplace pas), puis ce qui entre depuis
          l'extérieur, puis le rappel que le reste est déjà là.
          L'ancienne page ouvrait sur quatre sections d'IA — dont trois
          racontaient le même geste — et ne montrait le tracker qu'en 8ᵉ
          position, sous un titre « Tout ce qu'il faut. Rien de plus. » que tout
          ce qui précédait contredisait. */}
      <SectionTracker />
      <SectionSpeed />
      <SectionAgents />
      <SectionFeedback />
      <SectionMore />
      <SectionPricingTeaser />
      <SectionFaq />
      <SectionCta />
    </>
  );
}
