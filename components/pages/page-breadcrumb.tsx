"use client";

// Le fil d'Ariane d'une SOUS-PAGE (MIN-272).
//
// Il ne paraît que lorsqu'il y a quelque chose à dire : une page racine n'a pas
// de chemin, et un fil d'Ariane qui n'affiche qu'un seul élément n'est qu'un
// titre écrit deux fois. Dès qu'il y a un niveau d'imbrication, en revanche, la
// question « où suis-je, et comment je remonte ? » se pose vraiment — la
// sidebar y répond, mais elle est repliable et peut être fermée.
//
// Il porte les ANCÊTRES, et pas la page courante : son titre est juste en
// dessous, en 4xl. L'écrire une seconde fois en petit, deux centimètres plus
// haut, ne dit rien de plus et prend la largeur qu'on cherche justement à ne pas
// prendre.
//
// Quand la chaîne s'allonge, ce sont les niveaux du MILIEU qui s'effacent, sous
// un « … » qui les rend tous d'un clic. Jamais les deux bouts : la racine dit
// dans quel document on est, le parent direct dit d'où l'on vient, et ce sont
// les deux seuls dont on a besoin sans réfléchir. C'est le motif de Notion, de
// Motion et du fil d'Ariane de l'app (components/app-breadcrumb.tsx), dont
// celui-ci reprend la ponctuation.

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from "mangue-ui";
import { FileText } from "lucide-react";
import { foldPath } from "@/lib/pages";

export interface BreadcrumbPage {
  id: string;
  title: string;
  icon: string | null;
}

function Crumb({
  page,
  href,
  className,
}: {
  page: BreadcrumbPage;
  href: string;
  className?: string;
}) {
  const t = useTranslations("Pages");
  return (
    <Link
      href={href}
      className={cn(
        "flex min-w-0 items-center gap-1 rounded transition-colors hover:text-foreground",
        className
      )}
    >
      <span className="flex size-3.5 shrink-0 items-center justify-center text-[11px] leading-none">
        {page.icon ?? <FileText className="size-3" />}
      </span>
      <span className="truncate">{page.title || t("untitled")}</span>
    </Link>
  );
}

function Separator() {
  return <span className="shrink-0 select-none text-muted-foreground/40">/</span>;
}

export function PageBreadcrumb({
  trail,
  hrefFor,
  className,
}: {
  /** Les ancêtres, de la RACINE au parent direct. Vide : rien ne se rend. */
  trail: BreadcrumbPage[];
  hrefFor: (pageId: string) => string;
  className?: string;
}) {
  const t = useTranslations("Pages");
  // La règle de repli vit dans lib/pages.ts, avec le reste de la logique
  // d'arbre : elle se teste sans monter d'interface.
  const { lead, hidden, tail } = foldPath(trail);
  if (!lead) return null;

  return (
    <nav
      aria-label={t("breadcrumb")}
      // `text-xs` et `min-w-0` partout : ce fil doit pouvoir rétrécir jusqu'à
      // ses ellipses plutôt que pousser l'indicateur d'enregistrement, à
      // l'autre bout de la même ligne.
      className={cn(
        "flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground",
        className
      )}
    >
      <Crumb page={lead} href={hrefFor(lead.id)} className="max-w-[10rem]" />

      {hidden.length > 0 && (
        <>
          <Separator />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t("breadcrumbMore", { count: hidden.length })}
                className="shrink-0 rounded px-1 leading-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                …
              </button>
            </DropdownMenuTrigger>
            {/* Les niveaux repliés dans l'ordre du chemin, de la racine vers
                ici : c'est celui qu'on a en tête en remontant. */}
            <DropdownMenuContent align="start" className="w-56">
              {hidden.map((page) => (
                <DropdownMenuItem key={page.id} asChild>
                  <Link href={hrefFor(page.id)}>
                    <span className="flex size-4 shrink-0 items-center justify-center text-xs leading-none">
                      {page.icon ?? <FileText className="size-3.5" />}
                    </span>
                    <span className="truncate">{page.title || t("untitled")}</span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      {tail.map((page) => (
        <span key={page.id} className="flex min-w-0 items-center gap-1.5">
          <Separator />
          <Crumb
            page={page}
            href={hrefFor(page.id)}
            className="max-w-[12rem] text-foreground/80"
          />
        </span>
      ))}
    </nav>
  );
}
