"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import {
  AssigneePicker,
  CategoriesPicker,
  DueDatePicker,
  EffortPicker,
  FIELD_TRIGGER,
  ObjectivePicker,
  PriorityPicker,
  StatusPicker,
} from "@/components/issue-field-pickers";

/* Borderless key/value fields for the issue panel: the value control has no
   button chrome and opens a searchable dropdown, right-aligned. The pickers
   themselves live in issue-field-pickers.tsx (the "row" variant). */

/** The row trigger chrome, for the rows that are not a plain field picker
 *  (relations, agent, pull request…). */
export const TRIGGER = FIELD_TRIGGER.row;

export function PropertyRow({
  label,
  labelClassName,
  children,
}: {
  label: string;
  labelClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-property-row className="flex min-h-9 items-center justify-between gap-3">
      <span className={cn("shrink-0 text-sm text-foreground", labelClassName)}>{label}</span>
      <div className="flex min-w-0 flex-1 items-center justify-end">{children}</div>
    </div>
  );
}

type RowProps<P> = Omit<P, "variant" | "showValue">;

export function StatusValue(props: RowProps<ComponentProps<typeof StatusPicker>>) {
  return <StatusPicker variant="row" {...props} />;
}

export function PriorityValue(props: RowProps<ComponentProps<typeof PriorityPicker>>) {
  return <PriorityPicker variant="row" {...props} />;
}

export function EffortValue(props: RowProps<ComponentProps<typeof EffortPicker>>) {
  return <EffortPicker variant="row" {...props} />;
}

export function AssigneeValue(props: RowProps<ComponentProps<typeof AssigneePicker>>) {
  return <AssigneePicker variant="row" {...props} />;
}

export function CategoryValue(props: RowProps<ComponentProps<typeof CategoriesPicker>>) {
  return <CategoriesPicker variant="row" {...props} />;
}

export function DueDateValue(props: RowProps<ComponentProps<typeof DueDatePicker>>) {
  return <DueDatePicker variant="row" {...props} />;
}

export function ObjectiveValue(props: RowProps<ComponentProps<typeof ObjectivePicker>>) {
  return <ObjectivePicker variant="row" {...props} />;
}
