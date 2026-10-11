import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { TermsContent } from "@/components/legal/terms-content";

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({ routeKey: "terms", locale: (await getLocale()) as Locale });
}

export default async function TermsPage() {
  return <TermsContent locale={(await getLocale()) as Locale} />;
}
