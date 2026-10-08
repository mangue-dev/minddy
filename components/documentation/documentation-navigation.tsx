"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Cancel01Icon, Menu01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger, Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger, Tooltip, TooltipContent, TooltipTrigger } from "mangue-ui";
import type { Locale } from "@/i18n/config";
import type { DocumentationArticle, DocumentationSearchEntry } from "@/lib/documentation";
import { documentationPath, searchDocumentation } from "@/lib/documentation-core.mjs";
import { CommandPalette, usePaletteStore } from "@/lib/command-palette";
import { useDocumentationTopics } from "@/lib/use-documentation-topics";
import { DocumentationIcon } from "./documentation-icon";
import "@/components/command-palette.css";

export type DocumentationNavigationEntry = Pick<DocumentationArticle, "id" | "title" | "topic">;

export function DocumentationSidebar({ articles, locale, currentId, labels, onNavigate }: {
  articles: DocumentationNavigationEntry[];
  locale: Locale;
  currentId: string | null;
  labels: { topics: string; welcome: string; close: string };
  onNavigate?: () => void;
}) {
  const startTopic = articles.find(article => article.id === "first-project")?.topic;
  const topics = [...new Set(articles.map(article => article.topic))].sort((a, b) =>
    a === startTopic ? -1 : b === startTopic ? 1 : a.localeCompare(b, locale));
  // Article IDs keep topic preferences stable when the reader changes language.
  const topicKeys = new Map(topics.map(topic => [topic, articles.filter(article => article.topic === topic).map(article => article.id).sort()[0]]));
  const activeTopic = articles.find(article => article.id === currentId)?.topic;
  const folds = useDocumentationTopics(activeTopic ? topicKeys.get(activeTopic) : undefined);
  return <nav aria-label={labels.topics} className="space-y-1 px-4 py-6">
    <Link href={documentationPath(null, locale)} prefetch={false} onNavigate={onNavigate} aria-current={currentId === null ? "page" : undefined}
      className="mb-4 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><DocumentationIcon articleId={null} className="size-4 shrink-0" /><span>{labels.welcome}</span></Link>
    {topics.map(topic => <Collapsible key={topic} open={folds.isOpen(topicKeys.get(topic)!)} onOpenChange={open => folds.setOpen(topicKeys.get(topic)!, open)}>
      <CollapsibleTrigger className="group flex min-h-10 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90 motion-reduce:transition-none" aria-hidden />
        <span className={articles.some(article => article.topic === topic && article.id === currentId) ? "text-foreground" : undefined}>{topic}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="motion-reduce:animate-none">
        <ul className="ml-4 space-y-0.5 py-1 pl-2">
          {articles.filter(article => article.topic === topic).map(article => <li key={article.id}>
            <Link href={documentationPath(article.id, locale)} prefetch={false} onNavigate={onNavigate} aria-current={article.id === currentId ? "page" : undefined}
              className="flex items-start gap-2 rounded-md px-3 py-2 text-[13px] leading-5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><DocumentationIcon articleId={article.id} className="mt-0.5 size-4 shrink-0" /><span>{article.title}</span></Link>
          </li>)}
        </ul>
      </CollapsibleContent>
    </Collapsible>)}
  </nav>;
}

export function DocumentationMobileNavigation(props: Parameters<typeof DocumentationSidebar>[0]) {
  const [open, setOpen] = useState(false);
  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild><Button variant="ghost" size="icon" aria-label={props.labels.topics} className="lg:hidden">
      <HugeiconsIcon icon={Menu01Icon} className="size-4" aria-hidden />
    </Button></SheetTrigger>
    <SheetContent side="left" autoFocusOnOpen showCloseButton={false} className="gap-0 overflow-y-auto p-0">
      <SheetClose asChild><Button variant="ghost" size="icon" aria-label={props.labels.close} className="absolute right-3 top-3">
        <HugeiconsIcon icon={Cancel01Icon} className="size-4" aria-hidden />
      </Button></SheetClose>
      <SheetTitle className="px-7 pt-6 text-sm">{props.labels.topics}</SheetTitle>
      <DocumentationSidebar {...props} onNavigate={() => setOpen(false)} />
    </SheetContent>
  </Sheet>;
}

/** Use the same palette shell as the app, with only the visible article corpus. */
export function DocumentationSearch({ articles, locale, initialQuery = "", labels }: {
  articles: (DocumentationSearchEntry & { topic: string })[];
  locale: Locale;
  initialQuery?: string;
  labels: { search: string; articles: string; noResults: string; open: string };
}) {
  const [open, setOpen] = useState(Boolean(initialQuery));
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(value => !value);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);
  const items = useMemo(() => articles.map(article => ({
    id: article.id,
    title: article.title,
    description: `${article.summary}\n${article.content}`,
    keywords: article.tags,
    contextLabel: article.topic,
    filterCategory: "articles",
    icon: <DocumentationIcon articleId={article.id} className="size-4" />,
    href: documentationPath(article.id, locale),
  })), [articles, locale]);
  return <>
    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={labels.search}
      aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <HugeiconsIcon icon={Search01Icon} className="size-4" aria-hidden />
    </Button></TooltipTrigger><TooltipContent>{labels.search} · ⌘K / Ctrl+K</TooltipContent></Tooltip>
    <CommandPalette isOpen={open} onClose={() => setOpen(false)} items={items} locale={locale}
      initialQuery={initialQuery} history={false} storagePrefix={`minddy-docs-${locale}`}
      categories={[{ id: "articles", label: labels.articles, placeholder: labels.search }]}
      strings={{ "search.placeholder": labels.search, "search.ariaLabel": labels.search,
        "results.empty.title": labels.noResults, "results.empty.hint": "", "itemActions.open": labels.open }}
      onSelectItem={item => {
        const article = articles.find(article => article.id === item.id);
        const query = usePaletteStore.getState().query;
        const result = article && searchDocumentation([article], query)[0];
        setOpen(false);
        window.location.assign(result?.href ?? item.href!);
      }} />
  </>;
}
