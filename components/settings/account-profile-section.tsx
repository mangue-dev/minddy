"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ImageUploadIcon, PencilEdit02Icon, ShuffleIcon } from "@hugeicons/core-free-icons";
import {useRef} from "react";
import {useTranslations} from "next-intl";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {useAuth} from "@/lib/auth-context";
import {emailLocalPart} from "@/lib/display-name";
import {useAnalytics} from "@/lib/use-analytics";
import {useMyAvatarSource, useRegenerateAvatar, useUploadAvatar} from "@/lib/use-my-avatar";
import {SettingsBlock} from "@/components/settings/settings-ui";
import {SETTINGS_SECTIONS} from "@/lib/settings-sections";
import {InlineEditField} from "@/components/settings/inline-edit-field";
import {UserAvatar} from "@/components/user-avatar";
import {ProfileStatistics} from "@/components/stats/profile-statistics";

/** Read a string key off the user's auth metadata. */
function metaString(meta: Record<string, unknown>, key: string): string {
  const v = meta[key];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Account → Profile (MIN-737): who I am, then what I did. The identity sits
 * centered at the top and is edited where it is shown — no Edit button:
 *
 * - the avatar opens a menu to generate a new Lorelei avatar or upload an
 *   image, applied as soon as it is picked;
 * - the name turns into a field in place on desktop (Enter or leaving the
 *   field saves, Escape cancels), and opens a bottom sheet in the mobile
 *   layout, where an in-place field would sit under the software keyboard.
 *
 * The name lives on the Supabase Auth account
 * (`user_metadata.display_name/full_name`). The personal statistics —
 * formerly their own /statistics page — follow underneath.
 */
export function AccountProfileSection() {
  const { user, updateUser } = useAuth();
  const t = useTranslations("Profile");
  const ta = useTranslations("Account");
  const tStats = useTranslations("Stats");

  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const currentName =
    metaString(meta, "display_name") ||
    metaString(meta, "full_name") ||
    metaString(meta, "name") ||
    emailLocalPart(user?.email) ||
    "";
  const avatarSource = useMyAvatarSource();
  const { track } = useAnalytics();
  const regenerate = useRegenerateAvatar();
  const upload = useUploadAvatar();
  const avatarBusy = regenerate.isPending || upload.isPending;
  const fileRef = useRef<HTMLInputElement>(null);

  const saveName = async (next: string) => {
    if (!user) return;
    await updateUser({
      // Spread existing metadata so we never drop provider fields
      // (locale…) regardless of merge-vs-replace behavior.
      data: { ...meta, full_name: next, display_name: next },
    });
    toast.success(t("updated"));
  };

  const reroll = () => {
    if (avatarBusy) return;
    regenerate.mutate(undefined, {
      onError: (e) => toast.error((e as Error).message),
      onSuccess: () => track("profile_updated", { field: "avatar" }),
    });
  };

  const uploadFile = (file: File) => {
    if (avatarBusy) return;
    if (file.type && !file.type.startsWith("image/")) {
      toast.error(t("avatarInvalidFile"));
      return;
    }
    upload.mutate(file, {
      onError: (error) => toast.error((error as Error).message),
      onSuccess: () => track("profile_updated", { field: "avatar" }),
    });
  };

  return (
    <>
      <SettingsBlock
        anchor={SETTINGS_SECTIONS.accountProfile}
        label={ta("profileSectionTitle")}
        className="flex flex-col items-center px-4 pt-6 pb-2 text-center"
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) uploadFile(file);
            // Selecting the same file again must trigger another change event.
            event.target.value = "";
          }}
        />
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={avatarBusy}
            aria-label={t("changeAvatar")}
            className="group relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <UserAvatar seed={avatarSource} className="size-24 ring-1 ring-border" />
            {/* The badge says the picture can be changed, on touch screens too
                where there is no hover. */}
            <span
              aria-hidden
              className="absolute right-0 bottom-0 flex size-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-xs transition-colors group-hover:text-foreground"
            >
              {avatarBusy ? (
                <Spinner className="size-3.5" />
              ) : (
                <HugeiconsIcon icon={PencilEdit02Icon} className="size-3.5" />
              )}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <DropdownMenuItem onSelect={reroll}>
              <HugeiconsIcon icon={ShuffleIcon} />
              {t("newLoreleiAvatar")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
              <HugeiconsIcon icon={ImageUploadIcon} />
              {t("uploadAvatar")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <InlineEditField
          value={currentName}
          onSave={user ? saveName : undefined}
          label={t("nameLabel")}
          editLabel={t("editName", { name: currentName })}
          placeholder={t("namePlaceholder")}
          validate={(next) => (next ? null : t("nameEmpty"))}
          className="mt-4 flex h-10 max-w-full items-center justify-center"
          inputClassName="h-10 w-72 max-w-full text-center text-xl font-semibold"
        >
          <span className="truncate text-2xl font-semibold tracking-tight">
            {currentName}
          </span>
        </InlineEditField>
        {/* The email does not change, so it reads as a value, not a field. */}
        {user?.email && (
          <p className="mt-1 max-w-full truncate text-sm text-muted-foreground">
            {user.email}
          </p>
        )}
      </SettingsBlock>

      <SettingsBlock
        anchor={SETTINGS_SECTIONS.accountStatistics}
        label={tStats("title")}
      >
        <ProfileStatistics />
      </SettingsBlock>

    </>
  );
}
