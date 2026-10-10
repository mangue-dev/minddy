import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { publicPageMetadata } from "@/lib/seo";
import { getVisibleDocumentation, isDocumentationPreview } from "@/lib/server/documentation";
import { DocumentationWelcome } from "@/components/documentation/documentation-welcome";

export async function generateMetadata(): Promise<Metadata> {
  const metadata = await publicPageMetadata({ routeKey: "documentation", locale: await getLocale() as Locale });
  return isDocumentationPreview() ? { ...metadata, robots: { index: false, follow: false } } : metadata;
}

export default async function DocumentationPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const locale = await getLocale() as Locale;
  const params = await searchParams;
  return <DocumentationWelcome articles={getVisibleDocumentation(locale)} locale={locale} preview={isDocumentationPreview()}
    query={typeof params.q === "string" ? params.q.slice(0, 200) : ""} />;
}
