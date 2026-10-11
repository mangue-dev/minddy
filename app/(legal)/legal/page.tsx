import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { LegalContent } from "@/components/legal/legal-content";

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({ routeKey: "legal", locale: (await getLocale()) as Locale });
}

export default async function LegalPage() {
  return <LegalContent locale={(await getLocale()) as Locale} />;
}
