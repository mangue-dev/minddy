"use client";

import type { ComponentProps } from "react";
import { cn } from "mangue-ui";

/**
 * `Field` — la primitive de MISE EN PAGE de formulaire de shadcn/ui, recopiée
 * ici (MIN-167).
 *
 * Pourquoi elle n'est pas dans `mangue-ui` : la lib a été extraite d'AutoKap
 * avant que shadcn n'ajoute `Field`. Elle expose donc d'excellents CONTRÔLES
 * (Switch, Select, Input, Card…) mais aucune grammaire pour les POSER — pas de
 * `Field`, pas de `FormRow`. Résultat : chaque écran de réglages écrivait son
 * propre `flex`, et six auteurs en ont écrit six différents. C'est la cause
 * racine que MIN-167 corrige.
 *
 * Deux écarts assumés avec l'original :
 * - `cva` est remplacé par des tables de classes (aucune dépendance ajoutée —
 *   le dépôt maintient deux lockfiles, cf. CLAUDE.md) ;
 * - le `Label` de Radix est remplacé par un `<label>` stylé : on n'a besoin ni
 *   de son `asChild`, ni de sa propagation de clic (les contrôles portent déjà
 *   un `id`).
 *
 * L'orientation `responsive` est ce que demandait le ticket : clé à gauche,
 * valeur à droite sur une même ligne, empilées en dessous de `@md`. Elle
 * s'appuie sur une CONTAINER query — la largeur du groupe, pas celle de la
 * fenêtre — donc `Field responsive` doit vivre sous un `FieldGroup`.
 */

type FieldOrientation = "vertical" | "horizontal" | "responsive";

const ORIENTATION: Record<FieldOrientation, string> = {
  vertical: "flex-col items-stretch",
  horizontal: "flex-row items-center justify-between",
  responsive:
    "flex-col items-stretch @md/field-group:flex-row @md/field-group:items-center @md/field-group:justify-between",
};

/** Groupe de champs. Porte la container query dont vit `responsive`. */
function FieldGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn("@container/field-group flex flex-col", className)}
      {...props}
    />
  );
}

/** Un champ : le contenu (libellé + indice) d'un côté, le contrôle de l'autre. */
function Field({
  className,
  orientation = "vertical",
  ...props
}: ComponentProps<"div"> & { orientation?: FieldOrientation }) {
  return (
    <div
      data-slot="field"
      data-orientation={orientation}
      className={cn(
        "group/field flex w-full gap-2 data-[invalid=true]:text-destructive",
        ORIENTATION[orientation],
        className,
      )}
      {...props}
    />
  );
}

/** La colonne de gauche : libellé, titre, description. Rétrécit, ne déborde pas. */
function FieldContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn("flex min-w-0 flex-1 flex-col gap-0.5", className)}
      {...props}
    />
  );
}

/** Libellé cliquable d'un contrôle. */
function FieldLabel({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      data-slot="field-label"
      className={cn(
        "flex w-fit items-center gap-1.5 text-sm leading-snug font-medium text-foreground",
        "group-data-[disabled=true]/field:opacity-50",
        "has-[+*]:cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

/** Titre d'un champ qui n'a pas de contrôle unique à désigner (pas un `<label>`). */
function FieldTitle({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="field-title"
      className={cn(
        "flex w-fit items-center gap-1.5 text-sm leading-snug font-medium text-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** L'indice sous le libellé : ce que le réglage fait, en une phrase. */
function FieldDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn(
        "text-xs leading-relaxed font-normal text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** Le message d'erreur d'un champ. */
function FieldError({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="field-error"
      role="alert"
      className={cn("text-sm text-destructive", className)}
      {...props}
    />
  );
}

/** Filet entre deux champs — le liseré, pas le `Separator` plein. */
function FieldSeparator({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="field-separator"
      role="separator"
      className={cn("h-px w-full bg-border", className)}
      {...props}
    />
  );
}

/** Sous-ensemble nommé de champs (`<fieldset>` + sa légende). */
function FieldSet({ className, ...props }: ComponentProps<"fieldset">) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn("flex min-w-0 flex-col gap-3", className)}
      {...props}
    />
  );
}

function FieldLegend({ className, ...props }: ComponentProps<"legend">) {
  return (
    <legend
      data-slot="field-legend"
      className={cn("text-sm font-medium text-foreground", className)}
      {...props}
    />
  );
}

export {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
  type FieldOrientation,
};
