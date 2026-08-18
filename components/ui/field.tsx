"use client";

import type { ComponentProps } from "react";
import { cn } from "mangue-ui";

/**
 * `Field` — the shadcn/ui form LAYOUT primitive, copied
 * here (MIN-167).
 *
 * Why it is not in `mangue-ui`: the lib has been checked out from AutoKap
 * before shadcn added `Field`. It therefore exposes excellent CONTROLS
 * (Switch, Select, Input, Card…) but no grammar for SETTING them — no
 * `Field`, no `FormRow`. Result: each settings screen wrote its own
 * `flex`, and six authors wrote six different ones. This is the root cause
 * that MIN-167 fixes.
 *
 * Two assumed deviations from the original:
 * - `cva` is replaced by class tables (no dependencies added —
 * the repository maintains two lockfiles, c. already
 * a `id`).
 *
 * The `responsive` orientation is what the ticket asked for: key on the left,
 * value on the right on the same line, stacked below `@md`. It relies on a CONTAINER query — the width of the group, not the width of the
 * window — so `Field responsive` must live under a `FieldGroup`.
 */

type FieldOrientation = "vertical" | "horizontal" | "responsive";

const ORIENTATION: Record<FieldOrientation, string> = {
  vertical: "flex-col items-stretch",
  horizontal: "flex-row items-center justify-between",
  responsive:
    "flex-col items-stretch @md/field-group:flex-row @md/field-group:items-center @md/field-group:justify-between",
};

/** Group of fields. Carries the container query that `responsive` lives on. */
function FieldGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn("@container/field-group flex flex-col", className)}
      {...props}
    />
  );
}

/** A field: the content (label + index) on one side, the control on the other. */
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

/** The left column: label, title, description. Shrinks, does not overflow. */
function FieldContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn("flex min-w-0 flex-1 flex-col gap-0.5", className)}
      {...props}
    />
  );
}

/** Clickable label of a control. */
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

/** Title of a field that has no unique control to designate (not a `<label>`). */
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

/** The hint under the label: what the setting does, in one sentence. */
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

/** The error message for a field. */
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

/** Rule between two fields — the border, not the solid `Separator`. */
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

/** Named subset of fields (`<fieldset>` + its caption). */
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
