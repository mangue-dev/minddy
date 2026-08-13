"use client";

// LES AVATARS DE PRÉSENCE (MIN-271) — qui d'autre lit cette page, en ce moment.
//
// C'est la moitié PRÉVENTIVE de la feature : la sauvegarde versionnée rattrape
// la collision une fois qu'elle a eu lieu, l'avatar en haut de page l'évite. La
// personne qui voit quelqu'un d'autre sur son document ne se comporte pas de la
// même façon — et c'est justement ce qu'un document partagé ne dit jamais tout
// seul.
//
// On ne se montre PAS soi-même : le seul visage qu'un utilisateur ne cherche
// pas sur son propre écran est le sien, et le laisser ferait croire à deux
// lecteurs là où il n'y en a qu'un. Le tri est fait à la SOURCE, une fois pour
// toutes les surfaces (lib/page-presence.ts) — l'arbre, lui, ne sait même pas
// qui je suis, et il posait sa pastille sur mon propre deuxième onglet.

import { createContext, useContext, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";

import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display-name";
import { usePagePresence } from "@/lib/use-page-presence";
import type { PagePresenceMap } from "@/lib/page-presence";
import type { Member } from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/* ── Le canal, monté UNE fois ──────────────────────────────────────────── */

const EMPTY: PagePresenceMap = new Map();
const PresenceContext = createContext<PagePresenceMap>(EMPTY);

/**
 * L'abonnement vit dans la COQUILLE des pages, pas dans la page ouverte.
 *
 * C'est ce qui fait qu'il tient : `PageView` se remonte à chaque navigation
 * (`key={pageId}`), donc y mettre le canal le ferait quitter et rejoindre à
 * chaque clic dans l'arbre — et clignoter chez tout le monde. La coquille, elle,
 * traverse les navigations ; changer de page n'y est qu'un `track` de plus.
 */
export function PagePresenceProvider({
  projectId,
  pageId,
  children,
}: {
  projectId: string;
  pageId: string | null;
  children: ReactNode;
}) {
  const present = usePagePresence(projectId, pageId);
  return (
    <PresenceContext.Provider value={present}>
      {children}
    </PresenceContext.Provider>
  );
}

/** Tout ce que d'AUTRES regardent dans le projet — l'arbre en a besoin en
    entier. */
export function usePresentPages(): PagePresenceMap {
  return useContext(PresenceContext);
}

/** Les autres présents sur une page donnée. */
export function usePresentOn(pageId: string | null): string[] {
  const present = useContext(PresenceContext);
  return (pageId ? present.get(pageId) : undefined) ?? [];
}

/** Au-delà, on compte : cinq visages en haut d'un document, c'est déjà une
    barre d'outils. */
const MAX_FACES = 3;

export function PagePresence({
  userIds,
  members,
  className,
}: {
  /** Les AUTRES présents sur cette page — déjà triés (lib/page-presence.ts). */
  userIds: readonly string[];
  members: readonly Member[];
  className?: string;
}) {
  const t = useTranslations("Pages");
  const others = userIds;
  if (others.length === 0) return null;

  const byId = new Map(members.map((member) => [member.user_id, member]));
  const faces = others.slice(0, MAX_FACES);
  const extra = others.length - faces.length;

  return (
    <div className={cn("flex items-center", className)}>
      {faces.map((id) => {
        const member = byId.get(id);
        // Un présent qu'on ne connaît pas (membre ajouté depuis le chargement
        // de la liste) garde sa place : un avatar neutre vaut mieux qu'un
        // lecteur invisible.
        const name = member ? displayName(member) : t("presenceUnknown");
        return (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <span className="-ml-1.5 first:ml-0">
                <UserAvatar
                  seed={member?.avatar_seed ?? null}
                  className="size-5 ring-2 ring-background"
                />
              </span>
            </TooltipTrigger>
            <TooltipContent>{t("presenceHere", { name })}</TooltipContent>
          </Tooltip>
        );
      })}
      {extra > 0 && (
        <span className="-ml-1.5 flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-background">
          +{extra}
        </span>
      )}
    </div>
  );
}

/**
 * La PASTILLE de l'arbre : une page que quelqu'un d'autre regarde en ce moment.
 *
 * Un point, pas un avatar : la ligne de l'arbre est déjà dense (icône, titre,
 * chevron, bouton `+`), et l'information utile à cet endroit est binaire —
 * « il y a quelqu'un ». Qui, on le lit en ouvrant la page.
 */
export function PagePresenceDot({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  const t = useTranslations("Pages");
  if (count <= 0) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={t("presenceCount", { count })}
          className={cn(
            "size-1.5 shrink-0 rounded-full bg-emerald-500",
            className
          )}
        />
      </TooltipTrigger>
      <TooltipContent>{t("presenceCount", { count })}</TooltipContent>
    </Tooltip>
  );
}
