import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { locales, type Locale } from "@/i18n/config";
import { documentationPath } from "@/lib/documentation-core.mjs";
import { getVisibleDocumentation, isDocumentationPreview } from "@/lib/server/documentation";
import { socialMetadata } from "@/lib/seo";
import { DocumentationArticleView } from "@/components/documentation/documentation-article";

type Props = { params: Promise<{ slug: string[] }> };

async function resolveArticle({ params }: Props) {
  const { slug } = await params;
  if (slug.length !== 1) notFound();
  const locale = await getLocale() as Locale;
  const article = getVisibleDocumentation(locale).find(item => item.id === slug[0]);
  if (!article) notFound();
  return article;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const article = await resolveArticle(props);
  const canonical = documentationPath(article.id, article.locale);
  return { title: article.title, description: article.summary,
    alternates: { canonical, languages: { ...Object.fromEntries(locales.map(locale => [locale, documentationPath(article.id, locale)])), "x-default": documentationPath(article.id, "en") } },
    robots: { index: !isDocumentationPreview(), follow: !isDocumentationPreview() },
    ...socialMetadata({ title: article.title, description: article.summary, url: canonical, locale: article.locale }),
  };
}

export default async function ArticlePage(props: Props) {
  const article = await resolveArticle(props);
  return <DocumentationArticleView article={article} articles={getVisibleDocumentation(article.locale)} />;
}
