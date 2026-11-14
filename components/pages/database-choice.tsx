"use client";

import type { ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type DatabaseChoiceOption = {
  value: string;
  label: string;
  /** Shown before the label, in the list and on the closed field. */
  icon?: ReactNode;
};

/**
 * A closed list of choices in a database's sort and filter controls. A column
 * choice carries its type icon, so a column is recognized the way the table
 * header shows it.
 */
export function DatabaseChoice({ value, onChange, label, options, className }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: DatabaseChoiceOption[];
  className?: string;
}) {
  return (
    <Select value={value || "__empty__"} onValueChange={(next) => onChange(next === "__empty__" ? "" : next)}>
      <SelectTrigger aria-label={label} className={className ?? "w-full min-w-0"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="[&_[role=option]]:rounded-sm">
        {options.map((option) => (
          <SelectItem key={option.value || "__empty__"} value={option.value || "__empty__"}>
            {option.icon}
            <span className="min-w-0 truncate">{option.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
