/** Shared publication rules for the server loader and the offline checker. */
export const documentationLocales = ["en", "fr", "de", "es", "it", "pt-BR"];
export const documentationRoots = {
  en: "/docs", fr: "/fr/documentation", de: "/de/dokumentation",
  es: "/es/documentacion", it: "/it/documentazione", "pt-BR": "/pt-br/documentacao",
};

export function documentationPath(id, locale) {
  return `${documentationRoots[locale]}${id ? `/${id}` : ""}`;
}

export function resolveDocumentationPath(pathname) {
  for (const [locale, root] of Object.entries(documentationRoots)) {
    if (pathname === root) return { locale, id: null };
    if (pathname.startsWith(`${root}/`)) {
      const id = pathname.slice(root.length + 1);
      if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return { locale, id };
    }
  }
  return null;
}

/** Preserve query parameters and stable section IDs across locale changes. */
export function localizeDocumentationLink(href, locale) {
  if (typeof href !== "string" || !href.startsWith("/")) return href;
  const boundary = href.search(/[?#]/);
  const pathname = boundary < 0 ? href : href.slice(0, boundary);
  const route = resolveDocumentationPath(pathname);
  return route ? documentationPath(route.id, locale) + (boundary < 0 ? "" : href.slice(boundary)) : href;
}

/** JSON frontmatter keeps nested review and figure metadata unambiguous. */
export function parseDocumentation(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error("Expected JSON frontmatter followed by Markdown.");
  const metadata = JSON.parse(match[1]);
  const content = match[2].trim();
  const sections = documentationBlocks(content).filter(block => block.id)
    .map(({ level, title, id }) => ({ level, title, id }));
  return { ...metadata, content, sections };
}

/** Parsing and rendering share a fence-aware section scanner. */
export function documentationBlocks(content) {
  const blocks = [];
  let block = { id: null, title: null, level: 0, content: "" };
  let fence = null;
  for (const line of content.split(/\r?\n/)) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if (marker && !fence) fence = marker[1];
    else if (marker && fence && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
    else if (!fence) {
      const heading = line.match(/^(#{2,3}) (.+) \{#([a-z0-9-]+)\}$/);
      if (heading) {
        if (block.content.trim() || block.id) blocks.push({ ...block, content: block.content.trim() });
        block = { id: heading[3], title: heading[2], level: heading[1].length, content: "" };
        continue;
      }
      if (/^#{1,6} /.test(line)) throw new Error(`Heading needs a stable section ID: ${line}`);
    }
    block.content += `${line}\n`;
  }
  if (block.content.trim() || block.id) blocks.push({ ...block, content: block.content.trim() });
  return blocks;
}

export function normalizeDocumentationText(text) {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function nonemptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function currentDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

/** A draft or an incomplete release set cannot leak into any public consumer. */
export function isPublishedDocumentation(article, variants) {
  const source = variants.find(item => item.id === article.id && item.locale === "en");
  if (!source) return false;
  return documentationLocales.every(locale => {
    if (variants.filter(item => item.id === article.id && item.locale === locale).length !== 1) return false;
    const variant = variants.find(item => item.id === article.id && item.locale === locale);
    return variant?.visibility === "public" && variant?.status === "published"
      && [variant.title, variant.summary, variant.topic, variant.owner, variant.compatibility?.version].every(nonemptyText)
      && currentDate(variant.updatedAt)
      && Number.isInteger(variant.revision) && variant.revision > 0
      && variant.sourceRevision === source.revision
      && variant.review?.revision === variant.revision
      && nonemptyText(variant.review?.fact) && nonemptyText(variant.review?.language) && currentDate(variant.review?.date)
      && variant.sections?.length > 0
      && JSON.stringify(variant.sections.map(section => section.id)) === JSON.stringify(source.sections?.map(section => section.id))
      && (variant.requiredFigures ?? []).every(id => variant.figures?.some(figure => figure.id === id && figure.reviewed && figure.revision === variant.revision))
      && (variant.figures ?? []).every(figure => figure.revision === variant.revision
        && figure.reviewed && figure.alt && figure.caption && figure.src);
  });
}

/** All query terms must match; titles, headings and summaries carry more weight. */
export function searchDocumentation(articles, query, limit = articles.length) {
  const tokens = [...new Set(normalizeDocumentationText(query).split(/\s+/).filter(Boolean))];
  if (!tokens.length) return [];
  return articles.flatMap(article => {
    const title = normalizeDocumentationText([article.title, ...(article.tags ?? [])].join(" "));
    const summary = normalizeDocumentationText(article.summary);
    const body = normalizeDocumentationText(article.content);
    const blocks = documentationBlocks(article.content);
    const headings = normalizeDocumentationText(blocks.map(block => block.title ?? "").join(" "));
    if (!tokens.every(token => `${title} ${summary} ${body}`.includes(token))) return [];
    const score = tokens.reduce((sum, token) => sum + (title.includes(token) ? 12 : 0)
      + (headings.includes(token) ? 8 : 0) + (summary.includes(token) ? 5 : 0) + (body.includes(token) ? 1 : 0), 0);
    const rankedPassages = blocks.map(block => ({ ...block, score: tokens.filter(token => normalizeDocumentationText(`${block.title ?? ""} ${block.content}`).includes(token)).length }))
      .sort((a, b) => b.score - a.score);
    const passage = rankedPassages[0]?.score ? rankedPassages[0].content : article.summary;
    const section = rankedPassages[0]?.score ? rankedPassages[0].id : null;
    const excerpt = passage.replace(/^#{2,3} .+\n/gm, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`*_{}]/g, "").replace(/\s+/g, " ").trim();
    return [{ id: article.id, title: article.title, summary: article.summary,
      href: documentationPath(article.id, article.locale) + (section ? `#${section}` : ""),
      excerpt: excerpt.length > 240 ? `${excerpt.slice(0, 237)}…` : excerpt, score }];
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, Math.max(0, limit));
}
