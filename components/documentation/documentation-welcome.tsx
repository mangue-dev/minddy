import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, cn } from "mangue-ui";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import type { Locale } from "@/i18n/config";
import type { DocumentationArticle } from "@/lib/documentation";
import { documentationPath } from "@/lib/documentation-core.mjs";
import { localizedHref } from "@/lib/locale-href";
import { CARD_TONES } from "@/components/marketing/card-tones";
import { DocumentationShell } from "./documentation-shell";
import { DocumentationIcon } from "./documentation-icon";

/** The documentation entry is a reading guide inside the article layout. */
export async function DocumentationWelcome({ articles, locale, query = "", preview = false }: {
  articles: DocumentationArticle[]; locale: Locale; query?: string; preview?: boolean;
}) {
  const t = await getTranslations({ locale, namespace: "Documentation" });
  const guides = [
    { id: "use", title: t("use"), intro: t("welcomeUse"), tones: [CARD_TONES.sky, CARD_TONES.sage, CARD_TONES.butter], articles: [
      "choose-an-instance", "first-project", "navigation",
    ] },
    { id: "operate", title: t("operate"), intro: t("welcomeOperate"), tones: [CARD_TONES.lavender, CARD_TONES.mint, CARD_TONES.peach], articles: [
      "installation", "instance-configuration", "backups-and-restoration",
    ] },
    { id: "integrate", title: t("integrate"), intro: t("welcomeIntegrate"), tones: [CARD_TONES.rose, CARD_TONES.sky, CARD_TONES.lavender], articles: [
      "glossary-and-data-model", "architecture-and-data-flows", "minddy-mcp",
    ] },
  ];
  const sections = guides.map(({ id, title }) => ({ id, title, level: 2 }));
  return <DocumentationShell articles={articles} locale={locale} currentId={null} title={t("welcome")}
    topic={t("gettingStarted")} sections={sections} initialQuery={query}>
    <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("welcome")}</h1>
    <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{t("welcomeSummary")}</p>
    {preview && <p className="mt-4 rounded-lg border border-border bg-muted p-3 text-sm" role="status">{t("draftPreview")}</p>}
    {!articles.length && <p className="mt-8 text-muted-foreground">{t("empty")}</p>}
    {guides.map(guide => <section key={guide.id} id={guide.id} tabIndex={-1} className="@container mt-12 scroll-mt-40 sm:scroll-mt-32 xl:scroll-mt-24">
      <h2 className="text-xl font-semibold tracking-tight">{guide.title}</h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{guide.intro}</p>
      <ul className="mt-6 grid grid-cols-1 gap-4 @min-[26rem]:grid-cols-2 @min-[42rem]:grid-cols-3">
        {guide.articles.map((id, index) => {
          const article = articles.find(article => article.id === id);
          return article && <li key={article.id} className="min-w-0">
            <Link href={documentationPath(article.id, locale)} prefetch={false} aria-labelledby={`guide-${article.id}`}
              className="group block h-full rounded-lg focus-visible:outline-2 focus-visible:outline-ring">
              <Card className={cn("h-full gap-0 rounded-lg py-0 ring-current/10 group-hover:ring-current/25 group-focus-visible:ring-ring", guide.tones[index])}>
                <div className="flex h-28 shrink-0 items-start border-b border-current/10 p-5">
                  <DocumentationIcon articleId={article.id} className="size-5 opacity-80" />
                </div>
                <CardContent className="space-y-2 p-5">
                  <h3 id={`guide-${article.id}`} className="text-sm font-medium leading-5">{article.title}</h3>
                  <p className="text-[13px] leading-5 opacity-80">{article.summary}</p>
                </CardContent>
              </Card>
            </Link>
          </li>;
        })}
      </ul>
      {guide.id === "operate" && <Link href={localizedHref("/self-hosting", locale)} className="mt-5 inline-flex items-center gap-2 rounded text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        {t("selfHosting")}<HugeiconsIcon icon={ArrowRight01Icon} className="size-4" aria-hidden />
      </Link>}
    </section>)}
  </DocumentationShell>;
}
