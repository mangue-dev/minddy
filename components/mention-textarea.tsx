"use client";

import { useRef, useState } from "react";
import { cn } from "mangue-ui";
import type { Member } from "@/lib/types";

function memberLabel(m: Member): string {
  return m.full_name || m.email || "Utilisateur";
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

export function MentionTextarea({
  value,
  onChange,
  members,
  onSubmit,
  placeholder,
  rows = 3,
  className,
}: {
  value: string;
  onChange: (text: string) => void;
  members: Member[];
  onSubmit?: () => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<{ at: number; query: string } | null>(null);

  const suggestions = mention
    ? members
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
          if (!open && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit?.();
          }
        }}
        onBlur={() => setTimeout(() => setMention(null), 120)}
        placeholder={placeholder}
        rows={rows}
        className={cn(
          "w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          className
        )}
      />
      {open && (
        <div className="absolute z-50 mt-1 max-h-56 w-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md">
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
              <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                {memberLabel(m).slice(0, 2).toUpperCase()}
              </span>
              <span className="truncate">{memberLabel(m)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
