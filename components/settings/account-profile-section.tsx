"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button, Input, Spinner, toast } from "mangue-ui";
import { Download, Shuffle, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { isDesktop } from "@/lib/desktop/bridge";
import { emailLocalPart } from "@/lib/display-name";
import { useAnalytics } from "@/lib/use-analytics";
import { useMyAvatarSeed, useRegenerateAvatar } from "@/lib/use-my-avatar";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
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
  const { track } = useAnalytics();
  // Read AFTER editing: `window.minddy` does not exist in server rendering, and the
  // supposer ferait diverger l'hydratation.
  const [inDesktopApp, setInDesktopApp] = useState(false);
  useEffect(() => setInDesktopApp(isDesktop()), []);
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
      anchor={SETTINGS_SECTIONS.accountProfile}
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
      {/* The avatar does not choose itself: it withdraws. The portrait therefore takes the place
 of value, and the button is the gesture — like everywhere else. */}
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

      {/* The email does not change: showing it in a gray field promised
 an entry that does not exist. It’s a value, it can be read. */}
      {user?.email && (
        <SettingsRow
          label={ta("emailLabel")}
          hint={ta("emailHint")}
          control={
            <span className="text-sm text-muted-foreground">{user.email}</span>
          }
        />
      )}

      {/* The desktop app (MIN-292) — FIXED, without a button to dismiss it.
 Unlike the welcome banner, which only appears once in the life of the account, this is the place where you come back to find the __
 that you had dismissed. A line that can be removed from a setting
 is no longer a setting.

 Absent IN the app: offering to install it to whoever opened it is
 noise. However, it remains visible under Windows and Linux, where its
 label says that it is macOS — it is information, not a promise,
 and leaving it alone would make people believe that the app does not exist. */}
      {!inDesktopApp && (
        <SettingsRow
          label={ta("desktopAppLabel")}
          hint={ta("desktopAppHint")}
          control={
            <Button asChild variant="outline" size="sm">
              <Link
                href="/download"
                onClick={() =>
                  track("desktop_install_prompt_clicked", { surface: "settings" })
                }
              >
                <Download />
                {ta("desktopAppCta")}
              </Link>
            </Button>
          }
        />
      )}
    </SettingsGroup>
  );
}
