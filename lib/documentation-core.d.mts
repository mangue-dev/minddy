import type { DocumentationArticle, DocumentationSearchEntry } from "./documentation";
import type { Locale } from "../i18n/config";
export const documentationLocales: Locale[];
export const documentationRoots: Record<Locale, string>;
export function documentationPath(id: string | null, locale: Locale | string): string;
export function resolveDocumentationPath(pathname: string): { locale: Locale; id: string | null } | null;
export function localizeDocumentationLink(href: string | undefined, locale: Locale): string | undefined;
export function parseDocumentation(raw: string): DocumentationArticle;
export function documentationBlocks(content: string): { id: string | null; title: string | null; level: number; content: string }[];
export function normalizeDocumentationText(text: string): string;
export function isPublishedDocumentation(article: DocumentationArticle, variants: DocumentationArticle[]): boolean;
export interface DocumentationSearchResult {
  id: string; title: string; summary: string; href: string; excerpt: string; score: number;
}
export function searchDocumentation(articles: DocumentationSearchEntry[], query: string, limit?: number): DocumentationSearchResult[];
