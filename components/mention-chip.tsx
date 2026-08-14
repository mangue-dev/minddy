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
//
// La pilule est TEINTÉE PAR TYPE : fond à la couleur, texte dans la même
// couleur mais appuyé, de sorte qu'on lise ce qu'on cite avant même d'avoir lu
// le libellé. Une seule teinte par pilule (`--mention-tone`), d'où se déduisent
// le fond, son survol et l'encre — voir `toneStyle` plus bas et le bloc
// « pilule de mention » de app/globals.css, qui tient les deux thèmes.
//
// C'est aussi ce qui a fait tomber la pastille d'icône du ticket, de la page et
// de l'objectif : un disque bleu à 12 % posé sur une pilule bleue à 14 % ne dit
// rien de plus que la pilule, il l'embourbe. Le glyphe y est donc NU, à l'encre
// de la pilule — la pilule EST devenue la pastille. Ce qui reste dedans est ce
// qu'une teinte ne sait pas rendre : un visage, une orbe, un émoji.

import type { CSSProperties, MouseEvent } from "react";
import { BookText, FileText, Target } from "lucide-react";
import { cn } from "mangue-ui";
import {
  NODE_LINK_CLASS,
  isPlainNavigationClick,
} from "@/components/editor-node-link";
import { NumoFace } from "@/components/numo-face";
import { objectiveColor } from "@/components/objective-icon";
import { ProjectOrb } from "@/components/project-orb";
import { projectOrbBaseColor } from "@/lib/project-orb-colors";
import { UserAvatar } from "@/components/user-avatar";

/** L'id de la pseudo-entité « Numo » dans les listes de mentions : l'assistant
    n'est pas un compte, il n'a donc pas d'id à lui. */
export const NUMO_MENTION_ID = "__numo__";

/** Ce qu'une mention peut désigner. Les quatre premiers portent une FIGURE (un
    portrait, une orbe, un visage) ; ticket, objectif et page n'en ont pas — ils
    prennent un glyphe nu, dans l'encre de la pilule. */
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
  /** Membre : user_id. Projet : id du projet — la graine de son orbe si elle
      n'a jamais été relancée, sinon `avatarSeed` la porte.
      Forge : le login, qui est aussi la graine de son portrait de repli.
      Ticket et objectif : leur id. Numo n'a rien à identifier :
      `NUMO_MENTION_ID` fait l'affaire. */
  id: string;
  label: string;
  /** Graine de la figure — le portrait d'un membre, l'orbe d'un projet. Elle
      n'est PAS toujours l'id (un tirage relancé, justement). */
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
  // Une IMAGE (un portrait, une orbe) est un objet dans la ligne ; un GLYPHE
  // est du texte — il vit dans la marge du libellé et suit sa couleur. D'où
  // deux gouttières à gauche, et une seule à droite.
  //
  // Les deux images sont RONDES et de la taille d'un glyphe (14px), pas de la
  // hauteur de la ligne : une mention se lit d'abord à son libellé, la figure
  // n'est là que pour dire de qui il s'agit quand deux personnes ont le même
  // prénom. À 16px elle pesait plus que le nom qu'elle accompagne. Ronde, y
  // compris l'orbe du projet : à cette taille un carré adouci n'est plus qu'un
  // rond bosselé, et la pilule a déjà la forme rectangulaire pour deux.
  const hasImage = type === "member" || type === "forge" || type === "project";

  // La figure est un objet posé DANS la ligne de texte de la pilule, et pas un
  // frère du libellé dans une boîte flex : c'est ce qui permet à la pilule
  // d'avoir une ligne de base (voir `shape`). Elle se centre donc sur la hauteur
  // d'x du libellé (`align-middle`), comme le ferait une émoticône.
  //
  // …et remonte ensuite d'un dixième de cadratin, parce que ce n'est PAS sur la
  // hauteur d'x que l'œil la veut. `align-middle` vise le milieu du « x » ;
  // mais un libellé de mention est fait de capitales et de hampes (« Clément »,
  // « PRTF-2 »), dont le milieu optique est celui de la hauteur de capitale,
  // plus haut d'environ (cap − x) / 2 — soit ~0,1em pour Inter. Sans ce
  // décalage la figure paraît tomber sous son propre texte, à l'intérieur de la
  // pilule. En `em` et non en pixels : la pilule suit le corps du texte qui la
  // porte, son calage doit le suivre aussi.
  const figure = (
    <span className="relative -top-[0.1em] mr-1 inline-flex size-3.5 items-center justify-center align-middle">
      {type === "member" ? (
        <UserAvatar seed={avatarSeed ?? id} className="size-3.5" />
      ) : type === "forge" ? (
        // Le compte de la forge porte SON portrait (celui de github.com), pas un
        // avatar minddy généré : c'est bien lui qu'on cite, et il n'a pas de
        // compte ici. `seed` reste le repli quand la forge n'en sert pas.
        <UserAvatar url={avatarUrl} seed={id} className="size-3.5" />
      ) : type === "project" ? (
        <ProjectOrb
          seed={avatarSeed ?? id}
          iconUrl={iconUrl}
          className="size-3.5 rounded-full"
        />
      ) : type === "numo" ? (
        // Le visage de l'assistant, exactement celui qui signe ses réponses —
        // nu, à l'encre de la pilule, qui est ici la couleur de marque.
        <NumoFace className="size-3.5" />
      ) : type === "issue" ? (
        <FileText className="size-3.5" />
      ) : type === "page" ? (
        // L'ÉMOJI de la page prend la place du glyphe quand elle en a un :
        // c'est sa figure à elle, et elle porte ses propres couleurs.
        icon ? (
          <span className="text-[0.85em] leading-none">{icon}</span>
        ) : (
          <BookText className="size-3.5" />
        )
      ) : (
        <Target className="size-3.5" />
      )}
    </span>
  );

  // Géométrie de la pilule, dans l'ordre où elle se déduit :
  //   c'est le LIBELLÉ qui donne la hauteur (leading-4, soit 16px), et non plus
  //   la figure, qui lui est désormais plus petite : + 1px de marge en haut et
  //   en bas → 18px ;
  //   rayon 5px, et non la moitié de la hauteur : un RECTANGLE à peine adouci,
  //   pas une gélule. C'est ce qui lui donne l'air d'un surlignage du texte
  //   plutôt que d'un objet posé dessus — une mention est du texte cité, elle
  //   n'a aucune raison de s'en détacher en forme.
  //
  // La marge verticale ne vaut plus les 3px d'une pilule à fond neutre : une
  // pilule TEINTÉE se voit toute seule, elle n'a plus besoin de s'écarter du
  // texte pour exister. 18px de haut sur un corps à 14px, c'est une ligne de
  // texte à peine épaissie — ce qu'une mention doit être.
  //
  // `leading-4` n'est pas cosmétique : sans lui le libellé garde l'interligne
  // du texte qui l'entoure (leading-relaxed, ~23px) et la pilule grandit en
  // hauteur SEULE — le 1px du bas et du haut en paraîtrait alors 4.
  //
  // `inline-block align-baseline`, et surtout PAS `inline-flex align-middle` :
  // une boîte flex n'a pas la ligne de base de son texte (elle prend celle de
  // son premier enfant, ici une figure sans texte), et `align-middle` centre
  // alors la pilule sur la hauteur d'x du paragraphe. Le libellé se retrouve
  // décalé de la ligne du texte qui l'entoure — visible d'un mot à l'autre dans
  // un commentaire. Un `inline-block`, lui, prend la ligne de base de sa
  // dernière ligne, c'est-à-dire celle du libellé : posée sur `baseline`, elle
  // tombe exactement sur celle de la phrase. `whitespace-nowrap` va avec :
  // l'espace entre la figure et le libellé ne doit pas devenir un point de
  // césure, ce que la boîte flex empêchait toute seule.
  const shape = cn(
    "mx-0.5 inline-block whitespace-nowrap rounded-[5px] py-px pr-1.5 align-baseline text-[0.95em] font-medium leading-4",
    // Une image ne descend plus au ras du bord : à 14px dans une boîte de 16,
    // elle ne remplit plus la gouttière, un 1px la collerait au coin.
    hasImage ? "pl-1" : "pl-1.5",
    "bg-(--mention-chip) text-(--mention-chip-ink)",
  );

  const tone = toneStyle(type, avatarSeed ?? id, color);

  if (!href)
    return (
      <span style={tone} className={cn(shape, className)}>
        {figure}
        {label}
      </span>
    );

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
      style={tone}
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
      {label}
    </a>
  );
}

/* ── La teinte ───────────────────────────────────────────────────────────── */

/**
 * La couleur d'un type de mention. Deux d'entre elles ne sont pas des jetons :
 * un objectif porte SA couleur (celle de sa cible partout ailleurs), un projet
 * la teinte de son orbe — donc pas de classes Tailwind, qui sont figées à la
 * compilation. Les autres sont des jetons de app/globals.css.
 *
 * Le ticket et la page gardent le bleu et l'indigo de leur ancienne pastille :
 * la teinte a changé de support, pas de valeur. Une personne, un compte de forge
 * et Numo ne sont PAS de la même famille : un violet pour les humains, la
 * couleur de marque pour l'assistant — la mention dit donc, avant le libellé,
 * si elle appelle quelqu'un ou quelque chose.
 */
function mentionTone(
  type: MentionChipType,
  /** L'identité qui donne la teinte d'un projet : sa graine d'orbe, pour que la
      pilule et l'orbe qu'elle porte restent de la même couleur. */
  seed: string,
  color: string | null | undefined,
): string {
  switch (type) {
    case "member":
    case "forge":
      return "var(--mention-person)";
    case "numo":
      return "var(--brand)";
    case "issue":
      return "var(--mention-issue)";
    case "page":
      return "var(--mention-page)";
    case "objective":
      // Repli compris : un objectif sans couleur donne le gris du texte
      // secondaire, donc une pilule grise — et c'est juste, il n'en a pas.
      return objectiveColor(color);
    case "project":
      // L'aplat EXACT de l'orbe, pas une approximation : la pilule et la
      // pastille qu'elle porte sont côte à côte, un écart de clarté entre les
      // deux se verrait.
      return projectOrbBaseColor(seed);
  }
}

/**
 * Les trois variables que lit la pilule, dérivées de sa teinte. Le fond et
 * l'encre sont la MÊME couleur reposée à deux clartés : le fond à celle qui
 * s'enfonce dans la page, l'encre à celle qui se lit dessus. C'est la syntaxe
 * de couleur relative qui le permet — `oklch(from …)` reprend la teinte et la
 * saturation d'une couleur quelconque (un hexadécimal venu de la base, aussi
 * bien qu'un jeton) et n'en remplace que la clarté.
 *
 * Les clartés et les opacités, elles, vivent dans app/globals.css : elles ne
 * sont pas les mêmes en thème clair et en thème sombre, et une valeur écrite
 * ici ne saurait pas lequel des deux la lit.
 */
function toneStyle(
  type: MentionChipType,
  /** Cf. `mentionTone` : la graine, pas l'id — un projet dont le tirage a été
      relancé doit teindre sa pilule de sa NOUVELLE couleur. */
  seed: string,
  color: string | null | undefined,
): CSSProperties {
  const tone = mentionTone(type, seed, color);
  return {
    "--mention-chip": `oklch(from ${tone} var(--mention-chip-l) c h / var(--mention-chip-a))`,
    "--mention-chip-hover": `oklch(from ${tone} var(--mention-chip-l) c h / var(--mention-chip-a-hover))`,
    "--mention-chip-ink": `oklch(from ${tone} var(--mention-chip-ink-l) c h)`,
  } as CSSProperties;
}
