import "server-only";

import fs from "node:fs";
import path from "node:path";
import type { Locale } from "@/i18n/config";
import { documentationPath, normalizeDocumentationText, searchDocumentation } from "@/lib/documentation-core.mjs";
import { getPublishedDocumentation } from "@/lib/server/documentation";

export type KnowledgeAudience = "end-user" | "developer" | "both";

export interface KnowledgeArticle {
  id: string;
  title: string;
  summary: string;
  category: string;
  audience: KnowledgeAudience;
  tags: string[];
  lastReviewed: string;
  content: string;
  sourceUrl?: string;
  revision?: number;
}

const CONTENT_DIR = path.join(process.cwd(), "content", "knowledge");
const AUDIENCES: ReadonlySet<KnowledgeAudience> = new Set(["end-user", "developer", "both"]);

let cache: KnowledgeArticle[] | null = null;
let topicList: string | null = null;

function parseFrontmatter(raw: string): { data: Record<string, unknown>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw.trim() };
  const data: Record<string, unknown> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const entry = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/);
    if (!entry) continue;
    const [, key, rawValue] = entry;
    const value = rawValue.trim();
    data[key] =
      value.startsWith("[") && value.endsWith("]")
        ? value
            .slice(1, -1)
            .split(",")
            .map((item) => item.trim().replace(/^["']|["']$/g, ""))
            .filter(Boolean)
        : value.replace(/^["']|["']$/g, "");
  }
  return { data, body: match[2].trim() };
}

function loadKnowledge(): KnowledgeArticle[] {
  if (cache) return cache;
  const articles: KnowledgeArticle[] = [];
  const index = new Map<string, KnowledgeArticle>();
  const files = fs
    .readdirSync(CONTENT_DIR)
    .filter((file) => file.endsWith(".md") && file.toLowerCase() !== "readme.md");

  for (const file of files) {
    const { data, body } = parseFrontmatter(fs.readFileSync(path.join(CONTENT_DIR, file), "utf8"));
    const id = String(data.id ?? "");
    const audience = data.audience as KnowledgeAudience;
    if (!id || id !== file.slice(0, -3) || !data.title || !data.summary || !AUDIENCES.has(audience)) {
      console.error(`[knowledge] Skipping invalid article: ${file}`);
      continue;
    }
    const article: KnowledgeArticle = {
      id,
      title: String(data.title),
      summary: String(data.summary),
      category: String(data.category ?? "general"),
      audience,
      tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
      lastReviewed: String(data.lastReviewed ?? ""),
      content: body,
    };
    if (index.has(id)) continue;
    articles.push(article);
    index.set(id, article);
  }

  if (articles.length === 0) throw new Error(`No valid knowledge articles found at ${CONTENT_DIR}.`);
  articles.sort((a, b) => a.id.localeCompare(b.id));
  cache = articles;
  return articles;
}

export function getKnowledgeArticle(query: string, locale: Locale = "en"): KnowledgeArticle | null {
  const normalized = query.toLowerCase().trim();
  if (!normalized) return null;
  const official = getPublishedDocumentation(locale);
  const exactOfficial = official.find(article => article.id === normalized || article.aliases.includes(normalized));
  if (exactOfficial) return asKnowledgeArticle(exactOfficial);
  const hit = searchDocumentation(official, query, 1)[0];
  if (hit) return asKnowledgeArticle(official.find(article => article.id === hit.id)!);
  const available = getKnowledgeArticles(locale);
  const exact = available.find(article => article.id === normalized);
  if (exact) return exact;
  const tokens = normalizeDocumentationText(normalized).split(/\s+/).filter(Boolean);
  let best: { article: KnowledgeArticle; score: number } | null = null;
  for (const article of available) {
    const topicText = normalizeDocumentationText([article.id, article.title, ...article.tags].join(" "));
    const contentText = normalizeDocumentationText(article.content);
    const score = tokens.reduce(
      (total, token) =>
        total +
        (token.length > 2 && topicText.includes(token) ? 5 : 0) +
        (token.length > 2 && contentText.includes(token) ? 1 : 0),
      0,
    );
    if (score > 0 && (!best || score > best.score)) best = { article, score };
  }
  return best?.article ?? null;
}

export function getKnowledgeTopicList(locale: Locale = "en"): string {
  const official = getPublishedDocumentation(locale);
  if (official.length) return getKnowledgeArticles(locale)
    .map(article => `- **${article.title}** (topic: \`${article.id}\`): ${article.summary}`).join("\n");
  if (topicList) return topicList;
  topicList = loadKnowledge()
    .map((article) => `- **${article.title}** (topic: \`${article.id}\`): ${article.summary}`)
    .join("\n");
  return topicList;
}

/** Metadata catalog or at most four relevant sources for bounded FAQ retrieval. */
export function getKnowledgeArticles(locale: Locale = "en", query?: string): KnowledgeArticle[] {
  const official = getPublishedDocumentation(locale);
  const migrated = new Set(official.flatMap(article => [article.id, ...article.aliases]));
  const articles = [...official.map(asKnowledgeArticle), ...loadKnowledge().filter(article => !migrated.has(article.id))];
  if (!query) return articles;
  const tokens = normalizeDocumentationText(query).split(/\s+/).filter(token => token.length > 2);
  return articles.map(article => ({ article, score: tokens.reduce((score, token) => score
    + (normalizeDocumentationText(`${article.title} ${article.summary} ${article.tags.join(" ")}`).includes(token) ? 5 : 0)
    + (normalizeDocumentationText(article.content).includes(token) ? 1 : 0), 0) }))
    .filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 4).map(item => item.article);
}

function asKnowledgeArticle(article: ReturnType<typeof getPublishedDocumentation>[number]): KnowledgeArticle {
  return { id: article.id, title: article.title, summary: article.summary, category: article.topic,
    audience: article.audiences.some(audience => ["member", "owner", "visitor"].includes(audience)) ? "both" : "developer",
    tags: article.tags, lastReviewed: article.review.date!, content: article.content,
    sourceUrl: documentationPath(article.id, article.locale), revision: article.revision };
}
