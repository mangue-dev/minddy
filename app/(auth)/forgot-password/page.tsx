import { Suspense } from "react";
import { Spinner } from "mangue-ui";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

/**
 * “Forgotten password” (MIN-297). Public page — we're getting there precisely
 * because we can't connect. The `Suspense` is that of its
 * neighbors: the form reads `useSearchParams` (the address already typed on
 * the login screen), which requires a rendering border.
 */
export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<Spinner className="size-6" />}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
