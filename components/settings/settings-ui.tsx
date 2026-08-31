"use client";

import { Children, createElement, type ReactNode } from "react";
import { cn } from "mangue-ui";
import type { LucideIcon } from "lucide-react";
import {
  settingsSectionAnchor,
  type SettingsSectionId,
} from "@/lib/settings-sections";
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
 * The grammar of the settings screens (MIN-167).
 *
 * Before: `SettingsSection` only gave a `<h2>` and a `children`, so each
 * tab reinvented its layout — switch left here, right there,
 * label above field elsewhere. Six recipes for the same thing.
 *
 * The pattern chosen is not invented: it is that of the Feedback tab (MIN-37),
 * the only tab that read well, raised in shared primitives. Three levels,
 * and each one is MARKED — that's what was missing, everything was in `text-sm` :
 *
 * Page title text-2xl font-display “Settings”
 * └─ Group (card) text-sm font-medium + icon, on map background
 * └─ Row labeled on the left · control on the right, net between two
 *
 * The row is in DEFAULT key/value, not in key/value always: a
 * textarea of 500 characters, an enrollment QR code or a dropzone CSV pass
 * into `orientation="vertical"`. The rule is to only lower the control
 * when it clearly does not fit at the end of the line.
 */

/** Group card: header (icon, title, index, master control), body, footer. */
export function SettingsGroup({
  id,
  icon,
  avatar,
  anchor,
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
  /** Optional DOM destination for non-settings catalogs, such as Admin search. */
  id?: string;
  icon?: LucideIcon;
  /** Full-width visual in place of the icon pad (e.g. a provider logo). */
  avatar?: ReactNode;
  /** Settings catalog entry ([lib/settings-sections.ts]): the map
 * becomes reachable from ⌘K, who opens it then expands and highlights it.
 * The type prohibits an anchor absent from the catalog — the opposite (an entry in the
 * catalog that no one returns) is held by settings-sections.test.ts. */
  anchor?: SettingsSectionId;
  title: string;
  description?: string;
  /** Long prose, taken off the page behind a ⓘ. */
  help?: ReactNode;
  /** Control to the right of the title — the master switch of the group. */
  action?: ReactNode;
  /** Footer: the “Save” button of a submitting group. */
  footer?: ReactNode;
  tone?: "default" | "destructive";
  /** `rows`: `SettingsRow` separated by a net. `block`: free content. */
  variant?: "rows" | "block";
  className?: string;
  children?: ReactNode;
}) {
  const destructive = tone === "destructive";
  // `Children.toArray` throws away the `false` / `null`: without that, a body made of
  // rows all conditional (`{enabled && <Row/>}`) remains “truthy” and
  // the card draws an empty border under its header.
  const hasBody = Children.toArray(children).length > 0;
  return (
    <section
      id={anchor ? settingsSectionAnchor(anchor) : id}
      className={cn(
        "rounded-xl border bg-card text-card-foreground",
        /* `scroll-mt`: the shell unrolls the card CENTERING it, but a card
 higher than the window is aligned at the top — under the sticky header
 without this margin. */
        (anchor || id) && "scroll-mt-20",
        destructive ? "border-destructive/30" : "border-border",
        className,
      )}
    >
      {/* Without an index, the title is alone: ​​aligning it at the top would shift it by
 in relation to its icon pad, for nothing. Every group SHOULD carry a hint — this fallback is only there for the rare headers that don't have one (some admin screen families). */}
      <header
        className={cn(
          "flex justify-between gap-4 p-4",
          description ? "items-start" : "items-center",
        )}
      >
        <div className={cn("flex min-w-0 gap-3", description ? "items-start" : "items-center")}>
          {avatar ? (
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg",
                description && "mt-0.5",
                destructive ? "bg-destructive/10" : "bg-muted",
              )}
            >
              {avatar}
            </span>
          ) : (
            icon && (
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg",
                  description && "mt-0.5",
                  destructive
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {createElement(icon, { className: "size-4" })}
              </span>
            )
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
 * Setting row: label (+ ⓘ) and index on the left, control on the right,
 * drop-down content below. `htmlFor` makes it a real `<label>` — without it
 * it's a title, which is the right choice when the control is not a single field
 * (a group of buttons, a list of gestures).
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
 * Inventory row: a thing that already exists (a git account, a connected app
 *, a linked repository, a recurring ticket) — icon or avatar, name, state in
 * below, gesture to the right. It was copied identically in three sections.
 */
export function SettingsListRow({
  icon: Icon,
  avatar,
  title,
  subtitle,
  action,
  /** The state SAYS why a gesture is not offered: truncating it makes it useless. */
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

/** What is said when there is nothing to show — or not yet. */
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
