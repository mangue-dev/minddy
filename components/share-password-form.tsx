"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button, Input, Spinner } from "mangue-ui";
import { Lock } from "lucide-react";
import { IsoIcon } from "@/components/illustrations/iso-icon";

/** PublicShare namespace key rendered under the field. */
export type ShareUnlockState = {
  error: "wrongPassword" | "tooManyAttempts";
} | null;

/**
 * The door to a password-protected share — only one, for the shared view
 * (MIN-26) as well as for the published page (MIN-283).
 *
 * The form knows NOTHING about what it is protecting: that's half the point.
 * A share locked should not reveal the view name, the page title, or the project title — only that it is locked, which the visitor already sees. The action comes from the road: each person knows their return path and the path of their cookie.
 *
 * The padlock is an isometric SCENE, like the empty states of the application
 * (components/illustrations/iso-icon.tsx): this screen is often the first
 * thing a customer sees from minddy, and a gray dot with a
 * 16 px icon there looks like an error. The drawing is the same language as the rest of the
 * product, without a stroke of SVG to write.
 */
export function SharePasswordForm({
  action,
  title,
}: {
  action: (prev: ShareUnlockState, formData: FormData) => Promise<ShareUnlockState>;
  /** The label above the field. By default, that of the shared view. */
  title?: string;
}) {
  const t = useTranslations("PublicShare");
  const [state, formAction, pending] = useActionState<ShareUnlockState, FormData>(
    action,
    null
  );

  return (
    <form
      action={formAction}
      className="flex w-full max-w-xs flex-col items-center gap-4"
    >
      <IsoIcon icon={Lock} className="w-28" />
      <p className="text-center text-sm font-medium">
        {title ?? t("protectedTitle")}
      </p>
      <Input
        type="password"
        name="password"
        placeholder={t("passwordPlaceholder")}
        autoComplete="current-password"
        autoFocus
        required
      />
      {state?.error && <p className="text-sm text-destructive">{t(state.error)}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Spinner />}
        {t("unlock")}
      </Button>
    </form>
  );
}
