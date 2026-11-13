"use client";

import { useEffect, useRef } from "react";
import { OTPInput, REGEXP_ONLY_DIGITS, type SlotProps } from "input-otp";
import { cn } from "@/lib/utils";

/**
 * Entering a six-digit code — two groups of three, separated by a hyphen
 * (MIN-132). Used by the challenge screen and by enlistment.
 *
 * ## Why one lib, and not six `<input>`
 *
 * Six separate fields break exactly what we want here: the **filling
 * automatic**. Safari, Apple's Passwords app and managers
 * third parties only offer their code on ONE field relating to
 * `autocomplete="one-time-code"` ; six one-character fields don't look like
 * nothing they know how to fill in, and manual pasting then has to be reimplemented
 * by hand (character distribution, focus, backspace).
 *
 * `input-otp` solves this the only way that works: there is **only one real
 * `<input>`**, transparent, superimposed on the boxes. The word manager
 * pass sees a unique six-character field, offers its code and fills it;
 * the paste, arrows, selection and backspace are those of the
 * browser. The boxes are just drawing.
 *
 * The field fills its container up to `max-w-sm`, with square boxes, so it
 * lines up with the full-width buttons of the auth screens.
 *
 * A complete code blurs the field before `onComplete` runs. Left focused,
 * the lib re-selects the first digit when the caret lands back at index 0,
 * and iOS draws that as a text selection with handles while the code is
 * being checked. When the field is enabled again with an empty value (a
 * rejected code), focus returns to it so the next code can be typed.
 *
 * `pushPasswordManagerStrategy: "increase-width"` (the default of the lib) excludes
 * slightly the area when a password manager pad is
 * detected, so that it does not overlap the last digit.
 */

/** A box. Purely decorative: the real field is transparent, above. */
function Slot({ char, isActive, hasFakeCaret }: SlotProps) {
  return (
    <div
      className={cn(
        "relative flex aspect-square min-w-0 flex-1 items-center justify-center rounded-md border border-input bg-card",
        "font-mono text-lg tabular-nums"
      )}
    >
      {char}
      {/* The active box shows a blinking caret and no focus ring: the real
          input is transparent, so this drawn caret is the only place marker. */}
      {isActive && hasFakeCaret && (
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-5 w-px bg-foreground motion-safe:animate-[caret-blink_1.2s_ease-out_infinite]" />
        </div>
      )}
    </div>
  );
}

export function OtpInput({
  id,
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus,
  "aria-label": ariaLabel,
  errorId,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  "aria-label"?: string;
  /** Id of the error shown under the code, while there is one: the field is
      marked invalid and described by it (WCAG 3.3.1). */
  errorId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const wasDisabled = useRef(disabled);

  useEffect(() => {
    const input = inputRef.current;
    if (wasDisabled.current && !disabled && value === "" && input) {
      const active = document.activeElement;
      if (!active || active === document.body) input.focus({ preventScroll: true });
    }
    wasDisabled.current = disabled;
  }, [disabled, value]);

  return (
    <OTPInput
      ref={inputRef}
      id={id}
      value={value}
      onChange={onChange}
      onComplete={(completed: string) => {
        inputRef.current?.blur();
        onComplete?.(completed);
      }}
      maxLength={6}
      disabled={disabled}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      aria-invalid={errorId ? true : undefined}
      aria-describedby={errorId}
      // The numeric keypad on mobile, and nothing but numbers —
      // including when pasting, where the lib filters on this pattern.
      inputMode="numeric"
      pattern={REGEXP_ONLY_DIGITS}
      // Explicit although this is the default of the lib: it is THIS keyword that
      // Safari and password managers seek to offer the
      // generated code. Losing it would silently break the filling.
      autoComplete="one-time-code"
      containerClassName={cn(
        "flex w-full max-w-sm items-center gap-2",
        disabled && "pointer-events-none opacity-60"
      )}
      render={({ slots }) => (
        <>
          <div className="flex flex-1 gap-2">
            {slots.slice(0, 3).map((slot, i) => (
              <Slot key={i} {...slot} />
            ))}
          </div>
          <div aria-hidden className="w-2 shrink-0 text-center text-muted-foreground">
            –
          </div>
          <div className="flex flex-1 gap-2">
            {slots.slice(3).map((slot, i) => (
              <Slot key={i + 3} {...slot} />
            ))}
          </div>
        </>
      )}
    />
  );
}
