import "server-only";
import type { Locale } from "@/i18n/config";
import type { DocumentationArticle, DocumentationFigure } from "@/lib/documentation";
import { documentationBlocks, documentationLocales, documentationPath, resolveDocumentationPath, searchDocumentation } from "@/lib/documentation-core.mjs";
import { documentationMarkdownPath, resolveDocumentationDelivery } from "@/lib/documentation-delivery";
import { getLegacyDocumentationRoute, getPublishedDocumentation } from "@/lib/server/documentation";
import { SITE_URL } from "@/lib/site";

const url = (path: string) => new URL(path, SITE_URL).href;

/** Keep the index small; full procedures are fetched from individual articles. */
export function renderDocumentationIndex(articles: DocumentationArticle[], locale: Locale, query = ""): string {
  const root = documentationPath(null, locale);
  const lines = [
    "# Minddy documentation",
    "> Official guides for using, integrating, and operating Minddy. Read the relevant procedure before acting.",
    `Language: \`${locale}\`. Only published, reviewed articles are included.`,
    "Choose the article and section that match the task. Check prerequisites, permissions, edition, installation profile, and documented version. Candidate behavior and engineering workarounds are not released guarantees. Cite the canonical HTML URL and stable section fragment.",
    `Each article is available at its HTML URL with \`.md\` appended, or with \`Accept: text/markdown\`. Search this index using \`${url(`${root}/index.md`)}?q=<URL-encoded terms>\`. Search requires every term and returns matching sections; it does not translate queries. An empty result does not establish that a capability is unavailable.`,
    "## Entry points",
    `- [Documentation home](${url(root)}): Browse or search in a browser.`,
    `- [Markdown index](${url(documentationMarkdownPath(null, locale))}): All published articles, or search with \`q\`.`,
    `- [MCP reference](${url("/llms-full.txt")}): Tool parameters and integration contracts; OAuth is required to act on account data, not to read these docs.`,
    "## Languages",
    ...documentationLocales.map(language => `- [${language}](${url(`${documentationPath(null, language)}/llms.txt`)}): Documentation index in \`${language}\`.`),
  ];
  if (query) {
    const results = searchDocumentation(articles, query);
    lines.push("## Search results", `Query: ${JSON.stringify(query)}`);
    if (!results.length) lines.push("No matching published articles. Try fewer terms or browse the article list.");
    for (const hit of results) {
      const fragment = new URL(hit.href, SITE_URL).hash;
      lines.push(`- [${hit.title}](${url(documentationMarkdownPath(hit.id, locale))}${fragment}): ${hit.excerpt}`);
    }
  } else {
    for (const topic of [...new Set(articles.map(article => article.topic))].sort()) {
      lines.push(`## ${topic}`);
      for (const article of articles.filter(item => item.topic === topic)) {
        lines.push(`- [${article.title}](${url(documentationMarkdownPath(article.id, locale))}): ${article.summary}`);
      }
    }
  }
  return lines.join("\n\n") + "\n";
}

function renderFigure(figure: DocumentationFigure, original: string): string {
  const diagram = figure.kind === "diagram" ? figure.diagram : undefined;
  if (!diagram) return `${original}\n\n${figure.caption}`;
  const lines = [diagram.title ? `**${diagram.title}**` : figure.alt];
  for (const [index, item] of (diagram.items ?? []).entries()) {
    lines.push(`${diagram.layout === "sequence" ? `${index + 1}.` : "-"} ${item.title}${item.detail ? `: ${item.detail}` : ""}`);
  }
  for (const column of diagram.columns ?? []) {
    lines.push(`\n**${column.title}**`, ...column.items.map((item, index) => `${index + 1}. ${item}`));
  }
  if (diagram.headers && diagram.rows) {
    const cell = (value: string) => value.replace(/\|/g, "\\|").replace(/\n/g, " ");
    lines.push(`| ${diagram.headers.map(cell).join(" | ")} |`,
      `| ${diagram.headers.map(() => "---").join(" | ")} |`,
      ...diagram.rows.map(row => `| ${row.map(cell).join(" | ")} |`));
  }
  if (diagram.note) lines.push("", diagram.note);
  lines.push("", figure.caption);
  return lines.join("\n");
}

function articleLink(href: string, article: DocumentationArticle): string {
  if (href.startsWith("#")) return url(documentationPath(article.id, article.locale)) + href;
  const parsed = new URL(href, SITE_URL);
  const route = parsed.origin === new URL(SITE_URL).origin ? resolveDocumentationPath(parsed.pathname) : null;
  if (route) {
    const legacy = route.id ? getLegacyDocumentationRoute(route.id) : undefined;
    if (legacy) parsed.hash = legacy.sections[parsed.hash.slice(1)] ?? (parsed.hash ? parsed.hash : legacy.section);
    return url(documentationMarkdownPath(legacy?.article ?? route.id, article.locale)) + parsed.search + parsed.hash;
  }
  return parsed.href;
}

/** Transform prose only; executable examples and inline code remain verbatim. */
function renderBody(content: string, article: DocumentationArticle): string {
  let fence: string | null = null;
  return content.split("\n").map(line => {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if (marker && !fence) { fence = marker[1]; return line; }
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      return line;
    }
    return line.replace(/(`+)(.*?)\1|(!?)\[([^\]]*)\]\(([^\s)]+)\)/g,
      (original, code: string | undefined, _literal: string, image: string, label: string, href: string) => {
        if (code) return original;
        if (image) {
          const figure = article.figures.find(item => item.src === href);
          const markdown = `![${figure?.alt ?? label}](${url(href)})`;
          return figure ? renderFigure(figure, markdown) : markdown;
        }
        return `[${label}](${articleLink(href, article)})`;
      });
  }).join("\n");
}

export function renderDocumentationArticle(article: DocumentationArticle, articles: DocumentationArticle[]): string {
  const canonical = url(documentationPath(article.id, article.locale));
  return [
    `# ${article.title}`, `> ${article.summary}`,
    `Canonical: ${canonical}\nLanguage: \`${article.locale}\`\nUpdated: ${article.updatedAt}\nDocumented version: ${article.compatibility.version}\nEditions: ${article.compatibility.editions.join(", ")}\nProfiles: ${article.compatibility.profiles.join(", ")}\nAudience: ${article.audiences.join(", ")}`,
    `Index: ${url(`${documentationPath(null, article.locale)}/llms.txt`)}`,
    "## Contents",
    article.sections.map(section => `${section.level === 3 ? "  " : ""}- [${section.title}](${canonical}#${section.id})`).join("\n"),
    ...documentationBlocks(article.content).map(block => [
      ...(block.id ? [`${"#".repeat(block.level)} ${block.title} {#${block.id}}`] : []),
      renderBody(block.content, article),
    ].join("\n\n")),
    ...(article.related.length ? ["## Related articles", articles.filter(item => article.related.includes(item.id))
      .map(item => `- [${item.title}](${url(documentationMarkdownPath(item.id, article.locale))}): ${item.summary}`).join("\n")] : []),
  ].join("\n\n") + "\n";
}

export function documentationMarkdownResponse(requestUrl: string): Response {
  const requested = new URL(requestUrl);
  const route = resolveDocumentationDelivery(requested.pathname);
  if (!route) return new Response("Not found", { status: 404 });
  const articles = getPublishedDocumentation(route.locale);
  const legacy = route.id ? getLegacyDocumentationRoute(route.id) : undefined;
  const article = route.id ? articles.find(item => item.id === (legacy?.article ?? route.id) || item.aliases.includes(route.id!)) : null;
  if (route.id && !article) return new Response("Not found", { status: 404 });
  const canonical = url(documentationPath(article?.id ?? null, route.locale));
  const query = route.format === "index" ? "" : (requested.searchParams.get("q") ?? "").trim().slice(0, 200);
  return new Response(article ? renderDocumentationArticle(article, articles) : renderDocumentationIndex(articles, route.locale, query), {
    headers: {
      "Content-Type": route.format === "index" ? "text/plain; charset=utf-8" : "text/markdown; charset=utf-8",
      "Content-Language": route.locale,
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
      Vary: "Accept",
      Link: `<${canonical}>; rel="canonical", <${url(`${documentationPath(null, route.locale)}/llms.txt`)}>; rel="describedby"`,
      "X-Robots-Tag": "noindex, follow",
    },
  });
}
