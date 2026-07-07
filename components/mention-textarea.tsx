"use client";

import { useRef, useState } from "react";
import { cn } from "mangue-ui";
import { displayName } from "@/lib/display-name";
import { useAutosize } from "@/lib/use-autosize";
import { UserAvatar } from "@/components/user-avatar";
import { NumoIcon } from "@/components/numo-icon";
import type { Member } from "@/lib/types";

function memberLabel(m: Member): string {
  return displayName(m);
}

/** userIds mentioned in `text` as "@Display Name" tokens (matched against members). */
export function extractMentions(text: string, members: Member[]): string[] {
  const ids = new Set<string>();
  for (const m of members) {
    if (text.includes(`@${memberLabel(m)}`)) ids.add(m.user_id);
  }
  return [...ids];
}

/** Active "@query" immediately before the caret (query has no whitespace). */
function activeMention(text: string, caret: number): { at: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  if (/\s/.test(query) || query.length > 30) return null;
  return { at, query };
}

/** Pseudo-member surfacing "@Numo" in the picker. It only lives in the
    suggestion list — callers' `members` arrays never contain it, so
    extractMentions can't return its id as a mentioned user. The actual
    trigger is a server-side, case-insensitive scan of the comment body. */
const NUMO_MENTION_ID = "__numo__";
const NUMO_MENTION = {
  user_id: NUMO_MENTION_ID,
  email: null,
  full_name: "Numo",
  avatar_url: null,
  role: "member",
  is_owner: false,
} as unknown as Member;

export function MentionTextarea({
  value,
  onChange,
  members,
  onSubmit,
  onEscape,
  placeholder,
  rows = 1,
  className,
  dropUp = false,
  autoFocus = false,
  includeNumo = false,
}: {
  value: string;
  onChange: (text: string) => void;
  members: Member[];
  onSubmit?: () => void;
  /** Called on Escape when the mention suggestions are closed. */
  onEscape?: () => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  /** Open the suggestion list above the field (for composers pinned to the bottom). */
  dropUp?: boolean;
  autoFocus?: boolean;
  /** Offer "@Numo" (the assistant) in the suggestions — comment composers only. */
  includeNumo?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<{ at: number; query: string } | null>(null);
  useAutosize(ref, value);

  const mentionables = includeNumo ? [...members, NUMO_MENTION] : members;
  const suggestions = mention
    ? mentionables
        .filter((m) =>
          memberLabel(m).toLowerCase().includes(mention.query.toLowerCase())
        )
        .slice(0, 6)
    : [];
  const open = !!mention && suggestions.length > 0;

  const refresh = () => {
    const el = ref.current;
    if (!el) return;
    setMention(activeMention(value, el.selectionStart ?? value.length));
  };

  const pick = (m: Member) => {
    if (!mention) return;
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const token = `@${memberLabel(m)} `;
    const next = value.slice(0, mention.at) + token + value.slice(caret);
    onChange(next);
    setMention(null);
    const pos = mention.at + token.length;
    requestAnimationFrame(() => {
      const t = ref.current;
      if (t) {
        t.focus();
        t.setSelectionRange(pos, pos);
      }
    });
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setMention(activeMention(e.target.value, e.target.selectionStart ?? 0));
        }}
        onClick={refresh}
        onKeyUp={(e) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) refresh();
        }}
        onKeyDown={(e) => {
          if (open && e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            pick(suggestions[0]);
            return;
          }
          if (open && e.key === "Escape") {
            e.preventDefault();
            setMention(null);
            return;
          }
          if (!open && e.key === "Escape") {
            onEscape?.();
            return;
          }
          if (!open && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit?.();
          }
        }}
        onBlur={() => setTimeout(() => setMention(null), 120)}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
        className={cn(
          "max-h-48 w-full resize-none overflow-y-auto rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          className
        )}
      />
      {open && (
        <div
          className={cn(
            "absolute left-0 z-50 max-h-56 w-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md",
            dropUp ? "bottom-full mb-1" : "top-full mt-1"
          )}
        >
          {suggestions.map((m) => (
            <button
              key={m.user_id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              {m.user_id === NUMO_MENTION_ID ? (
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                  <NumoIcon animated={false} className="size-3.5" />
                </span>
              ) : (
                <UserAvatar
                  url={m.avatar_url}
                  name={memberLabel(m)}
                  seed={m.user_id}
                  className="size-5 text-[9px]"
                />
              )}
              <span className="truncate">{memberLabel(m)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
