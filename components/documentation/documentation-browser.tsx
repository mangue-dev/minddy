import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import type { DocumentationArticle } from "@/lib/documentation";
import { documentationPath, searchDocumentation } from "@/lib/documentation-core.mjs";
import { localizedHref } from "@/lib/locale-href";

export async function DocumentationBrowser({ articles, locale, query = "", audience = "", preview = false }: {
  articles: DocumentationArticle[]; locale: Locale; query?: string; audience?: string; preview?: boolean;
}) {
  const t = await getTranslations({ locale, namespace: "Documentation" });
  const groups = [
    { id: "member", label: t("use") }, { id: "operator", label: t("operate") },
    { id: "integrator", label: t("integrate") },
  ];
  const filtered = audience ? articles.filter(article => audience === "member"
    ? article.audiences.some(item => ["member", "owner", "visitor"].includes(item))
    : article.audiences.some(item => item === audience)) : articles;
  const results = query ? searchDocumentation(filtered, query) : [];
  const topics = [...new Set(filtered.map(article => article.topic))];
  return <div className="mx-auto max-w-6xl px-4 py-10 sm:px-8 sm:py-16">
    <h1 className="font-display text-4xl font-semibold tracking-tight">{t("title")}</h1>
    <p className="mt-3 max-w-2xl text-muted-foreground">{t("description")}</p>
    {preview && <p className="mt-4 rounded-lg border border-border bg-muted p-3 text-sm" role="status">{t("draftPreview")}</p>}
    <div className="mt-6"><DocumentationLanguages locale={locale} id={null} label={t("language")} /></div>
    <form action={documentationPath(null, locale)} className="mt-8 grid gap-3 sm:grid-cols-[1fr_auto_auto]" role="search">
      <label className="flex flex-col gap-2 text-sm font-medium">{t("search")}
        <input type="search" name="q" defaultValue={query} maxLength={200}
          className="min-h-11 w-full rounded-lg border border-input bg-background px-3 font-normal outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring" />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">{t("audience")}
        <select name="audience" defaultValue={audience} className="min-h-11 rounded-lg border border-input bg-background px-3 font-normal">
          <option value="">{t("allAudiences")}</option>
          {groups.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}
        </select>
      </label>
      <button className="min-h-11 self-end rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{t("search")}</button>
    </form>
    <nav aria-label={t("audience")} className="mt-8 grid gap-3 sm:grid-cols-3">
      {groups.map(group => <a key={group.id} href={`${documentationPath(null, locale)}?audience=${group.id}`}
        aria-current={audience === group.id ? "page" : undefined}
        className="rounded-xl border border-border p-5 font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">{group.label}</a>)}
    </nav>
    {query ? <section className="mt-10" aria-label={t("search")}>
      <a href={documentationPath(null, locale) + (audience ? `?audience=${audience}` : "")} className="text-sm underline underline-offset-4">{t("clear")}</a>
      {results.length ? <ul className="mt-5 space-y-5">{results.map(result => <li key={result.id}>
        <a className="font-semibold underline decoration-border underline-offset-4 hover:decoration-current" href={result.href}>{result.title}</a>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{result.excerpt}</p>
      </li>)}</ul> : <p className="mt-5 text-muted-foreground" role="status">{t("noResults")}</p>}
    </section> : <div className="mt-10 grid gap-8 md:grid-cols-2">
      {topics.map(topic => <section key={topic}>
        <h2 className="mb-3 text-lg font-semibold">{topic}</h2>
        <ul className="space-y-2">{filtered.filter(article => article.topic === topic).map(article => <li key={article.id}>
          <a href={documentationPath(article.id, locale)} className="block rounded-lg px-3 py-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
            <span className="font-medium">{article.title}</span><span className="mt-1 block text-sm text-muted-foreground">{article.summary}</span>
          </a>
        </li>)}</ul>
      </section>)}
      {!filtered.length && <p className="text-muted-foreground">{t("empty")}</p>}
    </div>}
    <a href={localizedHref("/self-hosting", locale)} className="mt-10 inline-block underline underline-offset-4">{t("selfHosting")}</a>
  </div>;
}

const LANGUAGE_NAMES = { en: "English", fr: "Français", de: "Deutsch", es: "Español", it: "Italiano", "pt-BR": "Português (Brasil)" };

export function DocumentationLanguages({ locale, id, label }: { locale: Locale; id: string | null; label: string }) {
  return <nav aria-label={label} className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
    {Object.entries(LANGUAGE_NAMES).map(([language, name]) => <a key={language} href={documentationPath(id, language)}
      hrefLang={language} lang={language} aria-current={locale === language ? "page" : undefined}
      className="rounded py-1 underline decoration-border underline-offset-4 hover:decoration-current aria-[current=page]:font-semibold focus-visible:outline-2 focus-visible:outline-ring">{name}</a>)}
  </nav>;
}
