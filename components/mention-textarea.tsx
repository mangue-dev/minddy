"use client";

// The comments entry field — that of the composer, the response, the
// editing, and sorting message.
//
// It does NOT show “@Numo” in plain text: a mention placed there becomes the
// pill (MentionChip), the same as in the Numo composer and as in the
// comment once published. That's why it's no longer a <textarea> —
// a textarea can only display text, never an element. The surface is
// therefore a contenteditable, and each mention is a non-editable envelope
// in which React carries the real pill.
//
// What the caller sees has not changed: `value` / `onChange` on TEXT, where
// a mention is written “@Name” — this is the text that goes to the server, it’s safe
// him that extractMentions reads who to warn, and it is from him that the rendering of the
// published comment re-infers the pills (only one rule, lib/mention-scan).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "mangue-ui";
import { ForgeUserAvatar } from "@/components/git/forge-user-avatar";
import { NumoAvatar } from "@/components/actor-avatars";
import { MentionChip, NUMO_MENTION_ID } from "@/components/mention-chip";
import {
  MentionFigure,
  type MentionOption as EntityMentionOption,
} from "@/components/mention-suggest";
import type { MarkdownEditorMentions } from "@/components/markdown-editor";
import {
  forgeMentionScanner,
  memberLabel,
  mentionScanner,
  type ScannedMention,
} from "@/lib/mention-scan";
import { useIsSendShortcut } from "@/lib/keyboard/use-send-mode";
import {
  filterMentionItems,
  findActiveMentionQuery,
} from "@/lib/mention-menu";
import type { Member } from "@/lib/types";

/** userIds mentioned in `text` as "@Display Name" tokens (matched against members). */
export function extractMentions(text: string, members: Member[]): string[] {
  const ids = new Set<string>();
  for (const m of members) {
    if (text.includes(`@${memberLabel(m)}`)) ids.add(m.user_id);
  }
  return [...ids];
}

/** What a statement can say about itself. “Numo” is not an account: __KEEP_NL_TOKEN__ it does not have its own id, `NUMO_MENTION_ID` takes its place. A `forge` doesn't have one__KEEP_NL_TOKEN__ either at minddy — his login serves as his identity, here and there. */
type SpecialMentionOption =
  | {
      type: "numo";
      id: string;
      label: string;
      avatarSeed?: string | null;
      avatarUrl?: string | null;
    }
  | {
      type: "forge";
      id: string;
      label: string;
      avatarSeed?: string | null;
      avatarUrl?: string | null;
    };
type MentionOption = EntityMentionOption | SpecialMentionOption;

/** The envelope of a mention in the editor: a NON-editable, empty node, in__KEEP_NL_TOKEN__ which React carries the real pill. The field therefore does not redraw a__KEEP_NL_TOKEN__ pill “like” the one in the published comment — it is the same. */
const SLOT_CLASS = "inline-flex align-middle";

function makeSlot(option: MentionOption): HTMLSpanElement {
  const el = document.createElement("span");
  el.contentEditable = "false";
  el.className = SLOT_CLASS;
  el.dataset.mentionType = option.type;
  el.dataset.mentionId = option.id;
  el.dataset.mentionLabel = option.label;
  if (option.avatarSeed) el.dataset.mentionSeed = option.avatarSeed;
  if ("avatarUrl" in option && option.avatarUrl) {
    el.dataset.mentionAvatar = option.avatarUrl;
  }
  if ("iconUrl" in option && option.iconUrl) el.dataset.mentionIcon = option.iconUrl;
  if ("icon" in option && option.icon) el.dataset.mentionIcon = option.icon;
  if ("color" in option && option.color) el.dataset.mentionColor = option.color;
  return el;
}

const SLOT_TYPES = new Set([
  "member",
  "project",
  "issue",
  "objective",
  "page",
  "numo",
  "forge",
]);

/** Reread an envelope from the DOM — it alone is authentic: a cancellation ⌘Z__KEEP_NL_TOKEN__ can restore a node that React was no longer following. */
function slotOption(el: HTMLElement): MentionOption | null {
  const type = el.dataset.mentionType;
  const id = el.dataset.mentionId;
  const label = el.dataset.mentionLabel;
  if (!id || !label || !type || !SLOT_TYPES.has(type)) return null;
  if (type === "numo" || type === "forge") {
    return {
      type,
      id,
      label,
      avatarSeed: el.dataset.mentionSeed ?? null,
      avatarUrl: el.dataset.mentionAvatar ?? null,
    };
  }
  return {
    type: type as EntityMentionOption["type"],
    id,
    label,
    ...(el.dataset.mentionSeed ? { avatarSeed: el.dataset.mentionSeed } : {}),
    ...(el.dataset.mentionIcon
      ? type === "page"
        ? { icon: el.dataset.mentionIcon }
        : { iconUrl: el.dataset.mentionIcon }
      : {}),
    ...(el.dataset.mentionColor ? { color: el.dataset.mentionColor } : {}),
  };
}

function optionFromMention(mention: ScannedMention): MentionOption {
  switch (mention.type) {
    case "numo":
      return { type: "numo", id: NUMO_MENTION_ID, label: "Numo" };
    case "forge":
      return {
        type: "forge",
        id: mention.login,
        label: mention.login,
        avatarUrl: mention.avatarUrl,
      };
    case "member":
      return {
        type: "member",
        id: mention.member.user_id,
        label: memberLabel(mention.member),
        avatarSeed: mention.member.avatar_seed,
      };
    case "issue":
      return {
        type: "issue",
        id: mention.issue.id,
        label: mention.issue.identifier,
        detail: mention.issue.title,
      };
    case "objective":
      return {
        type: "objective",
        id: mention.objective.id,
        label: mention.objective.name,
        color: mention.objective.color,
      };
    case "project":
      return {
        type: "project",
        id: mention.project.id,
        label: mention.project.name,
        avatarSeed: mention.project.avatarSeed,
        iconUrl: mention.project.iconUrl,
        keywords: [mention.project.key],
      };
    case "page":
      return {
        type: "page",
        id: mention.page.id,
        label: mention.page.title,
        icon: mention.page.icon,
      };
  }
}

/** The text of the field. A mention is written "@Name" even if the pill only shows__KEEP_NL_TOKEN__ the name: on the server side as well as in rendering, it is the at sign which indicates it. */
function serialize(root: HTMLElement): string {
  const parts: string[] = [];

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;

    if (el.dataset.mentionLabel) {
      parts.push(`@${el.dataset.mentionLabel}`);
      return;
    }
    if (el.tagName === "BR") {
      parts.push("\n");
      return;
    }
    if (el.tagName === "DIV" || el.tagName === "P") {
      if (parts.length > 0 && parts[parts.length - 1] !== "\n") parts.push("\n");
      for (const child of el.childNodes) walk(child);
      return;
    }
    for (const child of el.childNodes) walk(child);
  };

  for (const child of root.childNodes) walk(child);
  return parts.join("");
}

function caretToEnd(el: HTMLElement) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function MentionTextarea({
  value,
  onChange,
  members = [],
  mentions,
  forgeMembers,
  onMentionQuery,
  focusSignal,
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
  members?: Member[];
  /** Full entity mention support for Minddy comments. */
  mentions?: MarkdownEditorMentions;
  /**__KEEP_NL_TOKEN__ * The FORGE accounts (MIN-162). Present = this field writes a comment__KEEP_NL_TOKEN__ * from pull request: suggestions come from there, and `members` is ignored.__KEEP_NL_TOKEN__ * A `@` ends up there at GitHub, where quoting a minddy member without a git account does not__KEEP_NL_TOKEN__ * would notify anyone — so the two sources don't mix never.__KEEP_NL_TOKEN__ */
  forgeMembers?: Array<{ login: string; avatar_url: string | null; name: string | null }>;
  /** The first “@” typed — enough to load a list on demand rather than __KEEP_NL_TOKEN__ when opening the view. Called without guarantee of uniqueness: make the caller __KEEP_NL_TOKEN__ only a trigger (a `enabled` which remains true). */
  onMentionQuery?: () => void;
  /** Changing this value gives focus to the field, caret at the end of the text — this__KEEP_NL_TOKEN__ needed by a gesture that WRITEs into the draft from outside__KEEP_NL_TOKEN__ (“Quote” on a PR). A `autoFocus` is only used for editing; here the__KEEP_NL_TOKEN__ field is already there. */
  focusSignal?: number;
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
  const ref = useRef<HTMLDivElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const isSend = useIsSendShortcut();
  const [query, setQuery] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  // The envelopes present in the editor, reread FROM THE DOM.
  const [slots, setSlots] = useState<
    Array<{ el: HTMLElement; option: MentionOption }>
  >([]);

  // The identity of the arrays is NOT stable across callers: as long as the
  // query not answered, useMembersQuery returns a new `[]` each time it is rendered.
  // We therefore memorize their CONTENT — otherwise the scanner would constantly change and
  // the field would rest for nothing, under the caret.
  const fromForge = !!forgeMembers;
  const membersKey = forgeMembers
    ? forgeMembers.map((m) => `${m.login} ${m.avatar_url}`).join("")
    : members
        .map((m) => `${m.user_id} ${memberLabel(m)} ${m.avatar_seed}`)
        .join("");

  const fallbackScan = useMemo(
    () => (forgeMembers ? forgeMentionScanner(forgeMembers) : mentionScanner(members)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [membersKey, fromForge],
  );
  const scan = mentions?.scan ?? fallbackScan;

  const mentionables = useMemo<MentionOption[]>(() => {
    const list: MentionOption[] = forgeMembers
      ? // The LOGIN, never the name displayed: it is he who appears in the text, and
        // he alone that the forge knows how to resolve in notification.
        forgeMembers.map((m) => ({
          type: "forge",
          id: m.login,
          label: m.login,
          avatarUrl: m.avatar_url,
        }))
      : mentions?.options
        ? [...mentions.options]
        : members.map((m) => ({
            type: "member" as const,
            id: m.user_id,
            label: memberLabel(m),
            avatarSeed: m.avatar_seed,
          }));
    // Numo ONLY lives in the list of suggestions: the `members` of callers
    // never contain it, so extractMentions cannot return its id
    // as notified user. The real trigger is a rereading of the body
    // server-side comment, case-insensitive.
    //
    // AT THE HEAD on a pull request: this is the only mention that minddy deals with
    // herself, and the only one who will not notify anyone at the forge. show it
    // first, with Numo's face, avoid reading it as just another account.
    if (includeNumo) {
      const numo: MentionOption = { type: "numo", id: NUMO_MENTION_ID, label: "Numo" };
      if (fromForge) list.unshift(numo);
      else list.push(numo);
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membersKey, includeNumo, fromForge, mentions?.options]);

  const suggestions = useMemo(
    () =>
      query === null
        ? []
        : filterMentionItems(mentionables, query),
    [query, mentionables],
  );
  const open = suggestions.length > 0;
  // Typing narrows the list under the cursor, so keep the highlight in range.
  const active = Math.min(selected, Math.max(0, suggestions.length - 1));

  // Back to the first suggestion whenever the query changes — and on reopen,
  // which always passes through `null` (menu closed) first.
  useEffect(() => setSelected(0), [query]);
  useEffect(() => {
    suggestionsRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active, suggestions]);

  const syncSlots = useCallback(() => {
    const el = ref.current;
    const found = el ? [...el.querySelectorAll<HTMLElement>("[data-mention-id]")] : [];
    setSlots((prev) => {
      const unchanged =
        prev.length === found.length && prev.every((s, i) => s.el === found[i]);
      if (unchanged) return prev;
      return found
        .map((node) => ({ el: node, option: slotOption(node) }))
        .filter((s): s is { el: HTMLElement; option: MentionOption } => !!s.option);
    });
  }, []);

  // The request is read in the TEXT NODE under the caret: this is the only place
  // where “@something” is still being written. The mentions already
  // posed are non-editable nodes — the caret does not fit there, they do not
  // therefore cannot be reread as a current request.
  const readMention = useCallback((): {
    node: Text;
    start: number;
    end: number;
    query: string;
  } | null => {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel || !sel.isCollapsed) return null;
    const node = sel.anchorNode;
    if (!node || node.nodeType !== Node.TEXT_NODE) return null;
    if (!el.contains(node)) return null;
    const end = sel.anchorOffset;
    const before = (node.textContent ?? "").slice(0, end);
    const match = findActiveMentionQuery(before);
    if (!match) return null;
    return {
      node: node as Text,
      start: match.start,
      end,
      query: match.query,
    };
  }, []);

  const refreshMention = useCallback(() => {
    const next = readMention()?.query ?? null;
    // The first “@” is enough to request the list: it loads while we
    // type the rest of the name, and the caller just makes it a trigger.
    if (next !== null) {
      onMentionQuery?.();
      mentions?.onQuery?.();
    }
    setQuery((prev) => (prev === next ? prev : next));
  }, [readMention, onMentionQuery, mentions]);

  /** The current text goes back to the caller. `emitted` retains what it has__KEEP_NL_TOKEN__ given to it: as long as it returns it to us as is, the current keystroke must NOT__KEEP_NL_TOKEN__ be rewritten under the caret. */
  const emitted = useRef<string | null>(null);
  const emit = useCallback(
    (el: HTMLElement) => {
      const text = serialize(el);
      emitted.current = text;
      onChange(text);
    },
    [onChange],
  );

  /** Restores the content from the text: each recognized mention becomes a __KEEP_NL_TOKEN__ envelope, the rest of the text nodes and line breaks. */
  const render = useCallback(
    (el: HTMLElement, text: string) => {
      el.innerHTML = "";
      for (const seg of scan(text)) {
        if (seg.mention === undefined) {
          seg.text.split("\n").forEach((line, i) => {
            if (i > 0) el.appendChild(document.createElement("br"));
            if (line) el.appendChild(document.createTextNode(line));
          });
          continue;
        }
        el.appendChild(makeSlot(optionFromMention(seg.mention)));
      }
    },
    [scan],
  );

  // The text comes from ELSEWHERE (editing, dictation, reset after sending, or
  // the members who arrive afterwards): we rest everything. While typing,
  // `value` is exactly what we just sent — nothing moves, the caret
  // stay where it is.
  const lastScan = useRef(scan);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const external = emitted.current !== value;
    const rescan = lastScan.current !== scan;
    if (!external && !rescan) return;
    // A list of members that changes while typing should not move the
    // caret: we will wait for the field to be rendered.
    if (!external && document.activeElement === el) return;
    lastScan.current = scan;
    emitted.current = value;
    render(el, value);
    syncSlots();
    if (document.activeElement === el) caretToEnd(el);
  }, [value, scan, render, syncSlots]);

  useEffect(() => {
    if (!autoFocus) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    caretToEnd(el);
    // On mount only — like the attribute of the same name on a native field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // AFTER the rendering effect above (the declaration order is the order
  // of execution): the inserted text is already placed when we put the caret on it.
  //
  // On CHANGE only. React also plays an effect on MONTAGE, value
  // initial included: compose it from a pull request, which receives a counter
  // started from 0, therefore took the focus when opening each PR — the page
  // opened the cursor in the comment area, and the keyboard with on
  // mobile. The editing focus has its own name, `autoFocus`, and those that
  // want to ask for it.
  const lastFocusSignal = useRef(focusSignal);
  useEffect(() => {
    if (focusSignal === undefined || focusSignal === lastFocusSignal.current) return;
    lastFocusSignal.current = focusSignal;
    const el = ref.current;
    if (!el) return;
    el.focus();
    caretToEnd(el);
  }, [focusSignal]);

  const pick = (option: MentionOption) => {
    const found = readMention();
    const el = ref.current;
    if (!found || !el) return;

    const range = document.createRange();
    range.setStart(found.node, found.start);
    range.setEnd(found.node, found.end);
    range.deleteContents();

    const slot = makeSlot(option);
    range.insertNode(slot);

    // A space after the pill: without it the caret finds itself stuck in a knot
    // not editable and the next keystroke goes wrong. It is preserved at
    // display (whitespace-pre-wrap) and counts as the separation we
    // would have typed it yourself.
    const space = document.createTextNode(" ");
    slot.after(space);

    const sel = window.getSelection();
    if (sel) {
      const after = document.createRange();
      after.setStart(space, 1);
      after.collapse(true);
      sel.removeAllRanges();
      sel.addRange(after);
    }
    el.focus();
    setQuery(null);
    emit(el);
    syncSlots();
  };

  const handleInput = () => {
    const el = ref.current;
    if (!el) return;
    // Really empty: we return the surface to the `:empty` selector so that
    // the prompt reappears (the browser happily leaves a <br> there).
    if (!el.querySelector("[data-mention-id]") && !el.textContent?.trim()) {
      el.innerHTML = "";
    }
    emit(el);
    refreshMention();
    syncSlots();
  };

  return (
    <div className="relative min-w-0 max-w-full">
      {/* Each mention placed receives ITS pill, carried in its envelope. */}
      {slots.map(({ el, option }, index) =>
        createPortal(
          <MentionChip
            type={option.type}
            id={option.id}
            label={option.label}
            avatarSeed={option.avatarSeed}
            avatarUrl={"avatarUrl" in option ? option.avatarUrl : null}
            iconUrl={"iconUrl" in option ? option.iconUrl : null}
            icon={"icon" in option ? option.icon : null}
            color={"color" in option ? option.color : null}
          />,
          el,
          // Two mentions of the SAME person: the key takes rank, otherwise
          // React would see the same thing twice.
          `${option.type}:${option.id}:${index}`,
        ),
      )}
      <div
        ref={ref}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-placeholder={placeholder}
        suppressContentEditableWarning
        // `rows` lines at least, like on the native field before: one line
        // of `text-sm` is 1.25rem, and the box being in border-box it is necessary
        // add default vertical padding (py-2).
        style={{ minHeight: `calc(${rows} * 1.25rem + 1rem)` }}
        onInput={handleInput}
        onClick={refreshMention}
        onKeyUp={(e) => {
          // The caret can exit an “@” query without the text changing.
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
            refreshMention();
        }}
        onKeyDown={(e) => {
          // Arrows must not reach the editor: the caret would move out of the
          // "@query" and drop the mention.
          if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            const n = suggestions.length;
            setSelected((s) => {
              const from = Math.min(s, n - 1);
              return e.key === "ArrowDown" ? (from + 1) % n : (from - 1 + n) % n;
            });
            return;
          }
          if (open && e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            pick(suggestions[active]);
            return;
          }
          if (open && e.key === "Escape") {
            e.preventDefault();
            setQuery(null);
            return;
          }
          if (!open && e.key === "Escape") {
            onEscape?.();
            return;
          }
          // Sending to the keyboard — ⌘/Ctrl + Enter, or Enter only if the account
          // set it like this (lib/keyboard/send-shortcut). The list of mentions
          // open pass FORWARD: Enter y chooses a suggestion.
          if (!open && isSend(e)) {
            e.preventDefault();
            onSubmit?.();
          }
        }}
        onPaste={(e) => {
          // A rich collage would deposit its markup in the surface: we cannot
          // keep only the text. The files are the job of the composer
          // which surrounds us (pasteFileHandler) — we let them rise.
          if (e.clipboardData.files.length > 0) return;
          const text =
            e.clipboardData.getData("text/plain") || e.clipboardData.getData("text");
          e.preventDefault();
          if (!text) return;
          // execCommand: this is what writes the paste to the stack
          // browser cancellation, which no living API overrides.
          document.execCommand("insertText", false, text);
        }}
        onBlur={() => setTimeout(() => setQuery(null), 120)}
        className={cn(
          "max-h-48 min-w-0 w-full max-w-full overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "[&:empty]:before:pointer-events-none [&:empty]:before:text-muted-foreground [&:empty]:before:content-[attr(aria-placeholder)]",
          className,
        )}
      />
      {open && (
        <div
          ref={suggestionsRef}
          role="listbox"
          className={cn(
            "scrollbar-quiet absolute left-0 z-50 max-h-56 w-64 overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-1 shadow-md",
            dropUp ? "bottom-full mb-1" : "top-full mt-1"
          )}
        >
          {suggestions.map((option, index) => (
            <button
              key={`${option.type}:${option.id}`}
              type="button"
              role="option"
              aria-selected={index === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(option);
              }}
              onMouseEnter={() => setSelected(index)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                index === active && "bg-muted"
              )}
            >
              {option.type === "numo" ? (
                <NumoAvatar />
              ) : option.type === "forge" ? (
                <ForgeUserAvatar
                  user={{
                    login: option.avatarSeed ?? option.id,
                    avatar_url: option.avatarUrl ?? null,
                  }}
                  className="size-5"
                />
              ) : (
                <MentionFigure option={option} />
              )}
              <span className="min-w-0 truncate">
                {option.label}
                {"detail" in option && option.detail ? (
                  <span className="ml-1.5 text-muted-foreground">
                    {option.detail}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
