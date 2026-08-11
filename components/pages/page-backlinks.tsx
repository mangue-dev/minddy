"use client";

// « Cité par » (MIN-279) — ce qui s'appuie sur cette page.
//
// Le geste qui fait passer d'un wiki à un réseau. Une page de spec ne dit rien
// d'elle-même tant qu'on ne voit pas les six tickets qui la citent : « cette
// spec, elle sert à quoi ? » est une question qui se pose AU MOMENT où on la
// lit, et la réponse était jusqu'ici introuvable dans les deux sens.
//
// Trois décisions de dessin, et elles se tiennent :
//
//  • EN PIED DU DOCUMENT, pas dans une barre latérale de plus. C'est une lecture
//    de fin de page — on descend, on finit, on demande « et alors ? ». Un meuble
//    permanent volerait de la largeur au document pour une réponse qu'on ne
//    regarde qu'une fois.
//  • VIDE = ABSENT. Un cadre qui dit « rien ne cite cette page » est un cadre
//    qu'on lit sur toutes les pages neuves du wiki, pour rien.
//  • LES DEUX ORIGINES NE SE DISTINGUENT PAS. Le serveur fond la ressource
//    (MIN-275) et la mention en une seule ligne. Savoir laquelle des deux a
//    servi n'est pas une question qu'on se pose.

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { FileText, Hash } from "lucide-react";
import { cn } from "mangue-ui";

import { fetchPageBacklinksApi } from "@/lib/pages-api";
import { mentionTargetPath } from "@/lib/mention-target";
import { EntityPill, PillIcon, PILL_INNER_RADIUS } from "@/components/entity-pill";
import { ObjectiveIconBadge } from "@/components/objective-icon";
import type { PageBacklink } from "@/lib/types";

/** La clé de cache des rétroliens — celle qu'invalide le pont temps réel. */
export const pageBacklinksKey = (pageId: string) =>
  ["page-backlinks", pageId] as const;

/** Les teintes des deux genres qui en ont une, reprises telles quelles des
    pilules de contexte de Numo : un ticket est bleu et une page indigo ici comme
    là-bas. L'objectif, lui, porte SA couleur (ObjectiveIconBadge). */
const TINT: Record<"issue" | "page", string> = {
  issue: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
  page: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-400",
};

export function PageBacklinks({
  projectId,
  pageId,
  className,
}: {
  projectId: string;
  pageId: string;
  className?: string;
}) {
  const t = useTranslations("Pages");

  const backlinks = useQuery({
    queryKey: pageBacklinksKey(pageId),
    queryFn: () => fetchPageBacklinksApi(projectId, pageId),
    // Un rétrolien naît d'une écriture faite AILLEURS — dans un ticket, dans une
    // autre page. Le cache de la fois d'avant est donc périmé par construction.
    refetchOnMount: "always",
    staleTime: 0,
  });

  const items = backlinks.data ?? [];
  // Ni squelette ni message d'erreur : le panneau n'est pas ce qu'on est venu
  // lire. Tant qu'on ne sait pas, il n'existe pas — c'est le même silence que
  // « rien ne cite cette page », et c'est le bon.
  if (items.length === 0) return null;

  return (
    <section className={cn("mt-14 border-t border-border pt-6", className)}>
      <h2 className="mb-3 text-xs font-medium text-muted-foreground">
        {t("backlinksTitle", { count: items.length })}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={`${item.kind}:${item.id}`} className="min-w-0 max-w-full">
            <BacklinkPill item={item} projectId={projectId} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function BacklinkPill({
  item,
  projectId,
}: {
  item: PageBacklink;
  projectId: string;
}) {
  const t = useTranslations("Pages");
  const href = mentionTargetPath(item.kind, item.id, projectId);
  const label = item.title.trim() || t("untitled");

  return (
    <Link href={href ?? "#"} className="block min-w-0 max-w-full">
      <EntityPill radius="md" className="hover:bg-accent">
        {item.kind === "objective" ? (
          <ObjectiveIconBadge
            color={item.color}
            className={cn("size-5 shrink-0", PILL_INNER_RADIUS.md)}
            iconClassName="h-3 w-3"
          />
        ) : (
          <PillIcon radius="md" tint={TINT[item.kind]}>
            {/* L'émoji d'une page quand elle en a un — la même figure que dans
                l'arbre de la sidebar, pour qu'on la reconnaisse. */}
            {item.kind === "page" && item.icon ? (
              <span className="text-[11px] leading-none">{item.icon}</span>
            ) : item.kind === "page" ? (
              <FileText className="h-3 w-3" />
            ) : (
              <Hash className="h-3 w-3" />
            )}
          </PillIcon>
        )}
        {/* L'identifiant devant le titre, comme partout où un ticket se nomme :
            c'est lui qu'on cherche des yeux dans une liste. */}
        {item.identifier ? (
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {item.identifier}
          </span>
        ) : null}
        <span className="min-w-0 truncate font-medium text-foreground/80">
          {label}
        </span>
      </EntityPill>
    </Link>
  );
}
