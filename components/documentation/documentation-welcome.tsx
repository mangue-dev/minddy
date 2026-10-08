import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import type { DocumentationArticle } from "@/lib/documentation";
import { documentationPath } from "@/lib/documentation-core.mjs";
import { localizedHref } from "@/lib/locale-href";
import { DocumentationShell } from "./documentation-shell";

/** The documentation entry is a reading guide inside the article layout. */
export async function DocumentationWelcome({ articles, locale, query = "", preview = false }: {
  articles: DocumentationArticle[]; locale: Locale; query?: string; preview?: boolean;
}) {
  const t = await getTranslations({ locale, namespace: "Documentation" });
  const guides = [
    { id: "use", title: t("use"), intro: t("welcomeUse"), articles: ["choose-an-instance", "first-project", "navigation"] },
    { id: "operate", title: t("operate"), intro: t("welcomeOperate"), articles: ["self-hosted-compatibility", "install-a-server", "back-up-the-reference-instance"] },
    { id: "integrate", title: t("integrate"), intro: t("welcomeIntegrate"), articles: ["glossary-and-data-model", "architecture-and-data-flows", "external-minddy-mcp"] },
  ];
  const sections = guides.map(({ id, title }) => ({ id, title, level: 2 }));
  return <DocumentationShell articles={articles} locale={locale} currentId={null} title={t("welcome")}
    topic={t("gettingStarted")} sections={sections} initialQuery={query}>
    <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("welcome")}</h1>
    <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{t("welcomeSummary")}</p>
    {preview && <p className="mt-4 rounded-lg border border-border bg-muted p-3 text-sm" role="status">{t("draftPreview")}</p>}
    {!articles.length && <p className="mt-8 text-muted-foreground">{t("empty")}</p>}
    {guides.map(guide => <section key={guide.id} id={guide.id} tabIndex={-1} className="mt-10 scroll-mt-40 sm:scroll-mt-32 xl:scroll-mt-24">
      <h2 className="text-xl font-semibold tracking-tight">{guide.title}</h2>
      <p className="mt-3 leading-7 text-muted-foreground">{guide.intro}</p>
      <ul className="mt-4 list-disc space-y-3 pl-5 leading-7 marker:text-muted-foreground">
        {guide.articles.map(id => articles.find(article => article.id === id)).filter(article => article !== undefined).map(article => <li key={article.id}>
          <a href={documentationPath(article.id, locale)} className="font-medium underline decoration-border underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-ring">{article.title}</a>
          <p className="text-sm leading-6 text-muted-foreground">{article.summary}</p>
        </li>)}
      </ul>
      {guide.id === "operate" && <a href={localizedHref("/self-hosting", locale)} className="mt-4 inline-block text-sm underline underline-offset-4">{t("selfHosting")}</a>}
    </section>)}
  </DocumentationShell>;
}
