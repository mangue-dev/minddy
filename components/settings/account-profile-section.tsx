"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Input, Spinner, toast } from "mangue-ui";
import { Shuffle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { emailLocalPart } from "@/lib/display-name";
import { useMyAvatarSeed, useRegenerateAvatar } from "@/lib/use-my-avatar";
import { SettingsSection } from "@/components/settings-shell";
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
    <SettingsSection
      title={ta("profileSectionTitle")}
      description={ta("profileSectionDesc")}
    >
      <div className="space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <UserAvatar seed={seed} className="size-16" />

          <div className="flex min-w-0 flex-col gap-1.5">
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={reroll}
                disabled={regenerate.isPending}
              >
                {regenerate.isPending ? <Spinner /> : <Shuffle />}
                {t("newAvatar")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("avatarHint")}</p>
          </div>
        </div>

        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="account-name" className="text-sm font-medium">
            {t("nameLabel")}
          </label>
          <Input
            id="account-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            className="max-w-sm"
          />
        </div>

        {/* Email (read-only) */}
        {user?.email && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{ta("emailLabel")}</label>
            <div className="flex h-9 max-w-sm items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
              {user.email}
            </div>
            <p className="text-xs text-muted-foreground">{ta("emailHint")}</p>
          </div>
        )}

        <div>
          <Button onClick={() => void save()} disabled={busy || !dirty}>
            {busy && <Spinner />}
            {tCommon("save")}
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}
