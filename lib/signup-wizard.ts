/**
 * What the registration wizard KNOWS, off-screen (MIN-300).
 *
 * Registration is no longer a tab on the login form: it's a
 * three-step journey, on its own route (`/signup`). This module carries
 * the part that makes sense — the order of steps, what makes a step valid,
 * and the URL parameters that should survive going from one auth screen to
 * the other. The component only draws and calls Supabase.
 *
 * The validation returns a CODE, never a sentence: the message is translated to
 * the display (namespace `Auth`), and a module tested in `environment: node`
 * does not have translator on hand.
 */

import { passwordMeetsPolicy } from "@/lib/password-policy";

/** The steps, in order. The email journey goes through them all. */
export const SIGNUP_STEPS = ["account", "identity", "password"] as const;

export type SignupStep = (typeof SIGNUP_STEPS)[number];

export interface SignupValues {
  email: string;
  fullName: string;
  password: string;
  confirmPassword: string;
}

/**
 * What is missing in the current step. Each code is a key of the namespace
 * `Auth` — the lookup table lives in the component, so that the
 * i18n contract remains verifiable by `lib/i18n-contract.test.ts`.
 */
export type SignupIssue =
  | "emailRequired"
  | "emailInvalid"
  | "nameRequired"
  | "passwordPolicy"
  | "passwordMismatch";

/**
 * Enough to catch the typo, not enough to claim to validate a
 * address: only email confirmation really does it. The browser
 * applies the same rule on a `<input type="email">` — this one exists so that
 * the “Continue” button knows to say no BEFORE submission.
 */
export function isValidEmail(value: string): boolean {
  const email = value.trim();
  if (email.length < 3 || /\s/.test(email)) return false;
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@")) return false;
  const domain = email.slice(at + 1);
  return domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}

/** What blocks this step, or `null` if it can advance. */
export function validateSignupStep(
  step: SignupStep,
  values: SignupValues
): SignupIssue | null {
  switch (step) {
    case "account":
      if (!values.email.trim()) return "emailRequired";
      return isValidEmail(values.email) ? null : "emailInvalid";
    case "identity":
      // The name is the only field in its step: skipping it empty would give a
      // account whose email address the app would display everywhere (see the rule
      // from display-name), which we don't want for him or his teammates.
      return values.fullName.trim() ? null : "nameRequired";
    case "password":
      // Policy first: it is DISPLAYED, rule by rule, under the
      // field. Comparing the two entries before holding it would show
      // "do not match" on a password that the server was going to
      // refuse anyway.
      if (!passwordMeetsPolicy(values.password)) return "passwordPolicy";
      return values.password === values.confirmPassword ? null : "passwordMismatch";
  }
}

/** The next step, or `null` on the last one. */
export function nextSignupStep(step: SignupStep): SignupStep | null {
  return SIGNUP_STEPS[SIGNUP_STEPS.indexOf(step) + 1] ?? null;
}

/** The previous step, or `null` on the first. */
export function previousSignupStep(step: SignupStep): SignupStep | null {
  const index = SIGNUP_STEPS.indexOf(step);
  return index > 0 ? (SIGNUP_STEPS[index - 1] ?? null) : null;
}

/**
 * Parameters that should FOLLOW from one auth screen to another, and only them.
 *
 * `redirect` carries the original destination (the proxy sets it by returning here),
 * `invite` carries the invite link: pass from "create an account" to "I have
 * already an account" losing them would send the person back to `/home` without
 * ever joining the project that was waiting for them. Everything else (`error`, `mode`,
 * a `utm_*`…) belongs to the screen we came from and is not copied.
 *
 * Returns a query string prefixed with `?`, or `""` if there is nothing to pass.
 */
export function preserveAuthParams(
  search: URLSearchParams | string,
  extra?: Record<string, string>
): string {
  const source =
    typeof search === "string" ? new URLSearchParams(search) : search;
  const kept = new URLSearchParams();
  for (const key of ["redirect", "invite"] as const) {
    const value = source.get(key);
    if (value) kept.set(key, value);
  }
  for (const [key, value] of Object.entries(extra ?? {})) kept.set(key, value);
  const query = kept.toString();
  return query ? `?${query}` : "";
}
