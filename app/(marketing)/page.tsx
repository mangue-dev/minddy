import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { Hero } from "@/components/marketing/hero";
import { SectionWorkflow } from "@/components/marketing/section-workflow";
import { SectionAgents } from "@/components/marketing/section-agents";
import { SectionFeatures } from "@/components/marketing/section-features";
import { SectionPricingTeaser } from "@/components/marketing/section-pricing-teaser";
import { SectionFaq } from "@/components/marketing/section-faq";
import { SectionCta } from "@/components/marketing/section-cta";

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
      <Hero />
      <SectionWorkflow />
      <SectionAgents />
      <SectionFeatures />
      <SectionPricingTeaser />
      <SectionFaq />
      <SectionCta />
    </>
  );
}
