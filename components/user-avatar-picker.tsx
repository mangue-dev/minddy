"use client";

import { useRef } from "react";
import { Button, Spinner, cn } from "mangue-ui";
import { ImageUp, Shuffle } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";

/** Shared Lorelei-or-upload control used during signup and in profile settings. */
export function UserAvatarPicker({
  source,
  previewUrl,
  onUpload,
  onGenerate,
  uploadLabel,
  generateLabel,
  uploading = false,
  generating = false,
  className,
}: {
  source: string | null;
  /** Local object URL used before a signup image has been stored. */
  previewUrl?: string | null;
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
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <div className="size-11 shrink-0 overflow-hidden rounded-full ring-1 ring-border">
        <UserAvatar url={previewUrl} seed={source} className="size-full" />
      </div>
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? <Spinner /> : <ImageUp className="size-3.5" />}
        {uploadLabel}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={busy}
        onClick={onGenerate}
      >
        {generating ? <Spinner /> : <Shuffle className="size-3.5" />}
        {generateLabel}
      </Button>
    </div>
  );
}
