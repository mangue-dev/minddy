"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Input, Spinner, toast } from "mangue-ui";
import { Upload } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getSupabase } from "@/lib/supabase";
import { emailLocalPart } from "@/lib/display-name";
import { avatarColor, initials } from "@/lib/avatar";
import { compressImage } from "@/lib/image-compress";
import { SettingsSection } from "@/components/settings-shell";

// Anything under this is accepted and compressed down to fit; above it we ask
// for a smaller file (avoids loading a huge image into a canvas).
const HARD_CAP = 25 * 1024 * 1024; // 25 MB

/** Read a string key off the user's auth metadata. */
function metaString(meta: Record<string, unknown>, key: string): string {
  const v = meta[key];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Account profile: avatar + display name (+ read-only email). Both editable
 * fields live on the Supabase Auth account — the name in `user_metadata`
 * (display_name/full_name), the avatar as a Storage file whose URL is saved to
 * `user_metadata.avatar_url`. Ported from the former ProfileDialog.
 */
export function AccountProfileSection() {
  const { user, updateUser } = useAuth();
  const t = useTranslations("Profile");
  const ta = useTranslations("Account");
  const tCommon = useTranslations("Common");
  const fileRef = useRef<HTMLInputElement>(null);

  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const currentName =
    metaString(meta, "display_name") ||
    metaString(meta, "full_name") ||
    metaString(meta, "name") ||
    emailLocalPart(user?.email) ||
    "";
  const currentAvatar =
    metaString(meta, "avatar_url") || metaString(meta, "picture") || null;
  const seed = user?.id || user?.email || currentName || "?";

  const [name, setName] = useState(currentName);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [busy, setBusy] = useState(false);

  // Adopt the account's current name once the user resolves.
  useEffect(() => {
    setName(currentName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentName]);

  const shownAvatar = removeAvatar ? null : preview || currentAvatar;
  const dirty = name.trim() !== currentName || file !== null || removeAvatar;

  const pickFile = (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error(t("imageOnly"));
      return;
    }
    if (f.size > HARD_CAP) {
      toast.error(t("imageTooLarge"));
      return;
    }
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    setFile(f);
    setRemoveAvatar(false);
  };

  const save = async () => {
    if (!user) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("nameEmpty"));
      return;
    }
    setBusy(true);
    try {
      // avatar_url: undefined = leave as-is, null = remove, string = new upload.
      let avatarUrl: string | null | undefined;
      if (removeAvatar) {
        avatarUrl = null;
      } else if (file) {
        const supabase = getSupabase();
        const compressed = await compressImage(file);
        const path = `${user.id}/avatar`;
        const { error: upErr } = await supabase.storage
          .from("avatars")
          .upload(path, compressed, {
            upsert: true,
            contentType: compressed.type || "image/webp",
          });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage
          .from("avatars")
          .getPublicUrl(path);
        avatarUrl = `${pub.publicUrl}?t=${Date.now()}`;
      }

      await updateUser({
        // Spread existing metadata so we never drop provider fields
        // (picture, locale…) regardless of merge-vs-replace behavior.
        data: {
          ...meta,
          full_name: trimmed,
          display_name: trimmed,
          ...(avatarUrl !== undefined ? { avatar_url: avatarUrl } : {}),
        },
      });
      setFile(null);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setRemoveAvatar(false);
      toast.success(t("updated"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection
      title={ta("profileSectionTitle")}
      description={ta("profileSectionDesc")}
    >
      <div className="space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          {shownAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shownAvatar}
              alt=""
              className="size-16 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex size-16 shrink-0 items-center justify-center rounded-full text-xl font-semibold text-white"
              style={{ backgroundColor: avatarColor(seed) }}
            >
              {initials(name || currentName || "?")}
            </span>
          )}

          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
              >
                <Upload />
                {t("changePhoto")}
              </Button>
              {shownAvatar && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => {
                    setPreview((prev) => {
                      if (prev) URL.revokeObjectURL(prev);
                      return null;
                    });
                    setFile(null);
                    setRemoveAvatar(true);
                  }}
                >
                  {t("removePhoto")}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t("photoHint")}</p>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              pickFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
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
