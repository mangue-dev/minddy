"use client";

// La pilule d'une mention « @ » — dans le composer de Numo pendant qu'on écrit,
// dans la bulle envoyée, et dans un commentaire publié. Une seule et même chose
// aux trois endroits.
//
// Elle montre la FIGURE de qui est cité (le portrait, l'orbe du projet, le
// visage de Numo) et son nom NU : l'arobase a servi à l'appeler, elle n'a plus
// rien à dire une fois la pilule posée — exactement comme une pilule de contexte
// au-dessus du composer. Le « @ » reste dans le TEXTE envoyé (voir la
// sérialisation du composer, et le corps du commentaire tel qu'il est stocké) :
// côté modèle comme côté serveur, c'est lui qui marque la mention.
//
// Une pilule qui DÉSIGNE quelque chose — un ticket, un objectif, une page, un
// projet — s'ouvre d'un clic dès qu'on lui donne un `href` : elle devient alors
// une vraie ancre. Une PERSONNE, jamais : minddy n'a pas de page de profil. La
// règle des destinations est dans lib/mention-target.ts, et qui la résout dans
// components/mention-links.tsx.

import type { MouseEvent } from "react";
import { BookText, FileText } from "lucide-react";
import { cn } from "mangue-ui";
import { NumoAvatar } from "@/components/actor-avatars";
import {
  NODE_LINK_CLASS,
  isPlainNavigationClick,
} from "@/components/editor-node-link";
import { ObjectiveIconBadge } from "@/components/objective-icon";
import { ProjectOrb } from "@/components/project-orb";
import { UserAvatar } from "@/components/user-avatar";

/** L'id de la pseudo-entité « Numo » dans les listes de mentions : l'assistant
    n'est pas un compte, il n'a donc pas d'id à lui. */
export const NUMO_MENTION_ID = "__numo__";

/** Ce qu'une mention peut désigner. Les quatre premiers portent une FIGURE (un
    portrait, une orbe, un visage) ; ticket, objectif et page n'en ont pas — ils
    prennent la pastille d'icône des pilules de contexte de Numo, dans la même
    teinte, pour qu'on lise la même chose des deux côtés du composer. */
export type MentionChipType =
  | "member"
  | "project"
  | "numo"
  | "forge"
  | "issue"
  | "objective"
  | "page";

export function MentionChip({
  type,
  id,
  label,
  avatarSeed,
  avatarUrl,
  iconUrl,
  color,
  icon,
  href,
  onNavigate,
  className,
}: {
  type: MentionChipType;
  /** Membre : user_id. Projet : id du projet — c'est la graine de son orbe.
      Forge : le login, qui est aussi la graine de son portrait de repli.
      Ticket et objectif : leur id. Numo n'a rien à identifier :
      `NUMO_MENTION_ID` fait l'affaire. */
  id: string;
  label: string;
  /** Graine du portrait (elle n'est PAS toujours le user_id). */
  avatarSeed?: string | null;
  /** Forge : le portrait servi par la forge — un vrai visage, pas une graine. */
  avatarUrl?: string | null;
  /** Projet : le favicon importé, quand il y en a un. */
  iconUrl?: string | null;
  /** Objectif : SA couleur, celle que porte sa cible partout ailleurs. */
  color?: string | null;
  /** Page : son émoji, quand elle en a un (MIN-273). */
  icon?: string | null;
  /**
   * Où mène la pilule. Présent = elle se clique, et devient une vraie ancre :
   * ⌘-clic, clic du milieu et « ouvrir dans un nouvel onglet » viennent avec.
   * Une personne n'en a jamais (lib/mention-target.ts).
   */
  href?: string | null;
  /** Le clic ORDINAIRE : la navigation d'application, pour ne pas recharger la
      page entière. Sans lui, l'ancre est suivie par le navigateur. */
  onNavigate?: () => void;
  className?: string;
}) {
  const figure = (
    <>
      {type === "member" ? (
        <UserAvatar seed={avatarSeed ?? id} className="size-4" />
      ) : type === "forge" ? (
        // Le compte de la forge porte SON portrait (celui de github.com), pas un
        // avatar minddy généré : c'est bien lui qu'on cite, et il n'a pas de
        // compte ici. `seed` reste le repli quand la forge n'en sert pas.
        <UserAvatar url={avatarUrl} seed={id} className="size-4" />
      ) : type === "numo" ? (
        // Le visage de l'assistant, exactement celui qui signe ses réponses. Son
        // disque garde la couleur de marque : dans une pilule à l'encre, c'est
        // ce qui dit d'un coup d'œil que la mention n'appelle pas une personne.
        <NumoAvatar className="size-4" iconClassName="size-3" />
      ) : type === "issue" ? (
        // Même pastille que la pilule de contexte « ticket » du composer, même
        // bleu : ce que Numo a sous les yeux et ce qu'une description cite se
        // reconnaissent au même signe.
        <span className="flex size-4 items-center justify-center rounded-full bg-blue-500/12 text-blue-600 dark:text-blue-400">
          <FileText className="size-2.5" />
        </span>
      ) : type === "page" ? (
        // Même pastille que la pilule de contexte « page » du composer, même
        // indigo : le wiki se reconnaît au même signe partout. L'ÉMOJI de la page
        // prend la place de l'icône quand elle en a un — c'est sa figure à elle.
        <span className="flex size-4 items-center justify-center rounded-full bg-indigo-500/12 text-indigo-600 dark:text-indigo-400">
          {icon ? (
            <span className="text-[0.7em] leading-none">{icon}</span>
          ) : (
            <BookText className="size-2.5" />
          )}
        </span>
      ) : type === "objective" ? (
        <ObjectiveIconBadge
          color={color}
          className="size-4 rounded-full"
          iconClassName="size-2.5"
        />
      ) : (
        <ProjectOrb seed={id} iconUrl={iconUrl} className="size-4 rounded-full" />
      )}
      {label}
    </>
  );

  // Géométrie de la pilule, dans l'ordre où elle se déduit :
  //   figure 16px + 3px de marge tout autour → hauteur 22px, donc rayon 11 ;
  //   rayon intérieur = 11 − 3 = 8, soit la moitié de la figure : dans une
  //   pilule, ce qui est posé au ras du bord est nécessairement rond — l'orbe
  //   du projet s'arrondit donc comme le portrait.
  //
  // `leading-4` n'est pas cosmétique : sans lui le libellé garde l'interligne
  // du texte qui l'entoure (leading-relaxed, ~23px), sa ligne dépasse la
  // figure, et la pilule grandit en hauteur SEULE — les 3px du bas et du haut
  // en paraissent alors 6, quand ceux des côtés valent toujours 3. Le mettre à
  // la hauteur de la figure remet les quatre marges à égalité.
  const shape =
    "mx-0.5 inline-flex items-center gap-1 rounded-full bg-(--mention-chip) p-[3px] pr-2.5 align-middle text-[0.95em] font-medium leading-4 text-primary";

  if (!href) return <span className={cn(shape, className)}>{figure}</span>;

  return (
    // Une vraie ancre, et pas une pilule cliquable : ⌘-clic, clic du milieu et
    // « ouvrir dans un nouvel onglet » viennent avec, et aucun `onClick` ne sait
    // les refaire. Le clic ORDINAIRE, lui, passe par le routeur.
    //
    // `NODE_LINK_CLASS` : dans un éditeur, c'est la marque par laquelle
    // l'extension Link laisse l'ancre tranquille — sans elle, un clic ouvrait un
    // onglet neuf EN PLUS de la navigation (components/editor-node-link.ts).
    // `no-underline` va avec : les surfaces de texte peignent leurs liens, et
    // une pilule soulignée n'est plus une pilule.
    <a
      href={href}
      className={cn(
        shape,
        NODE_LINK_CLASS,
        "cursor-pointer no-underline transition-colors hover:bg-(--mention-chip-hover)",
        // En DERNIER : un appelant qui repeint la pilule (la bulle sombre du
        // chat) repeint aussi son survol, et tailwind-merge ne peut le faire que
        // si sa classe arrive après la nôtre.
        className,
      )}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        if (!onNavigate || !isPlainNavigationClick(event)) return;
        event.preventDefault();
        onNavigate?.();
      }}
    >
      {figure}
    </a>
  );
}
