"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { UserAvatarPicker } from "@/components/user-avatar-picker";
import { AUTH_SUBMIT_CLASS } from "@/components/auth/auth-chrome";
import { FirstRunLayer } from "@/components/first-run/first-run-layer";
import { useAuth } from "@/lib/auth-context";
import { PROFILE_SETUP_META_KEY, suggestedName } from "@/lib/first-run";
import { useAnalytics } from "@/lib/use-analytics";
import { useMyAvatarSource, useRegenerateAvatar, useUploadAvatar } from "@/lib/use-my-avatar";

/**
 * The name and the picture of a new account (MIN-907), asked once, right
 * after the first sign-in, on every platform. Sign-up only asks for an
 * address and a password; an account from a sign-in service arrives with
 * the service's name in the field.
 */
export function ProfileSetupScreen({ onDone }: {
  /** Back from the tour: saving returns to it instead of the gate. */
  onDone?: () => void;
} = {}) {
  const t = useTranslations("Auth");
  const tCommon = useTranslations("Common");
  const { user, updateUserMetadata } = useAuth();
  const { track } = useAnalytics();
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const [name, setName] = useState(() => suggestedName(meta));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const avatar = useMyAvatarSource();
  // The tour follows: its code loads while the name is typed.
  useEffect(() => {
    void import("@/components/first-run/onboarding-screen");
  }, []);
  const regenerate = useRegenerateAvatar();
  const upload = useUploadAvatar();

  const save = async () => {
    const next = name.trim();
    if (!next) return setError(t("nameRequired"));
    setError(null);
    setSaving(true);
    try {
      await updateUserMetadata({ full_name: next, display_name: next, [PROFILE_SETUP_META_KEY]: true });
      track("profile_updated", { field: "name" });
      setSaving(false);
      onDone?.();
    } catch (err) {
      setError((err as Error).message || t("errorUnexpected"));
      setSaving(false);
    }
  };

  return (
    <FirstRunLayer label={t("signupIdentityTitle")}>
      <form
        className="space-y-6"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="text-center">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-balance">{t("signupIdentityTitle")}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("signupIdentitySubtitle")}</p>
        </div>
        <UserAvatarPicker
          source={avatar}
          uploadLabel={t("uploadAvatar")}
          generateLabel={t("newLoreleiAvatar")}
          uploading={upload.isPending}
          generating={regenerate.isPending}
          onUpload={(file) => {
            if (file.type && !file.type.startsWith("image/")) {
              toast.error(t("avatarInvalidFile"));
              return;
            }
            upload.mutate(file, { onError: (err) => toast.error((err as Error).message) });
          }}
          onGenerate={() => regenerate.mutate(undefined, { onError: (err) => toast.error((err as Error).message) })}
        />
        <div className="space-y-3">
          <Input
            id="profile-name"
            aria-label={t("fullName")}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "profile-error" : undefined}
            className="h-12 app-desktop:h-12 bg-control text-base"
            autoComplete="nickname"
            enterKeyHint="done"
            placeholder={t("fullNamePlaceholder")}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {error ? (
            <p id="profile-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={saving} className={AUTH_SUBMIT_CLASS}>
            {saving && <Spinner />}
            {tCommon("continue")}
          </Button>
        </div>
      </form>
    </FirstRunLayer>
  );
}
