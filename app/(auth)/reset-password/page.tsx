import { ResetPasswordForm } from "@/components/auth/reset-password-form";

/**
 * Setting the new password (MIN-297).
 *
 * The page is NOT in `lib/protected-prefixes.ts`, and this is deliberate: the
 * proxy there would refer to `/login` anyone who arrives without a session — i.e.
 * with an outdated link — and the person would lose sight of what they had come for
 * TO DO. The screen knows how to say “this link is no longer active” and offers to
 * ask for another one. There is nothing to protect here: without a session, the
 * `updateUser` that it carries fails anyway on the GoTrue side.
 */
export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
