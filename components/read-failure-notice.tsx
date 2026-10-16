"use client";

import { useEffect, useReducer } from "react";
import { useTranslations } from "next-intl";
import { Button } from "mangue-ui/components/ui/button";
import { cn } from "mangue-ui/lib/utils";
import { readFailureKind, readFailureRetryAt } from "@/lib/read-failure";
import { signInRedirectAfterSignOut } from "@/lib/signed-out-redirect";

/**
 * The explanation and next step of a failed read (MIN-691). An ended session
 * or a pending second factor offers sign-in instead of a retry that cannot
 * succeed; a rate-limited read keeps Retry disabled until its deadline.
 * `message` is the surface's own wording for the other failure kinds.
 */
export function ReadFailureNotice({
  error,
  message,
  retryLabel,
  onRetry,
  className,
}: {
  error: unknown;
  message: string;
  retryLabel: string;
  onRetry: () => void;
  className?: string;
}) {
  const t = useTranslations("Common");
  const kind = readFailureKind(error);
  const retryAt = kind === "rateLimited" ? readFailureRetryAt(error) : 0;
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  const waiting = retryAt > Date.now();
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(rerender, retryAt - Date.now());
    return () => window.clearTimeout(timer);
  }, [waiting, retryAt]);
  const session = kind === "signedOut" || kind === "secondFactor";
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground", className)}
      role="alert" data-read-failure={kind}>
      <p>{kind === "signedOut" ? t("readSessionEnded") : kind === "secondFactor" ? t("readSecondFactor") : message}</p>
      {session ? (
        <Button variant="ghost" size="sm" onClick={() => {
          window.location.assign(signInRedirectAfterSignOut(window.location.pathname, window.location.search) ?? "/login");
        }}>{t("readSignInAgain")}</Button>
      ) : (
        <Button variant="ghost" size="sm" disabled={waiting} onClick={onRetry}>{retryLabel}</Button>
      )}
    </div>
  );
}
