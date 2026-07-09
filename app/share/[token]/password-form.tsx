"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button, Input, Spinner } from "mangue-ui";
import { Lock } from "lucide-react";
import { unlockShare, type UnlockState } from "./actions";

/** Password gate of a password-protected shared view (MIN-26). */
export function PasswordForm({ token }: { token: string }) {
  const t = useTranslations("PublicShare");
  const [state, formAction, pending] = useActionState<UnlockState, FormData>(
    unlockShare.bind(null, token),
    null
  );

  return (
    <form
      action={formAction}
      className="flex w-full max-w-xs flex-col items-center gap-4"
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-muted">
        <Lock className="size-4 text-muted-foreground" />
      </div>
      <p className="text-center text-sm font-medium">{t("protectedTitle")}</p>
      <Input
        type="password"
        name="password"
        placeholder={t("passwordPlaceholder")}
        autoComplete="current-password"
        autoFocus
        required
      />
      {state?.error && (
        <p className="text-sm text-destructive">{t(state.error)}</p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Spinner />}
        {t("unlock")}
      </Button>
    </form>
  );
}
