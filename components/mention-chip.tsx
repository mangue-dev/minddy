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

import { cn } from "mangue-ui";
import { NumoAvatar } from "@/components/actor-avatars";
import { ProjectOrb } from "@/components/project-orb";
import { UserAvatar } from "@/components/user-avatar";

/** L'id de la pseudo-entité « Numo » dans les listes de mentions : l'assistant
    n'est pas un compte, il n'a donc pas d'id à lui. */
export const NUMO_MENTION_ID = "__numo__";

export function MentionChip({
  type,
  id,
  label,
  avatarSeed,
  avatarUrl,
  iconUrl,
  className,
}: {
  type: "member" | "project" | "numo" | "forge";
  /** Membre : user_id. Projet : id du projet — c'est la graine de son orbe.
      Forge : le login, qui est aussi la graine de son portrait de repli.
      Numo n'a rien à identifier : `NUMO_MENTION_ID` fait l'affaire. */
  id: string;
  label: string;
  /** Graine du portrait (elle n'est PAS toujours le user_id). */
  avatarSeed?: string | null;
  /** Forge : le portrait servi par la forge — un vrai visage, pas une graine. */
  avatarUrl?: string | null;
  /** Projet : le favicon importé, quand il y en a un. */
  iconUrl?: string | null;
  className?: string;
}) {
  return (
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
    <span
      className={cn(
        "mx-0.5 inline-flex items-center gap-1 rounded-full bg-(--mention-chip) p-[3px] pr-2.5 align-middle text-[0.95em] font-medium leading-4 text-primary",
        className,
      )}
    >
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
      ) : (
        <ProjectOrb seed={id} iconUrl={iconUrl} className="size-4 rounded-full" />
      )}
      {label}
    </span>
  );
}
