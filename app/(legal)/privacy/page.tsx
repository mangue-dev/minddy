import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { PrivacyContent } from "@/components/legal/privacy-content";

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({ routeKey: "privacy", locale: (await getLocale()) as Locale });
}

export default async function PrivacyPage() {
  return <PrivacyContent locale={(await getLocale()) as Locale} />;
}
