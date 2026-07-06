"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  toast,
} from "mangue-ui";
import { Upload } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getSupabase } from "@/lib/supabase";
import { emailLocalPart } from "@/lib/display-name";
import { avatarColor, initials } from "@/lib/avatar";
import { compressImage } from "@/lib/image-compress";
import { setLocaleCookie } from "@/lib/set-locale";
import { locales, type Locale } from "@/i18n/config";

const LANGUAGE_LABELS: Record<Locale, string> = {
  fr: "Français",
  en: "English",
};

// Anything under this is accepted and compressed down to fit; above it we ask
// for a smaller file (avoids loading a huge image into a canvas).
const HARD_CAP = 25 * 1024 * 1024; // 25 MB

/** Read a string key off the user's auth metadata. */
function metaString(meta: Record<string, unknown>, key: string): string {
  const v = meta[key];
  return typeof v === "string" ? v.trim() : "";
}

/** Edit the account's display name + avatar. Both live on the Supabase Auth
    account: the name in `user_metadata` (display_name/full_name), the avatar as
    a Storage file whose URL is saved to `user_metadata.avatar_url`. */
export function ProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user, updateUser } = useAuth();
  const t = useTranslations("Profile");
  const tCommon = useTranslations("Common");
  const tLang = useTranslations("Language");
  const currentLocale = useLocale() as Locale;
  const router = useRouter();
  const [switchingLocale, setSwitchingLocale] = useState(false);
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

  // Reset to the account's current values whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setName(currentName);
    setFile(null);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setRemoveAvatar(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const shownAvatar = removeAvatar ? null : preview || currentAvatar;

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

  const switchLocale = async (locale: Locale) => {
    if (locale === currentLocale || switchingLocale) return;
    setSwitchingLocale(true);
    try {
      await setLocaleCookie(locale);
      if (user) await updateUser({ data: { ...meta, locale } });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSwitchingLocale(false);
    }
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
        const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
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
      toast.success(t("updated"));
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-1">
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
            <label htmlFor="profile-name" className="text-sm font-medium">
              {t("nameLabel")}
            </label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) void save();
              }}
            />
          </div>

          {/* Language */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="profile-language" className="text-sm font-medium">
              {tLang("title")}
            </label>
            <Select
              value={currentLocale}
              onValueChange={(value) => void switchLocale(value as Locale)}
              disabled={switchingLocale}
            >
              <SelectTrigger id="profile-language" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {locales.map((code) => (
                  <SelectItem key={code} value={code}>
                    {LANGUAGE_LABELS[code]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={() => void save()} disabled={busy || !name.trim()}>
            {busy && <Spinner />}
            {tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
