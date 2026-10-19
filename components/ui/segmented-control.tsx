"use client";

import { Button } from "./button";
import { ButtonGroup } from "./button-group";
import { cn } from "@/lib/utils";

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
  className?: string;
  ariaLabel?: string;
}

/**
 * Segmented selector built on top of `ButtonGroup`. Mirrors the
 * light/dark/auto theme picker from the studio composition editor —
 * extracted here so other surfaces (background mode, etc.) can reuse the
 * same affordance.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label className="text-[12px] font-medium text-foreground">
          {label}
        </label>
      )}
      <ButtonGroup className="w-full" aria-label={ariaLabel ?? label}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Button
              key={option.value}
              type="button"
              variant={active ? "default" : "outline"}
              size="sm"
              className="flex-1"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </Button>
          );
        })}
      </ButtonGroup>
    </div>
  );
}
