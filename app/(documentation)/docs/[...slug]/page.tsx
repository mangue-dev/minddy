import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { locales, type Locale } from "@/i18n/config";
import { documentationPath } from "@/lib/documentation-core.mjs";
import { getVisibleDocumentation, getLegacyDocumentationRoute, isDocumentationPreview } from "@/lib/server/documentation";
import { socialMetadata } from "@/lib/seo";
import { DocumentationArticleView } from "@/components/documentation/documentation-article";
import { DocumentationLegacyLocation } from "@/components/documentation/documentation-legacy-location";

type Props = { params: Promise<{ slug: string[] }> };

async function resolveArticle({ params }: Props) {
  const { slug } = await params;
  if (slug.length !== 1) notFound();
  const locale = await getLocale() as Locale;
  const route = getLegacyDocumentationRoute(slug[0]);
  const article = getVisibleDocumentation(locale).find(item => item.id === (route?.article ?? slug[0]));
  if (!article) notFound();
  return { article, legacyId: slug[0], route };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { article, legacyId } = await resolveArticle(props);
  const canonical = documentationPath(article.id, article.locale);
  return { title: article.title, description: article.summary,
    alternates: { canonical, languages: { ...Object.fromEntries(locales.map(locale => [locale, documentationPath(article.id, locale)])), "x-default": documentationPath(article.id, "en") } },
    robots: { index: !isDocumentationPreview() && legacyId === article.id, follow: !isDocumentationPreview() },
    ...socialMetadata({ title: article.title, description: article.summary, url: canonical, locale: article.locale }),
  };
}

export default async function ArticlePage(props: Props) {
  const { article, legacyId, route } = await resolveArticle(props);
  return <>
    {route && legacyId !== article.id && <DocumentationLegacyLocation id={legacyId} locale={article.locale} route={route} />}
    <DocumentationArticleView article={article} articles={getVisibleDocumentation(article.locale)} />
  </>;
}
