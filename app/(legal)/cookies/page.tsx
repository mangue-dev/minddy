import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { CookiesContent } from "@/components/legal/cookies-content";

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({ routeKey: "cookies", locale: (await getLocale()) as Locale });
}

export default async function CookiesPage() {
  return <CookiesContent locale={(await getLocale()) as Locale} />;
}
