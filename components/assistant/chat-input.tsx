"use client";

import {
  type ReactNode,
  useRef,
  useCallback,
  useMemo,
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  Button,
  SendButtonWithCost,
  cn,
} from "mangue-ui";
import { ArrowUp, Paperclip, Square } from "lucide-react";
import { AgentBeam } from "@/components/agent-beam";
import { DictateButton } from "@/components/ai-elements/dictate-button";
import { MentionChip } from "@/components/mention-chip";
import {
  MentionSuggestions,
  filterMentions,
  type MentionOption,
} from "@/components/mention-suggest";
import {
  SlashMenu,
  filterCommands,
  type SlashCommandOption,
} from "@/components/assistant/slash-menu";
import { ResourcePills, DropOverlay, useFileDrop } from "@/components/resources";
import { SendShortcutKeys } from "@/components/send-shortcut";
import { useIsSendShortcut } from "@/lib/keyboard/use-send-mode";
import { useAttachmentUploads } from "@/lib/use-attachment-uploads";
import { useAuth } from "@/lib/auth-context";
import type { AssistantCommandId, AssistantMention } from "@/lib/assistant-types";
import type { ResourceInput } from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** What the "+" offers Numo: files it can actually read (images, PDF, CSV,
    text-ish) — MIN-24 scope. */
const ACCEPT =
  "image/*,application/pdf,text/csv,text/plain,text/markdown,application/json,.csv,.txt,.md,.json,.log";

/** The envelope of a mention in the editor: a NON-editable, empty node, in
 which React carries the real pill (MentionChip). Composing it does not redraw
 so it is not a pill “like” the one in the context — it is the same. */
const MENTION_SLOT_CLASS = "inline-block align-baseline";

/** The pill of a “/” command placed at the top of the message: same geometry as
 the pill of mention, without a figure — the “/” is enough to say what it is.
 It carries its text directly (no portal: nothing to re-render).

 It keeps the background NEUTRAL (the fallback of `--mention-chip`, cf. globals.css) there
 where the mentions are now colored by type: a command does not cite anything,
 it therefore has no color to follow. */
const COMMAND_PILL_CLASS =
  "mx-0.5 inline-block whitespace-nowrap rounded-[5px] bg-(--mention-chip) px-1.5 py-px align-baseline text-[0.95em] font-medium leading-4 text-primary";

/** What an envelope can say about itself: enough to return it without anything
 other than the DOM (a ⌘Z cancellation can return it well after the fact). */
const MENTION_TYPES: ReadonlySet<string> = new Set([
  "member",
  "project",
  "issue",
  "objective",
  "page",
]);

function mentionFromNode(node: HTMLElement): MentionOption | null {
  const type = node.dataset.mentionType;
  const id = node.dataset.mentionId;
  const label = node.dataset.mentionLabel;
  if (!id || !label || !type || !MENTION_TYPES.has(type)) return null;
  return {
    type: type as MentionOption["type"],
    id,
    label,
    ...(node.dataset.mentionSeed ? { avatarSeed: node.dataset.mentionSeed } : {}),
    // `data-mention-icon` carries two things depending on the type, and only one
    // times: the favicon of a project (a URL) or the emoji of a page. An attribute
    // more for the same box would not have clarified anything.
    ...(node.dataset.mentionIcon
      ? type === "page"
        ? { icon: node.dataset.mentionIcon }
        : { iconUrl: node.dataset.mentionIcon }
      : {}),
    ...(node.dataset.mentionColor ? { color: node.dataset.mentionColor } : {}),
  };
}

interface ChatInputProps {
  onSend: (
    message: string,
    attachments: ResourceInput[],
    mentions: AssistantMention[],
    /** The “/” command placed at the top of the message, when there is one. */
    command?: AssistantCommandId,
  ) => void | boolean;
  onAbort?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  noBorder?: boolean;
  placeholder?: string;
  /**
   * Placed on the outer box of the composer. She has a 12 px gutter
   * (`px-3`) which serves as a click margin in the Numo panel, where nothing
   * no one else gives any. In a column that already has its own — the settings —
   * this gutter shrinks the composition compared to the cards next to it: we
   * cancels it with `px-0` rather than offsetting it with a `-mx-3`, which would
   * overflow the column (MIN-167).
   */
  className?: string;
  /**
   * Hide the attach affordances (file button + drop overlay + paste-to-attach).
   * To place on surfaces where sending does NOT KNOW what to do with a file —
   * agent composers, which talk to a repository and not to a repository
   * attachments. The reception carried him for a long time for another reason
   * (`open({ prompt })` was not relaying files): since opening
   * carries them, he no longer carries it.
   */
  hideAttach?: boolean;
  /**
   * Context row placed at the top of the composer, above the text (the
   * Numo context pills and the @ button). She lives with the appellant: the
   * composer knows nothing about what she is wearing, he just lends her his place —
   * whose radius is calculated for a concentric nesting.
   */
  contextSlot?: ReactNode;
  /**
   * Place the context row in a banner behind the top of the composer.
   * The agent's conversations bring together the choices which determine his
   * work space (project, environment and branch), without stealing space
   * to the area where you write.
   */
  contextPlacement?: "inside" | "above";
  /**
   * Entities cited by “@” in the text. Empty/absent = no
   * mentions at all (the composers excluding Numo). The list may come later
   * hit: `onMentionQuery` notifies the host as soon as a mention is typed, which
   * let him charge it at that moment and not before.
   */
  mentionables?: MentionOption[];
  onMentionQuery?: (active: boolean) => void;
  /**
   * The “/” commands offered when the message STARTS with a slash.
   * Empty/absent = no slash menu at all (composers outside the Numo shell).
   * Choose a command and place it as a non-editable pill at the top of the message;
   * its canonical id leaves with the sending (4th argument of `onSend`).
   */
  commands?: SlashCommandOption[];
  /**
   * Text to seed the editor with on mount (caret placed at the end, ready to
   * edit). Used by the agent launch composer to pre-write "Work on MIN-42".
   * One-shot: only read once when the composer mounts.
   */
  initialValue?: string;
  /**
   * Extra controls pinned to the LEFT of the bottom bar (the send/dictate
   * cluster stays right). The agent launch composer drops its model picker here.
   */
  leadingControls?: ReactNode;
  /**
   * Animated “response in progress” border around the surface (same effect as the
   * exit cards). Numo chat and agent chat activates it so much
   * that a response is generated.
   */
  beam?: boolean;
  /**
   * During a response in progress (`isStreaming`), authorizes SEND: the Stop button
   * only appears if the input is empty; as soon as you type, it becomes a button
   * d'envoi. L'agent conversationnel l'active (envoyer = interrompre + steerer en
   * priority). Default: off (Numo cat keeps Stop as long as it generates).
   */
  sendWhileStreaming?: boolean;
  /**
   * ONLY blocks sending (free entry, inert entry): the button becomes
   * an inactive chip carrying `sendDisabledTooltip`, which explains what to do
   * First of all. The launch composer uses it as long as no project is
   * choisi.
   */
  sendDisabled?: boolean;
  sendDisabledTooltip?: string;
}

export interface ChatInputHandle {
  fill: (text: string) => void;
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput(
    {
      onSend,
      onAbort,
      disabled,
      isStreaming,
      noBorder,
      placeholder,
      className,
      hideAttach = false,
      contextSlot,
      contextPlacement = "inside",
      mentionables,
      onMentionQuery,
      commands,
      initialValue,
      leadingControls,
      beam,
      sendWhileStreaming,
      sendDisabled,
      sendDisabledTooltip,
    },
    ref
  ) {
    const t = useTranslations("Assistant");
    const isSend = useIsSendShortcut();
    const tAttach = useTranslations("Resources");
    const effectivePlaceholder = placeholder ?? t("inputPlaceholder");
    const editorRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isEmpty, setIsEmpty] = useState(true);
    const [isFocused, setIsFocused] = useState(false);
    const { user } = useAuth();
    const userId = user?.id;
    const uploads = useAttachmentUploads(() => `chat/${userId}`, { max: 5 });
        // The agent accepts a message that steers it while it works
    // (`sendWhileStreaming`): its files must remain reachable in this
    // same case. The Numo cat keeps its button hidden as long as it generates.
    const canAttach = !hideAttach && (!isStreaming || !!sendWhileStreaming);
    const drop = useFileDrop((files) => {
      if (userId) uploads.addFiles(files);
    });

    const serializeContent = useCallback((): string => {
      const el = editorRef.current;
      if (!el) return "";

      const parts: string[] = [];

      function walk(node: Node) {
        if (node.nodeType === Node.TEXT_NODE) {
          parts.push(node.textContent || "");
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as HTMLElement;

          // A mention is written “@Name” in the message even if the pill does not
          // shows that the name: on the model side, it is the at sign which indicates it (and
          // it is on it that the bubble re-places the pill on rereading).
          if (element.dataset.mentionLabel) {
            parts.push(`@${element.dataset.mentionLabel}`);
            return;
          }

          // A command is written “/label” — the text that the pill shows
          // already, but read from its data: the rendering can evolve without changing
          // what goes into the message.
          if (element.dataset.commandLabel) {
            parts.push(`/${element.dataset.commandLabel}`);
            return;
          }

          if (element.tagName === "BR") {
            parts.push("\n");
            return;
          }

          if (element.tagName === "DIV" || element.tagName === "P") {
            if (parts.length > 0 && parts[parts.length - 1] !== "\n") {
              parts.push("\n");
            }
            for (const child of element.childNodes) walk(child);
            return;
          }

          for (const child of element.childNodes) walk(child);
        }
      }

      for (const child of el.childNodes) walk(child);
      return parts.join("").trim();
    }, []);

    const clearEditor = useCallback(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = "";
        setIsEmpty(true);
        setMentionSlots([]);
        setSlashQuery(null);
      }
    }, []);

    // ── Mentions « @ » ──────────────────────────────────────────────
    // The request is read in the TEXT NODE under the caret: it is the only
    // place where “@something” is still being written. THE
    // mentions already asked are <span contenteditable=false> — the caret does not
    // do not fit in, they disappear as a whole, and they therefore cannot
    // not be read back as a current query.
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionIndex, setMentionIndex] = useState(0);
    // The envelopes present in the editor, reread FROM THE DOM: it’s him
    // which is authentic (a ⌘Z cancellation returns a node that React was no longer following).
    const [mentionSlots, setMentionSlots] = useState<
      Array<{ el: HTMLElement; option: MentionOption }>
    >([]);

    const syncMentionSlots = useCallback(() => {
      const el = editorRef.current;
      const found = el
        ? [...el.querySelectorAll<HTMLElement>("[data-mention-id]")]
        : [];
      setMentionSlots((prev) => {
        const unchanged =
          prev.length === found.length && prev.every((s, i) => s.el === found[i]);
        if (unchanged) return prev;
        return found
          .map((node) => ({ el: node, option: mentionFromNode(node) }))
          .filter((s): s is { el: HTMLElement; option: MentionOption } => !!s.option);
      });
    }, []);

    const readMention = useCallback((): {
      node: Text;
      start: number;
      end: number;
      query: string;
    } | null => {
      const el = editorRef.current;
      const sel = window.getSelection();
      if (!el || !sel || !sel.isCollapsed) return null;
      const node = sel.anchorNode;
      if (!node || node.nodeType !== Node.TEXT_NODE) return null;
      if (!el.contains(node)) return null;
      const end = sel.anchorOffset;
      const before = (node.textContent ?? "").slice(0, end);
      // An “@” at the beginning of a word only — not that of an email address.
      const match = /(^|[\s ])@([^\s @]{0,30})$/.exec(before);
      if (!match) return null;
      return {
        node: node as Text,
        start: end - match[2].length - 1,
        end,
        query: match[2],
      };
    }, []);

    const mentionOptions = useMemo(
      () =>
        mentionQuery === null || !mentionables?.length
          ? []
          : filterMentions(mentionables, mentionQuery),
      [mentionQuery, mentionables],
    );
    const mentionOpen = mentionOptions.length > 0;
    const activeMention = Math.min(
      mentionIndex,
      Math.max(0, mentionOptions.length - 1),
    );

    // The passage “we type a mention” ↔ “we type no more” indicates a
    // once to the host (it uses it to load the list at the right time):
    // hence the mirror, rather than a hidden effect in a state updater.
    const mentionActiveRef = useRef(false);
    const refreshMention = useCallback(() => {
      const next = readMention()?.query ?? null;
      setMentionQuery((prev) => (prev === next ? prev : next));
      const active = next !== null;
      if (mentionActiveRef.current !== active) {
        mentionActiveRef.current = active;
        onMentionQuery?.(active);
      }
    }, [readMention, onMentionQuery]);

    // The request changes → we start from the first suggestion.
    useEffect(() => setMentionIndex(0), [mentionQuery]);

    const insertMention = useCallback(
      (option: MentionOption) => {
        const found = readMention();
        const el = editorRef.current;
        if (!found || !el) return;
        const range = document.createRange();
        range.setStart(found.node, found.start);
        range.setEnd(found.node, found.end);
        range.deleteContents();

        const pill = document.createElement("span");
        pill.contentEditable = "false";
        pill.dataset.mentionType = option.type;
        pill.dataset.mentionId = option.id;
        pill.dataset.mentionLabel = option.label;
        if (option.avatarSeed) pill.dataset.mentionSeed = option.avatarSeed;
        const iconAttr = option.iconUrl ?? option.icon;
        if (iconAttr) pill.dataset.mentionIcon = iconAttr;
        if (option.color) pill.dataset.mentionColor = option.color;
        pill.className = MENTION_SLOT_CLASS;
        range.insertNode(pill);

        // Unbreakable space after the pill: without it, the caret finds itself
        // stuck to an uneditable node and the next keystroke goes wrong.
        const space = document.createTextNode(" ");
        pill.after(space);

        const sel = window.getSelection();
        if (sel) {
          const after = document.createRange();
          after.setStart(space, 1);
          after.collapse(true);
          sel.removeAllRanges();
          sel.addRange(after);
        }
        el.focus();
        setMentionQuery(null);
        mentionActiveRef.current = false;
        onMentionQuery?.(false);
        setIsEmpty(false);
        syncMentionSlots();
      },
      [readMention, onMentionQuery, syncMentionSlots],
    );

    /** The mentions actually made in the text, duplicated. */
    const collectMentions = useCallback((): AssistantMention[] => {
      const el = editorRef.current;
      if (!el) return [];
      const seen = new Set<string>();
      const out: AssistantMention[] = [];
      for (const node of el.querySelectorAll<HTMLElement>("[data-mention-id]")) {
        const option = mentionFromNode(node);
        if (!option) continue;
        const key = `${option.type}:${option.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          type: option.type,
          id: option.id,
          label: option.label,
          ...(option.avatarSeed ? { avatarSeed: option.avatarSeed } : {}),
          ...(option.color ? { color: option.color } : {}),
          ...(option.icon ? { icon: option.icon } : {}),
        });
      }
      return out;
    }, []);

    // ── Commandes « / » ─────────────────────────────────────────────
    // The menu only lives as long as the ENTIRE message is “/request”: a
    // single line of bare text, no pill already placed. The detection is read again
    // so from the full editor — not from the caret like the mentions:
    // a command only exists at the top of the message.
    const [slashQuery, setSlashQuery] = useState<string | null>(null);
    const [slashIndex, setSlashIndex] = useState(0);

    const readSlash = useCallback((): string | null => {
      if (!commands?.length) return null;
      const el = editorRef.current;
      if (!el) return null;
      // Only text nodes — no pill already placed, no return to the
      // line. The <br> that the browser sometimes leaves hanging at the end
      // publisher does not count; elsewhere, it's a real line break.
      const nodes = [...el.childNodes];
      const last = nodes[nodes.length - 1];
      if (last instanceof HTMLElement && last.tagName === "BR") nodes.pop();
      if (nodes.some((n) => n.nodeType !== Node.TEXT_NODE)) return null;
      const text = nodes.map((n) => n.textContent ?? "").join("");
      return text.startsWith("/") ? text.slice(1) : null;
    }, [commands]);

    // Reread on typing only: Escape closes the menu, and it does not reopen
    // only at the next character typed — not at the slightest movement of the caret.
    const refreshSlash = useCallback(() => {
      const next = readSlash();
      setSlashQuery((prev) => (prev === next ? prev : next));
    }, [readSlash]);

    const slashOptions = useMemo(
      () =>
        slashQuery === null || !commands?.length
          ? []
          : filterCommands(commands, slashQuery),
      [slashQuery, commands],
    );
    const slashOpen = slashOptions.length > 0;
    const activeSlash = Math.min(
      slashIndex,
      Math.max(0, slashOptions.length - 1),
    );

    // The query changes → we start from the first command.
    useEffect(() => setSlashIndex(0), [slashQuery]);

    const insertCommand = useCallback((option: SlashCommandOption) => {
      const el = editorRef.current;
      if (!el) return;
      // The composer only contains “/request” (condition for opening the
      // menu): everything is replaced by the pill, followed by the non-breaking space
      // which makes a node editable with caret — same gesture as the mentions.
      el.innerHTML = "";
      const pill = document.createElement("span");
      pill.contentEditable = "false";
      pill.dataset.commandId = option.id;
      pill.dataset.commandLabel = option.label;
      pill.className = COMMAND_PILL_CLASS;
      pill.textContent = `/${option.label}`;
      el.appendChild(pill);
      const space = document.createTextNode(" ");
      pill.after(space);

      const sel = window.getSelection();
      if (sel) {
        const after = document.createRange();
        after.setStart(space, 1);
        after.collapse(true);
        sel.removeAllRanges();
        sel.addRange(after);
      }
      el.focus();
      setSlashQuery(null);
      setIsEmpty(false);
    }, []);

    /** The command actually placed at the top of the message, if there is one. */
    const collectCommand = useCallback((): AssistantCommandId | undefined => {
      const node =
        editorRef.current?.querySelector<HTMLElement>("[data-command-id]");
      return (node?.dataset.commandId as AssistantCommandId | undefined) ?? undefined;
    }, []);

    const handleSubmit = useCallback(() => {
      const value = serializeContent();
      if (!value || disabled || sendDisabled || uploads.uploading) return;
      const accepted = onSend(value, uploads.inputs, collectMentions(), collectCommand());
      if (accepted === false) return;
      clearEditor();
      uploads.clear();
      // The caret remains in the composer after sending. Without that the focus escapes
      // (emptying a contentEditable loses it; clicking Send focuses a button which
      // disappears just after), and in the Numo panel the FocusScope of the Sheet the
      // repatriated to the shell — hence a halo of focus around the panel.
      editorRef.current?.focus();
      setMentionQuery(null);
    }, [
      serializeContent,
      onSend,
      disabled,
      sendDisabled,
      clearEditor,
      uploads,
      collectMentions,
      collectCommand,
    ]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        // Open slash menu: same keyboard contract as the list of mentions.
        if (slashOpen) {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const n = slashOptions.length;
            setSlashIndex((i) => {
              const from = Math.min(i, n - 1);
              return e.key === "ArrowDown" ? (from + 1) % n : (from - 1 + n) % n;
            });
            return;
          }
          if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            insertCommand(slashOptions[activeSlash]);
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setSlashQuery(null);
            return;
          }
        }
        // List of mentions open: the arrows and Enter belong to it —
        // otherwise the caret would exit the request (or the message would leave).
        if (mentionOpen) {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const n = mentionOptions.length;
            setMentionIndex((i) => {
              const from = Math.min(i, n - 1);
              return e.key === "ArrowDown" ? (from + 1) % n : (from - 1 + n) % n;
            });
            return;
          }
          if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            insertMention(mentionOptions[activeMention]);
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setMentionQuery(null);
            mentionActiveRef.current = false;
            onMentionQuery?.(false);
            return;
          }
        }
        // ⌘/Ctrl + Enter SEND; Input only moves to line. This compose
        // is not a one-line chat field: we write an instruction
        // several sentences, mentions tickets, and pastes part of a log —
        // and Entree left in the middle of a thought. The contract is the same in
        // the four surfaces that mount it (home, Numo panel, page
        // agents, agent conversation), since they mount CE compose, and the
        // same as in all other composers of the app (`send-shortcut`) —
        // including when the account has set sending to Enter only.
        if (isSend(e)) {
          e.preventDefault();
          handleSubmit();
        }
      },
      [
        isSend,
        handleSubmit,
        mentionOpen,
        mentionOptions,
        activeMention,
        insertMention,
        onMentionQuery,
        slashOpen,
        slashOptions,
        activeSlash,
        insertCommand,
      ]
    );

    const handleInput = useCallback(() => {
      const el = editorRef.current;
      if (!el) return;
      const empty = !el.textContent?.trim();
      setIsEmpty(empty);

      if (empty && el.innerHTML !== "") {
        el.innerHTML = "";
      }
      refreshMention();
      refreshSlash();
      syncMentionSlots();
    }, [refreshMention, refreshSlash, syncMentionSlots]);

    /**
     * Pastes only the text provided by the clipboard. The editors of
     * code (including VS Code) often also provide a `text/html` version
     * enriched with spans and styles; let the browser insert it into the
     * contentEditable would bring this DOM into the composer. A text node
     * unique preserves markdown characters and newlines, without
     * import this foreign formatting.
     */
    const insertPlainText = useCallback(
      (value: string) => {
        const el = editorRef.current;
        if (!el || !value) return;

        const selection = window.getSelection();
        const range = document.createRange();
        if (
          selection &&
          selection.rangeCount > 0 &&
          el.contains(selection.getRangeAt(0).commonAncestorContainer)
        ) {
          range.setStart(
            selection.getRangeAt(0).startContainer,
            selection.getRangeAt(0).startOffset,
          );
          range.setEnd(
            selection.getRangeAt(0).endContainer,
            selection.getRangeAt(0).endOffset,
          );
        } else {
          range.selectNodeContents(el);
          range.collapse(false);
        }

        range.deleteContents();
        const textNode = document.createTextNode(value.replace(/\r\n?/g, "\n"));
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);

        setIsEmpty(false);
        refreshMention();
        refreshSlash();
        syncMentionSlots();
        el.focus();
      },
      [refreshMention, refreshSlash, syncMentionSlots],
    );

    const handlePaste = useCallback(
      (e: React.ClipboardEvent<HTMLDivElement>) => {
        if (canAttach && userId && e.clipboardData.files.length > 0) {
          e.preventDefault();
          uploads.addFiles(e.clipboardData.files);
          return;
        }

        // Never let the browser choose `text/html` for a text paste. The plain
        // representation is the source of truth for markdown messages.
        const text = e.clipboardData.getData("text/plain") || e.clipboardData.getData("text");
        e.preventDefault();
        if (!text) return;
        insertPlainText(text);
      },
      [canAttach, insertPlainText, uploads, userId],
    );

    // Dictated text is additive: appended after the existing content, caret at
    // the end (same behavior as AutoKap's composer).
    const appendDictated = useCallback((text: string) => {
      const el = editorRef.current;
      if (!el) return;
      const current = (el.textContent ?? "").trim();
      el.textContent = current ? `${current} ${text}` : text;
      setIsEmpty(false);
      el.focus();
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        fill(text: string) {
          const el = editorRef.current;
          if (!el) return;
          el.textContent = text;
          setIsEmpty(false);
          el.focus();
          const sel = window.getSelection();
          if (sel) {
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        },
      }),
      []
    );

    useEffect(() => {
      if (noBorder && editorRef.current) {
        editorRef.current.focus();
      }
    }, [noBorder]);

    // One-shot pre-filling (editing): we write the initial text, caret in
    // fine, ready for editing — the Agent Launch Composer uses this to
    // pre-write “Works on MIN-42”.
    useEffect(() => {
      const el = editorRef.current;
      if (!initialValue || !el) return;
      el.textContent = initialValue;
      setIsEmpty(false);
      el.focus();
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      // Intentionally during editing only (no resync on change).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const focusEditorAtEnd = useCallback(() => {
      const el = editorRef.current;
      if (!el || disabled) return;
      el.focus();
      const sel = window.getSelection();
      if (!sel) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }, [disabled]);

    const handleContainerMouseDown = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        if (editorRef.current?.contains(target)) return;
        if (target.closest("button, a, input, textarea, select")) return;
        // A menu carried outside of the composer (the context addition popover) remains
        // his CHILD React: his events go back so far. Without this
        // guardrail, clicking a menu entry returned focus to the editor —
        // and Radix, seeing the focus leave, closed the menu immediately.
        if (target.closest('[data-slot="popover-content"], [role="dialog"]')) return;
        e.preventDefault();
        focusEditorAtEnd();
      },
      [focusEditorAtEnd]
    );

    return (
      <div
        className={cn(
          "relative",
          noBorder ? "px-3 pb-3" : "px-3 py-3",
          className,
        )}
        onMouseDown={handleContainerMouseDown}
      >
        {/* Each mention placed in the text receives ITS pill, carried in its
 envelope: same component as in the bubble sent, so never
 two drawings to live in parallel. */}
        {mentionSlots.map(({ el, option }, index) =>
          createPortal(
            <MentionChip
              type={option.type}
              id={option.id}
              label={option.label}
              avatarSeed={option.avatarSeed}
              iconUrl={option.iconUrl}
              icon={option.icon}
              color={option.color}
            />,
            el,
            // Two mentions of the SAME person in a message: the key takes
            // the rank, otherwise React would see the same thing twice.
            `${option.type}:${option.id}:${index}`,
          ),
        )}
        {/* The list of mentions lives OUTSIDE the surface of the composer: this one
 is `overflow-hidden` (the border, the drop zone), it would cut it. */}
        {mentionOpen && (
          <MentionSuggestions
            options={mentionOptions}
            activeIndex={activeMention}
            onPick={insertMention}
            onHover={setMentionIndex}
            className="left-3"
          />
        )}
        {/* The slash menu shares the place (and reasons for being out of the
 surface) of the mentions list; both cannot be opened at the same time — one requires a "/" at the top of the message, and the other requires a "@" while typing. */}
        {slashOpen && (
          <SlashMenu
            options={slashOptions}
            activeIndex={activeSlash}
            onPick={insertCommand}
            onHover={setSlashIndex}
            className="left-3"
          />
        )}
        {/* `keepMounted`: the dial must NEVER be reassembled when the border
 turns on or off — otherwise the editor loses focus (the FocusScope of the
 Sheet then rests it on the shell) and the text typed during the
 response disappears. */}
        {contextSlot && contextPlacement === "above" ? (
          <div className="relative z-0 mx-3 -mb-7 flex min-h-[70px] items-start rounded-t-[1.5rem] bg-muted/60 px-2 pt-2 dark:bg-muted/35">
            {contextSlot}
          </div>
        ) : null}
        <AgentBeam active={!!beam} keepMounted className="relative z-10 rounded-2xl">
        <div
          className={cn(
            "chat-input-surface relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all",
            drop.dragging
              ? "border-brand ring-2 ring-brand/20"
              : isFocused
                ? "border-brand/40 ring-2 ring-brand/10"
                : "border-border"
          )}
          {...(canAttach ? drop.handlers : {})}
        >
          <DropOverlay show={canAttach && drop.dragging} />
          {/* Context row (pills + @ button), provided by the host. She
 scrolls horizontally and therefore keeps its own row: the
 attachments are stacked below. Concentric
 nesting: the surface is rounded-2xl (--radius-2xl =
 --radius + 8px = 24px), so a pill in rounded-md
 (--radius - 2px = 14px) + the 10px (p-2.5) which separate it du
 edge === 24px. */}
          {contextPlacement === "inside" ? contextSlot : null}
          {uploads.pending.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-2.5 pt-2.5">
              <ResourcePills
                radius="md"
                pillClassName="shadow-none"
                resources={uploads.pending.filter((p) => p.status === "done")}
                pending={uploads.pending}
                onRemove={(a) => {
                  const match = uploads.pending.find(
                    (p) => p.storage_path === a.storage_path
                  );
                  if (match) uploads.remove(match.localId);
                }}
                onRemovePending={uploads.remove}
              />
            </div>
          )}
          <div className="relative max-h-[180px] min-h-[52px] overflow-y-auto px-4 pb-1 pt-3">
            <div
              ref={editorRef}
              contentEditable={!disabled}
              role="textbox"
              aria-multiline="true"
              aria-placeholder={effectivePlaceholder}
              suppressContentEditableWarning
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              // The caret can exit an “@” query without the text
              // change (arrows, click): we reread afterwards.
              onKeyUp={(e) => {
                if (
                  ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(
                    e.key
                  )
                )
                  refreshMention();
              }}
              onClick={refreshMention}
              onPaste={handlePaste}
              onFocus={() => setIsFocused(true)}
              onBlur={() => {
                setIsFocused(false);
                // Slight delay: clicking on a suggestion occurs before.
                setTimeout(() => {
                  setMentionQuery(null);
                  setSlashQuery(null);
                  mentionActiveRef.current = false;
                  onMentionQuery?.(false);
                }, 120);
              }}
              className="min-h-[24px] whitespace-pre-wrap break-words text-sm leading-relaxed outline-none [&:empty]:before:pointer-events-none [&:empty]:before:text-muted-foreground [&:empty]:before:content-[attr(aria-placeholder)]"
            />
          </div>

          <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
            <div className="flex min-w-0 items-center gap-1.5">
              {leadingControls}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {canAttach && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={ACCEPT}
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.length) uploads.addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={disabled || !userId}
                    onClick={() => fileInputRef.current?.click()}
                    className="h-8 w-8 shrink-0 rounded-full text-muted-foreground"
                    aria-label={tAttach("attach")}
                    title={tAttach("attach")}
                  >
                    <Paperclip className="size-4" />
                  </Button>
                </>
              )}
              {isStreaming && (isEmpty || !sendWhileStreaming) ? (
                <Button
                  size="icon-sm"
                  variant="default"
                  onClick={onAbort}
                  className="h-8 w-8 shrink-0 rounded-full bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
                  title={t("stop")}
                >
                  <Square className="h-3 w-3 fill-white text-white dark:fill-black dark:text-black" />
                </Button>
              ) : (
                <>
                  {!isStreaming && (
                    <DictateButton
                      onTranscription={appendDictated}
                      disabled={disabled}
                      className={canAttach ? "-ml-0.5" : undefined}
                    />
                  )}
                  {!isEmpty &&
                    (sendDisabled && sendDisabledTooltip ? (
                      // Sending blocked with explanation: a native <button disabled>
                      // no longer emits pointer events (the Radix tooltip no longer emits
                      // would never open) → same assembly as the locked chip
                      // of the BranchCombobox, the outer <span> carries the hover.
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex cursor-not-allowed">
                            <span
                              aria-label={t("send")}
                              aria-disabled="true"
                              className="pointer-events-none inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">{sendDisabledTooltip}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <SendButtonWithCost
                        cost={null}
                        isLoading={false}
                        disabled={(disabled ?? false) || (sendDisabled ?? false) || uploads.uploading}
                        onClick={handleSubmit}
                        ariaLabel={t("send")}
                        // Entrance no longer leaving, the shortcut which leaves must be
                        // read somewhere: when hovering over the button, like on
                        // all the send buttons in the app.
                        tooltipLabel={
                          <span className="inline-flex items-center gap-1.5">
                            {t("send")}
                            <SendShortcutKeys />
                          </span>
                        }
                      />
                    ))}
                </>
              )}
            </div>
          </div>
        </div>
        </AgentBeam>
      </div>
    );
  }
);
