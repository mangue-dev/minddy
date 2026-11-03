import "server-only";
import type { Locale } from "@/i18n/config";
import { COMPARISON_FEATURES, COMPARISON_FEATURE_GUIDES } from "@/lib/comparisons";
import { documentationPath } from "@/lib/documentation-core.mjs";
import { getDocumentationArticle } from "@/lib/server/documentation";

export interface ComparisonGuide {
  id: string;
  /** The guide's localized title, used as descriptive link text. */
  title: string;
  /** Site-relative canonical path of the guide in this locale. */
  path: string;
}

/**
 * The published guides behind a comparison page's feature claims, in feature
 * order. A guide that is not published in this locale is left out, so a draft
 * never becomes a broken public link.
 */
export function comparisonGuides(locale: Locale): ComparisonGuide[] {
  return COMPARISON_FEATURES.flatMap((feature) => {
    const id = (COMPARISON_FEATURE_GUIDES as Partial<Record<string, string>>)[feature];
    const article = id ? getDocumentationArticle(id, locale) : null;
    return article ? [{ id: article.id, title: article.title, path: documentationPath(article.id, locale) }] : [];
  });
}
