import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { publicPageMetadata } from "@/lib/seo";
import { getVisibleDocumentation, isDocumentationPreview } from "@/lib/server/documentation";
import { PageStructuredData } from "@/components/marketing/structured-data";
import { DocumentationWelcome } from "@/components/documentation/documentation-welcome";

export async function generateMetadata(): Promise<Metadata> {
  const metadata = await publicPageMetadata({ routeKey: "documentation", locale: await getLocale() as Locale });
  return isDocumentationPreview() ? { ...metadata, robots: { index: false, follow: false } } : metadata;
}

export default async function DocumentationPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const locale = await getLocale() as Locale;
  const params = await searchParams;
  return <>
    {!isDocumentationPreview() && <PageStructuredData routeKey="documentation" breadcrumbName={(await getTranslations("Documentation"))("title")} />}
    <DocumentationWelcome articles={getVisibleDocumentation(locale)} locale={locale} preview={isDocumentationPreview()}
      query={typeof params.q === "string" ? params.q.slice(0, 200) : ""} />
  </>;
}
