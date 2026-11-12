"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import { Button } from "./button";
import { ButtonGroup } from "./button-group";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/mobile/haptics";

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

const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown"]);
const PREVIOUS_KEYS = new Set(["ArrowLeft", "ArrowUp"]);

/**
 * Segmented selector built on top of `ButtonGroup`. Mirrors the
 * light/dark/auto theme picker from the studio composition editor —
 * extracted here so other surfaces (background mode, etc.) can reuse the
 * same affordance.
 *
 * One value among several, so it is a radio group (WCAG 4.1.2): a single Tab
 * stop on the chosen option, arrows move and choose, Home and End jump to
 * the ends, as the native radio buttons do.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  ariaLabel,
}: SegmentedControlProps<T>) {
  const labelId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = Math.max(0, options.findIndex((option) => option.value === value));

  // A new value ticks in the mobile app (MIN-959); the current one is silent.
  const pick = (next: T) => {
    if (next !== value) haptic("selection");
    onChange(next);
  };

  const choose = (index: number) => {
    const option = options[(index + options.length) % options.length];
    if (!option) return;
    pick(option.value);
    refs.current[options.indexOf(option)]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let target: number | null = null;
    if (NEXT_KEYS.has(event.key)) target = index + 1;
    else if (PREVIOUS_KEYS.has(event.key)) target = index - 1;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = options.length - 1;
    if (target === null) return;
    event.preventDefault();
    choose(target);
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <span id={labelId} className="block text-[12px] font-medium text-foreground">
          {label}
        </span>
      )}
      <ButtonGroup
        role="radiogroup"
        className="w-full"
        aria-label={ariaLabel}
        aria-labelledby={!ariaLabel && label ? labelId : undefined}
      >
        {options.map((option, index) => {
          const active = index === selected;
          return (
            <Button
              key={option.value}
              ref={(node) => { refs.current[index] = node; }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              variant={active ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => pick(option.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {option.label}
            </Button>
          );
        })}
      </ButtonGroup>
    </div>
  );
}
