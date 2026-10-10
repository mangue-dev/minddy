import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button, cn } from "mangue-ui";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { ReadOnlyCodeBlock } from "@/components/assistant/shared-code-renderer";
import { CARD_TONES } from "@/components/marketing/card-tones";
import type { DocumentationArticle } from "@/lib/documentation";
import { documentationBlocks, documentationPath, localizeDocumentationLink } from "@/lib/documentation-core.mjs";
import { extractCodeBlock } from "@/lib/markdown-code";
import { DocumentationShell } from "./documentation-shell";
import { DocumentationErrorReport } from "./report-error";
import { DocumentationIcon } from "./documentation-icon";
import { DocumentationImage } from "./documentation-image";
import { DocumentationDiagram } from "./documentation-diagram";
import { DocumentationTable } from "./documentation-table";
import { documentationInlineCodeClassName } from "./documentation-inline-text";
import { localizedHref } from "@/lib/locale-href";

const articleNavigationClassName = "group flex min-w-0 flex-col gap-3 rounded-lg border border-current/10 p-4 transition-colors hover:border-current/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export async function DocumentationArticleView({ article, articles }: { article: DocumentationArticle; articles: DocumentationArticle[] }) {
  const t = await getTranslations({ locale: article.locale, namespace: "Documentation" });
  const tPages = await getTranslations({ locale: article.locale, namespace: "Pages" });
  const chunks = documentationBlocks(article.content);
  const related = articles.filter(item => article.related.includes(item.id));
  const topicArticles = articles.filter(item => item.topic === article.topic);
  const articleIndex = topicArticles.findIndex(item => item.id === article.id);
  const previous = articleIndex > 0 ? topicArticles[articleIndex - 1] : undefined;
  const next = articleIndex >= 0 ? topicArticles[articleIndex + 1] : undefined;
  const installRoute = article.id === "installation" ? "team" : article.id === "install-locally" ? "local" : null;
  return <DocumentationShell articles={articles} locale={article.locale} currentId={article.id}
    title={article.title} topic={article.topic} sections={article.sections}>
    <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{article.title}</h1>
    <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{article.summary}</p>
    {article.status === "draft" && <p className="mt-4 rounded-lg border border-border bg-muted p-3 text-sm" role="status">{t("draftPreview")}</p>}
    {installRoute && <div className={cn("mt-6 rounded-lg p-5", CARD_TONES.sky)}>
      <p className="text-sm leading-6">{t("installReferenceIntro")}</p>
      <Button asChild className="mt-4 h-auto min-h-11 max-w-full whitespace-normal text-left">
        <Link href={`${localizedHref("/self-hosting/install", article.locale)}?route=${installRoute}`} prefetch={false}>
          {t("installWizardAction")}<HugeiconsIcon icon={ArrowRight01Icon} className="size-4 shrink-0" aria-hidden />
        </Link>
      </Button>
    </div>}
    <div className="text-base leading-7 break-words [&_p]:my-4 [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-2 [&_a]:underline [&_a]:underline-offset-4 [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4">
      {chunks.map((chunk, index) => {
        return <section key={chunk.id ?? index} id={chunk.id ?? undefined} tabIndex={-1} className="scroll-mt-40 sm:scroll-mt-32 xl:scroll-mt-24">
          {chunk.id && (chunk.level === 2 ? <h2 className="mt-10 text-2xl font-semibold">{chunk.title}</h2> : <h3 className="mt-6 text-xl font-semibold">{chunk.title}</h3>)}
          <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
            p: ({ node, children }) => node?.children.length === 1 && node.children[0].type === "element" && node.children[0].tagName === "img"
              ? <div>{children}</div> : <p>{children}</p>,
            a: ({ href, children }) => <a href={localizeDocumentationLink(href, article.locale)}>{children}</a>,
            code: ({ children }) => <code className={documentationInlineCodeClassName}>{children}</code>,
            pre: ({ node, children }) => {
              const block = extractCodeBlock(node);
              return block ? <ReadOnlyCodeBlock code={block.code} language={block.language || undefined} className="my-5 text-sm" />
                : <pre className="my-5 overflow-x-auto rounded-lg bg-muted p-4 text-sm">{children}</pre>;
            },
            table: ({ children }) => <DocumentationTable label={chunk.title ?? article.title}>{children}</DocumentationTable>,
            img: ({ src, alt }) => {
              const figure = article.figures.find(item => item.src === src);
              if (figure?.kind === "diagram" && figure.diagram) return <DocumentationDiagram figure={{ ...figure, diagram: figure.diagram }} />;
              return typeof src === "string" ? <DocumentationImage src={src} alt={figure?.alt ?? alt ?? ""}
                width={figure?.viewport[0]} height={figure?.viewport[1]} caption={figure?.caption} openLabel={tPages("imageOpen")} /> : null;
            },
          }}>{chunk.content}</ReactMarkdown>
        </section>;
      })}
    </div>
    {!!related.length && <section className="mt-12 border-t border-border pt-6">
      <h2 className="font-semibold">{t("related")}</h2>
      <ul className="mt-3 flex flex-wrap gap-2">{related.map(item => <li key={item.id} className="max-w-full">
        <Button asChild variant="outline" className="h-auto min-h-11 max-w-full justify-start whitespace-normal text-left">
          <Link href={documentationPath(item.id, article.locale)} prefetch={false}>
            <DocumentationIcon articleId={item.id} className="size-4 shrink-0" /><span className="min-w-0">{item.title}</span>
          </Link>
        </Button>
      </li>)}</ul>
    </section>}
    {(previous || next) && <nav aria-label={t("articleNavigation")} className="mt-8 grid grid-cols-1 gap-3 border-t border-border pt-6 sm:grid-cols-2">
      {previous && <Link href={documentationPath(previous.id, article.locale)} prefetch={false} rel="prev"
        className={cn(articleNavigationClassName, CARD_TONES.sky)}>
        <span className="flex items-center gap-2 text-xs opacity-80"><HugeiconsIcon icon={ArrowLeft01Icon} className="size-4 shrink-0" aria-hidden />{t("previousArticle")}</span>
        <span className="flex items-start gap-2 text-sm font-medium"><DocumentationIcon articleId={previous.id} className="mt-0.5 size-4 shrink-0" /><span>{previous.title}</span></span>
      </Link>}
      {next && <Link href={documentationPath(next.id, article.locale)} prefetch={false} rel="next"
        className={cn(articleNavigationClassName, CARD_TONES.mint, "items-end text-right sm:col-start-2")}>
        <span className="flex items-center gap-2 text-xs opacity-80">{t("nextArticle")}<HugeiconsIcon icon={ArrowRight01Icon} className="size-4 shrink-0" aria-hidden /></span>
        <span className="flex items-start gap-2 text-sm font-medium"><DocumentationIcon articleId={next.id} className="mt-0.5 size-4 shrink-0" /><span>{next.title}</span></span>
      </Link>}
    </nav>}
    <DocumentationErrorReport articleId={article.id} locale={article.locale}
      label={t("report")} />
  </DocumentationShell>;
}
