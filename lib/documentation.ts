import type { Locale } from "@/i18n/config";
export { documentationPath, documentationRoots, resolveDocumentationPath, normalizeDocumentationText, searchDocumentation } from "@/lib/documentation-core.mjs";

export type DocumentationAudience = "member" | "owner" | "visitor" | "operator" | "integrator";
export interface DocumentationFigure {
  id: string;
  kind?: "screenshot" | "diagram";
  src: string;
  alt: string;
  caption: string;
  revision: number;
  reviewed: boolean;
  capturedAt: string;
  viewport: [number, number];
  theme: "light" | "dark" | "neutral";
}
export interface DocumentationArticle {
  id: string;
  locale: Locale;
  title: string;
  summary: string;
  topic: string;
  type: "tutorial" | "guide" | "explanation" | "reference" | "troubleshooting";
  audiences: DocumentationAudience[];
  workflows: string[];
  visibility: "public" | "internal";
  status: "draft" | "published";
  revision: number;
  sourceRevision: number;
  owner: string;
  updatedAt: string;
  compatibility: { version: string; editions: string[]; profiles: string[]; evidence: string[] };
  review: { revision: number; fact: string | null; language: string | null; date: string | null };
  related: string[];
  aliases: string[];
  tags: string[];
  figures: DocumentationFigure[];
  requiredFigures: string[];
  content: string;
  sections: { id: string; title: string; level: number }[];
}
export type DocumentationSearchEntry = Pick<DocumentationArticle, "id" | "locale" | "title" | "summary" | "content" | "tags">;
