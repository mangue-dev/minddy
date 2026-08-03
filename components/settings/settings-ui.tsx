"use client";

import { Children, type ReactNode } from "react";
import { cn } from "mangue-ui";
import type { LucideIcon } from "lucide-react";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
  type FieldOrientation,
} from "@/components/ui/field";
import { HelpHint } from "@/components/settings/help-hint";

/**
 * La grammaire des écrans de réglages (MIN-167).
 *
 * Avant : `SettingsSection` ne donnait qu'un `<h2>` et un `children`, donc chaque
 * onglet réinventait sa mise en page — interrupteur à gauche ici, à droite là,
 * libellé au-dessus du champ ailleurs. Six recettes pour la même chose.
 *
 * Le patron retenu n'est pas inventé : c'est celui de l'onglet Feedback (MIN-37),
 * le seul onglet qui se lisait bien, hissé en primitives partagées. Trois niveaux,
 * et chacun est MARQUÉ — c'est ce qui manquait, tout était en `text-sm` :
 *
 *     Titre de page      text-2xl font-display     « Paramètres »
 *     └─ Groupe (carte)  text-sm font-medium + icône, sur fond de carte
 *        └─ Rangée       libellé à gauche · contrôle à droite, filet entre deux
 *
 * La rangée est en clé/valeur PAR DÉFAUT, pas en clé/valeur toujours : un
 * textarea de 500 caractères, un QR code d'enrôlement ou un dropzone CSV passent
 * en `orientation="vertical"`. La règle est de ne descendre le contrôle que
 * lorsqu'il ne tient manifestement pas au bout de la ligne.
 */

/** Carte de groupe : en-tête (icône, titre, indice, contrôle maître), corps, pied. */
export function SettingsGroup({
  icon: Icon,
  title,
  description,
  help,
  action,
  footer,
  tone = "default",
  variant = "rows",
  className,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Prose longue, sortie de la page derrière un ⓘ. */
  help?: ReactNode;
  /** Contrôle à droite du titre — l'interrupteur maître du groupe. */
  action?: ReactNode;
  /** Pied de carte : le bouton « Enregistrer » d'un groupe qui se soumet. */
  footer?: ReactNode;
  tone?: "default" | "destructive";
  /** `rows` : des `SettingsRow` séparées par un filet. `block` : un contenu libre. */
  variant?: "rows" | "block";
  className?: string;
  children?: ReactNode;
}) {
  const destructive = tone === "destructive";
  // `Children.toArray` jette les `false` / `null` : sans ça, un corps fait de
  // rangées toutes conditionnelles (`{enabled && <Row/>}`) reste « truthy » et
  // la carte dessine un bandeau bordé vide sous son en-tête.
  const hasBody = Children.toArray(children).length > 0;
  return (
    <section
      className={cn(
        "rounded-xl border bg-card text-card-foreground",
        destructive ? "border-destructive/30" : "border-border",
        className,
      )}
    >
      {/* Sans indice, le titre est seul : l'aligner en haut le décalerait par
          rapport à sa pastille d'icône, pour rien. Tout groupe DEVRAIT porter
          un indice — ce repli n'est là que pour les rares en-têtes qui n'en ont
          pas (certaines familles de l'écran admin). */}
      <header
        className={cn(
          "flex justify-between gap-4 p-4",
          description ? "items-start" : "items-center",
        )}
      >
        <div className={cn("flex min-w-0 gap-3", description ? "items-start" : "items-center")}>
          {Icon && (
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg",
                description && "mt-0.5",
                destructive
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="size-4" />
            </span>
          )}
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <h2
                className={cn(
                  "text-sm font-medium",
                  destructive && "text-destructive",
                )}
              >
                {title}
              </h2>
              {help && <HelpHint>{help}</HelpHint>}
            </div>
            {description && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>
        {action && (
          <div className="flex shrink-0 items-center gap-2.5">{action}</div>
        )}
      </header>

      {hasBody && (
        <FieldGroup
          className={cn(
            "border-t",
            destructive ? "border-destructive/30" : "border-border",
            variant === "rows" ? "divide-y divide-border px-4" : "p-4",
          )}
        >
          {children}
        </FieldGroup>
      )}

      {footer && (
        <div
          className={cn(
            "flex items-center justify-end gap-2 border-t px-4 py-3",
            destructive ? "border-destructive/30" : "border-border",
          )}
        >
          {footer}
        </div>
      )}
    </section>
  );
}

/**
 * Rangée de réglage : libellé (+ ⓘ) et indice à gauche, contrôle à droite,
 * contenu déroulant en dessous. `htmlFor` en fait un vrai `<label>` — sans lui
 * c'est un titre, ce qui est le bon choix quand le contrôle n'est pas un champ
 * unique (un groupe de boutons, une liste de gestes).
 */
export function SettingsRow({
  label,
  hint,
  help,
  htmlFor,
  control,
  orientation = "responsive",
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  help?: ReactNode;
  htmlFor?: string;
  control?: ReactNode;
  orientation?: FieldOrientation;
  className?: string;
  children?: ReactNode;
}) {
  const head = (
    <>
      {label}
      {help && <HelpHint>{help}</HelpHint>}
    </>
  );
  return (
    <div className={cn("flex flex-col gap-2.5 py-3.5", className)}>
      <Field orientation={orientation}>
        <FieldContent>
          {htmlFor ? (
            <FieldLabel htmlFor={htmlFor}>{head}</FieldLabel>
          ) : (
            <FieldTitle>{head}</FieldTitle>
          )}
          {hint && <FieldDescription>{hint}</FieldDescription>}
        </FieldContent>
        {control && (
          <div
            className={cn(
              "flex items-center gap-2",
              orientation === "vertical" ? "w-full" : "shrink-0",
            )}
          >
            {control}
          </div>
        )}
      </Field>
      {children}
    </div>
  );
}

/**
 * Rangée d'inventaire : une chose qui existe déjà (un compte git, une app
 * connectée, un dépôt lié, un ticket récurrent) — icône ou avatar, nom, état en
 * dessous, geste à droite. Elle était recopiée à l'identique dans trois sections.
 */
export function SettingsListRow({
  icon: Icon,
  avatar,
  title,
  subtitle,
  action,
  /** L'état DIT pourquoi un geste n'est pas offert : le tronquer le rend inutile. */
  truncateSubtitle = true,
  className,
}: {
  icon?: LucideIcon;
  avatar?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  truncateSubtitle?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3 py-3", className)}>
      {avatar ??
        (Icon && (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </span>
        ))}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        {subtitle && (
          <div
            className={cn(
              "text-xs text-muted-foreground",
              truncateSubtitle && "truncate",
            )}
          >
            {subtitle}
          </div>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

/** Ce qui se dit quand il n'y a rien à montrer — ou pas encore. */
export function SettingsEmpty({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <p className={cn("py-3.5 text-sm text-muted-foreground", className)}>
      {children}
    </p>
  );
}
