import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getTranslations } from "next-intl/server";
import type { DocumentationArticle } from "@/lib/documentation";
import { documentationBlocks, documentationPath, localizeDocumentationLink } from "@/lib/documentation-core.mjs";
import { ArticleLanguages } from "./article-languages";
import { DocumentationErrorReport } from "./report-error";

export async function DocumentationArticleView({ article, articles }: { article: DocumentationArticle; articles: DocumentationArticle[] }) {
  const t = await getTranslations({ locale: article.locale, namespace: "Documentation" });
  const chunks = documentationBlocks(article.content);
  const related = articles.filter(item => article.related.includes(item.id));
  const compatibilityLabel = (value: string) => {
    const key = ({ "self-hosted": "selfHostedEdition", web: "webProfile", mobile: "mobileProfile", desktop: "desktopProfile", full: "fullProfile", managed: "managedProfile", local: "localProfile", source: "sourceProfile" } as const)[value as "self-hosted" | "web" | "mobile" | "desktop" | "full" | "managed" | "local" | "source"];
    return key ? t(key) : value;
  };
  const compatibility = [...new Set([...article.compatibility.editions, ...article.compatibility.profiles].map(compatibilityLabel))];
  const articleNavigation = <nav aria-label={t("topics")} className="mt-4 space-y-4">{[...new Set(articles.map(item => item.topic))].map(topic => <div key={topic}>
            <p className="mb-2 text-xs font-semibold">{topic}</p><ul className="space-y-1">{articles.filter(item => item.topic === topic).map(item => <li key={item.id}>
              <a href={documentationPath(item.id, article.locale)} aria-current={item.id === article.id ? "page" : undefined}
                className="block rounded px-2 py-2 text-sm text-muted-foreground hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:text-foreground focus-visible:outline-2 focus-visible:outline-ring">{item.title}</a>
            </li>)}</ul>
          </div>)}</nav>;
  const contents = <ul className="space-y-2 text-sm">{article.sections.map(section => <li key={section.id} className={section.level === 3 ? "pl-3" : ""}>
    <a href={`#${section.id}`} className="block rounded py-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">{section.title}</a>
  </li>)}</ul>;
  return <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8">
    <a href="#documentation-article" className="sr-only z-50 rounded bg-background p-3 focus:not-sr-only focus:fixed focus:top-20">{t("skip")}</a>
    <nav aria-label={t("topics")} className="mb-6 text-sm"><a href={documentationPath(null, article.locale)} className="underline underline-offset-4">{t("title")}</a><span className="mx-2" aria-hidden>/</span>{article.topic}</nav>
    <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_13rem]">
      <aside>
        <details open className="hidden rounded-lg border border-border p-4 lg:block lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:overflow-auto">
          <summary className="cursor-pointer font-medium">{t("topics")}</summary>
          {articleNavigation}
        </details>
        <details className="rounded-lg border border-border p-4 lg:hidden"><summary className="cursor-pointer font-medium">{t("topics")}</summary>{articleNavigation}</details>
      </aside>
      <article id="documentation-article" tabIndex={-1} className="min-w-0 max-w-3xl scroll-mt-24">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{article.title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{article.summary}</p>
        {article.status === "draft" && <p className="mt-4 rounded-lg border border-border bg-muted p-3 text-sm" role="status">{t("draftPreview")}</p>}
        <div className="mt-5"><ArticleLanguages locale={article.locale} id={article.id} label={t("language")} /></div>
        <dl className="my-6 flex flex-wrap gap-x-6 gap-y-2 border-y border-border py-4 text-xs text-muted-foreground">
          {article.review.date && <div><dt className="font-medium">{t("reviewed")}</dt><dd><time dateTime={article.review.date}>{new Intl.DateTimeFormat(article.locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(article.review.date))}</time></dd></div>}
          <div><dt className="font-medium">{t("compatibility")}</dt><dd>{article.compatibility.version} · {compatibility.join(", ")}</dd></div>
        </dl>
        <details className="mb-6 rounded-lg border border-border p-4 xl:hidden"><summary className="cursor-pointer font-medium">{t("contents")}</summary><nav aria-label={t("contents")} className="mt-3">{contents}</nav></details>
        <div className="text-base leading-7 break-words [&_p]:my-4 [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-2 [&_a]:underline [&_a]:underline-offset-4 [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_pre]:my-5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:text-sm [&_code]:break-words [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:text-[.9em]">
          {chunks.map((chunk, index) => {
            return <section key={chunk.id ?? index} id={chunk.id ?? undefined} tabIndex={-1} className="scroll-mt-24">
              {chunk.id && (chunk.level === 2 ? <h2 className="mt-10 text-2xl font-semibold">{chunk.title}</h2> : <h3 className="mt-6 text-xl font-semibold">{chunk.title}</h3>)}
              <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
                a: ({ href, children }) => <a href={localizeDocumentationLink(href, article.locale)}>{children}</a>,
                table: ({ children }) => <div className="my-5 max-w-full overflow-x-auto rounded border border-border"><table className="w-full text-left text-sm [&_td]:border-t [&_td]:border-border [&_td]:p-3 [&_th]:bg-muted [&_th]:p-3">{children}</table></div>,
                img: ({ src, alt }) => {
                  const figure = article.figures.find(item => item.src === src);
                  return typeof src === "string" ? <span className="my-5 block"><a href={src} target="_blank" rel="noreferrer"><img src={src} alt={figure?.alt ?? alt ?? ""} loading="lazy" width={figure?.viewport[0]} height={figure?.viewport[1]} className="h-auto max-w-full rounded-lg border border-border" /></a>{figure && <span className="mt-2 block text-sm text-muted-foreground">{figure.caption}</span>}</span> : null;
                },
              }}>{chunk.content}</ReactMarkdown>
            </section>;
          })}
        </div>
        {!!related.length && <section className="mt-12 border-t border-border pt-6"><h2 className="font-semibold">{t("related")}</h2><ul className="mt-3 space-y-2">{related.map(item => <li key={item.id}><a href={documentationPath(item.id, article.locale)} className="underline underline-offset-4">{item.title}</a></li>)}</ul></section>}
        <DocumentationErrorReport subject={`${t("articleLabel")}: ${article.id} (${article.locale})`}
          body={`${t("articleLabel")}: ${article.id}\n${t("localeLabel")}: ${article.locale}\n${t("revisionLabel")}: ${article.revision}\n\n`}
          label={t("report")} />
      </article>
      <aside className="hidden xl:block"><nav aria-label={t("contents")} className="sticky top-24 max-h-[calc(100dvh-8rem)] overflow-auto"><p className="mb-3 font-medium">{t("contents")}</p>{contents}</nav></aside>
    </div>
  </div>;
}
