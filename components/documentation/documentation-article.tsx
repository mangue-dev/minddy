import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getTranslations } from "next-intl/server";
import type { DocumentationArticle } from "@/lib/documentation";
import { documentationBlocks, documentationPath, localizeDocumentationLink } from "@/lib/documentation-core.mjs";
import { DocumentationShell } from "./documentation-shell";
import { DocumentationErrorReport } from "./report-error";

export async function DocumentationArticleView({ article, articles }: { article: DocumentationArticle; articles: DocumentationArticle[] }) {
  const t = await getTranslations({ locale: article.locale, namespace: "Documentation" });
  const chunks = documentationBlocks(article.content);
  const related = articles.filter(item => article.related.includes(item.id));
  return <DocumentationShell articles={articles} locale={article.locale} currentId={article.id}
    title={article.title} topic={article.topic} sections={article.sections}>
    <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{article.title}</h1>
    <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{article.summary}</p>
    {article.status === "draft" && <p className="mt-4 rounded-lg border border-border bg-muted p-3 text-sm" role="status">{t("draftPreview")}</p>}
    <div className="text-base leading-7 break-words [&_p]:my-4 [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-2 [&_a]:underline [&_a]:underline-offset-4 [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_pre]:my-5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:text-sm [&_code]:break-words [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:text-[.9em]">
      {chunks.map((chunk, index) => {
        return <section key={chunk.id ?? index} id={chunk.id ?? undefined} tabIndex={-1} className="scroll-mt-40 sm:scroll-mt-32 xl:scroll-mt-24">
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
  </DocumentationShell>;
}
