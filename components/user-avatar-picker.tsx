"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ImageUploadIcon, ShuffleIcon } from "@hugeicons/core-free-icons";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/user-avatar";

/**
 * The account's picture and the two ways to change it: a generated Lorelei
 * face or an image of one's own. Used by the profile screen of a new account
 * (components/first-run/profile-setup-screen.tsx).
 */
export function UserAvatarPicker({
  source,
  onUpload,
  onGenerate,
  uploadLabel,
  generateLabel,
  uploading = false,
  generating = false,
  className,
}: {
  source: string | null;
  onUpload: (file: File) => void | Promise<void>;
  onGenerate: () => void;
  uploadLabel: string;
  generateLabel: string;
  uploading?: boolean;
  generating?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = uploading || generating;

  return (
    <div className={cn("flex w-full flex-col items-center gap-4", className)}>
      <UserAvatar seed={source} className="size-24 ring-1 ring-border" />
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onUpload(file);
          // Selecting the same file again must trigger another change event.
          event.target.value = "";
        }}
      />
      <div className="grid w-full gap-2">
        <Button type="button" variant="outline" className="h-12 w-full gap-2 rounded-full" disabled={busy} onClick={() => inputRef.current?.click()}>
          {uploading ? <Spinner /> : <HugeiconsIcon icon={ImageUploadIcon} className="size-4" />}
          <span className="truncate">{uploadLabel}</span>
        </Button>
        <Button type="button" variant="outline" className="h-12 w-full gap-2 rounded-full" disabled={busy} onClick={onGenerate}>
          {generating ? <Spinner /> : <HugeiconsIcon icon={ShuffleIcon} className="size-4" />}
          <span className="truncate">{generateLabel}</span>
        </Button>
      </div>
    </div>
  );
}
