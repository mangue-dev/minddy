"use client";

import { useState } from "react";
import { HexColorPicker } from "react-colorful";
import { Input } from "./input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./popover";
import { cn } from "@/lib/utils";

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const FALLBACK_PICKER_COLOR = "#ffffff";

export interface ColorInputProps {
  /** Hex value with leading "#" (e.g. "#ff00aa"). Empty string is allowed. */
  value: string;
  /** Called with the new hex value, with the leading "#". */
  onChange: (next: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  /** Accessible label, applied to the swatch trigger and the hex text input. */
  label?: string;
  /** Visual size — "md" matches the default Input height, "sm" matches h-7. */
  size?: "sm" | "md";
  disabled?: boolean;
}

/**
 * Color picker built on top of react-colorful. The swatch and hex text input
 * share a single container so they read as one control. Clicking the
 * swatch opens a popover with the picker; typing in the field works in parallel.
 * Always uses `#`-prefixed hex strings (CSS canonical form).
 *
 * A local draft mirrors the input value so partial / invalid hex strings can be
 * typed without spamming `onChange` (and downstream autosave) with values that
 * fail validation — the parent is notified only when the draft is a valid
 * 3- or 6-digit hex.
 */
export function ColorInput({
  value,
  onChange,
  onBlur,
  placeholder = "#xxxxxx",
  className,
  label,
  size = "md",
  disabled = false,
}: ColorInputProps) {
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  const [open, setOpen] = useState(false);

  // Re-sync from the parent when the canonical value changes externally
  // (reset, gradient mode swap, etc). React's recommended pattern for
  // resetting state on prop change — runs during render, no extra commit.
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }

  const trimmed = draft.trim();
  const isValid = HEX_COLOR_RE.test(trimmed);
  const swatchColor = isValid ? trimmed : null;
  // react-colorful needs a 6-digit hex. Expand 3-digit shorthand for the picker.
  const pickerColor = isValid ? expandHex(trimmed) : FALLBACK_PICKER_COLOR;

  const handleInputChange = (next: string) => {
    setDraft(next);
    const candidate = next.trim();
    if (HEX_COLOR_RE.test(candidate)) {
      onChange(candidate);
    }
  };

  const handleInputBlur = () => {
    if (!HEX_COLOR_RE.test(draft.trim())) {
      setDraft(value);
    }
    onBlur?.();
  };

  const handlePickerChange = (next: string) => {
    setDraft(next);
    onChange(next);
  };

  const heightClass = size === "sm" ? "h-7" : "h-11 md:h-9";
  const paddingClass = size === "sm" ? "p-0.5 pr-2" : "p-1.5 pr-3.5";
  const swatchRadiusClass = size === "sm" ? "rounded-[5px]" : "rounded-[7px]";
  const textSizeClass = size === "sm" ? "text-xs" : "text-base md:text-sm";
  const textGapClass = size === "sm" ? "pl-1.5" : "pl-3.5";

  return (
    <div
      className={cn(
        "group/color-input relative flex w-full items-center rounded-lg bg-control shadow-xs transition-[color,box-shadow] outline-none",
        "has-disabled:cursor-not-allowed has-disabled:opacity-50 has-disabled:bg-muted",
        heightClass,
        paddingClass,
        className,
      )}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={
              label ? `Open color picker for ${label}` : "Open color picker"
            }
            className={cn(
              "relative aspect-square h-full shrink-0 cursor-pointer overflow-hidden outline-none ring-1 ring-inset ring-border/60 transition-shadow",
               "hover:ring-foreground/20 focus-visible:outline-none focus-visible:ring-0",
              "disabled:cursor-not-allowed",
              swatchRadiusClass,
            )}
            style={swatchColor ? { backgroundColor: swatchColor } : undefined}
          >
            {!swatchColor ? (
              <span
                aria-hidden="true"
                className="absolute inset-0 opacity-40"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg, currentColor 25%, transparent 25%), linear-gradient(-45deg, currentColor 25%, transparent 25%), linear-gradient(45deg, transparent 75%, currentColor 75%), linear-gradient(-45deg, transparent 75%, currentColor 75%)",
                  backgroundSize: "8px 8px",
                  backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0",
                  color: "var(--muted-foreground)",
                }}
              />
            ) : null}
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="color-input-picker w-auto gap-3 p-3"
          align="start"
          sideOffset={6}
        >
          <HexColorPicker color={pickerColor} onChange={handlePickerChange} />
          <Input
            type="text"
            value={draft}
            onChange={(event) => handleInputChange(event.target.value)}
            onBlur={handleInputBlur}
            placeholder={placeholder}
            className="h-9 font-sans text-sm"
            maxLength={7}
            aria-label={label}
          />
        </PopoverContent>
      </Popover>
      <input
        type="text"
        value={draft}
        onChange={(event) => handleInputChange(event.target.value)}
        onBlur={handleInputBlur}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "min-w-0 flex-1 bg-transparent font-sans tracking-wide outline-none",
          "placeholder:text-muted-foreground placeholder:tracking-normal",
          "disabled:cursor-not-allowed",
          textSizeClass,
          textGapClass,
        )}
        aria-label={label}
        maxLength={7}
      />
    </div>
  );
}

function expandHex(hex: string): string {
  if (hex.length === 4) {
    const [, r, g, b] = hex;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return hex;
}
