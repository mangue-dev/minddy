"use client";

import { OTPInput, REGEXP_ONLY_DIGITS, type SlotProps } from "input-otp";
import { cn } from "mangue-ui";

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
 * `pushPasswordManagerStrategy: "increase-width"` (the default of the lib) excludes
 * slightly the area when a password manager pad is
 * detected, so that it does not overlap the last digit.
 */

/** A box. Purely decorative: the real field is transparent, above. */
function Slot({ char, isActive }: SlotProps) {
  return (
    <div
      className={cn(
        "flex h-11 w-10 items-center justify-center rounded-md border border-input bg-card",
        "font-mono text-base tabular-nums transition-colors",
        // No fake blinking cursor: it would require a global keyframe
        // for this component alone, while the ring already says where we are —
        // and it is the focus indication of the other fields of the app.
        isActive && "z-10 border-ring ring-2 ring-ring/40"
      )}
    >
      {char}
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
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  "aria-label"?: string;
}) {
  return (
    <OTPInput
      id={id}
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      maxLength={6}
      disabled={disabled}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      // The numeric keypad on mobile, and nothing but numbers —
      // including when pasting, where the lib filters on this pattern.
      inputMode="numeric"
      pattern={REGEXP_ONLY_DIGITS}
      // Explicit although this is the default of the lib: it is THIS keyword that
      // Safari and password managers seek to offer the
      // generated code. Losing it would silently break the filling.
      autoComplete="one-time-code"
      containerClassName={cn(
        "flex items-center gap-2",
        disabled && "pointer-events-none opacity-60"
      )}
      render={({ slots }) => (
        <>
          <div className="flex gap-2">
            {slots.slice(0, 3).map((slot, i) => (
              <Slot key={i} {...slot} />
            ))}
          </div>
          <div aria-hidden className="w-2 text-center text-muted-foreground">
            –
          </div>
          <div className="flex gap-2">
            {slots.slice(3).map((slot, i) => (
              <Slot key={i + 3} {...slot} />
            ))}
          </div>
        </>
      )}
    />
  );
}
