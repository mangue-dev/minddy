"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Input, Spinner, toast } from "mangue-ui";
import { Shuffle, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { emailLocalPart } from "@/lib/display-name";
import { useMyAvatarSeed, useRegenerateAvatar } from "@/lib/use-my-avatar";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";
import { UserAvatar } from "@/components/user-avatar";

/** Read a string key off the user's auth metadata. */
function metaString(meta: Record<string, unknown>, key: string): string {
  const v = meta[key];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Account profile: avatar + display name (+ read-only email).
 *
 * The avatar can't be chosen: it is drawn from a seed the account carries
 * (public.user_avatars), and the only handle on it is a reroll. The name still
 * lives on the Supabase Auth account (`user_metadata.display_name/full_name`).
 */
export function AccountProfileSection() {
  const { user, updateUser } = useAuth();
  const t = useTranslations("Profile");
  const ta = useTranslations("Account");
  const tCommon = useTranslations("Common");

  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const currentName =
    metaString(meta, "display_name") ||
    metaString(meta, "full_name") ||
    metaString(meta, "name") ||
    emailLocalPart(user?.email) ||
    "";
  const seed = useMyAvatarSeed();
  const regenerate = useRegenerateAvatar();

  const [name, setName] = useState(currentName);
  const [busy, setBusy] = useState(false);

  // Adopt the account's current name once the user resolves.
  useEffect(() => {
    setName(currentName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentName]);

  const dirty = name.trim() !== currentName;

  const save = async () => {
    if (!user) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("nameEmpty"));
      return;
    }
    setBusy(true);
    try {
      await updateUser({
        // Spread existing metadata so we never drop provider fields
        // (locale…) regardless of merge-vs-replace behavior.
        data: { ...meta, full_name: trimmed, display_name: trimmed },
      });
      toast.success(t("updated"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reroll = () => {
    if (regenerate.isPending) return;
    regenerate.mutate(undefined, {
      onError: (e) => toast.error((e as Error).message),
    });
  };

  return (
    <SettingsGroup
      icon={User}
      title={ta("profileSectionTitle")}
      description={ta("profileSectionDesc")}
      footer={
        <Button onClick={() => void save()} disabled={busy || !dirty}>
          {busy && <Spinner />}
          {tCommon("save")}
        </Button>
      }
    >
      {/* L'avatar ne se choisit pas : il se retire. Le portrait tient donc lieu
          de valeur, et le bouton est le geste — comme partout ailleurs. */}
      <SettingsRow
        label={t("avatarLabel")}
        hint={t("avatarHint")}
        control={
          <>
            <UserAvatar seed={seed} className="size-9" />
            <Button
              variant="outline"
              size="sm"
              onClick={reroll}
              disabled={regenerate.isPending}
            >
              {regenerate.isPending ? <Spinner /> : <Shuffle />}
              {t("newAvatar")}
            </Button>
          </>
        }
      />

      <SettingsRow
        htmlFor="account-name"
        label={t("nameLabel")}
        control={
          <Input
            id="account-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            className="w-64"
          />
        }
      />

      {/* L'e-mail ne se modifie pas : le montrer dans un champ grisé promettait
          une saisie qui n'existe pas. C'est une valeur, elle se lit. */}
      {user?.email && (
        <SettingsRow
          label={ta("emailLabel")}
          hint={ta("emailHint")}
          control={
            <span className="text-sm text-muted-foreground">{user.email}</span>
          }
        />
      )}
    </SettingsGroup>
  );
}
