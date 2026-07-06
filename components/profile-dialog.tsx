"use client";

import { useEffect, useRef, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
  toast,
} from "mangue-ui";
import { Upload } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getSupabase } from "@/lib/supabase";
import { emailLocalPart } from "@/lib/display-name";
import { avatarColor, initials } from "@/lib/avatar";
import { compressImage } from "@/lib/image-compress";

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
      toast.error("Choisis un fichier image.");
      return;
    }
    if (f.size > HARD_CAP) {
      toast.error("Image trop lourde (25 Mo max).");
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
      toast.error("Le nom ne peut pas être vide.");
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
      toast.success("Profil mis à jour.");
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
          <DialogTitle>Profil</DialogTitle>
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
                  Changer la photo
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
                    Retirer
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                JPG, PNG ou GIF — compressée automatiquement.
              </p>
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
              Nom
            </label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ton nom"
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) void save();
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={() => void save()} disabled={busy || !name.trim()}>
            {busy && <Spinner />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
