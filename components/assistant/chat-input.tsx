"use client";

import { useEscapeLayer } from "@/lib/escape-layers";
import { OBJECTIVE_STATUS_MAP } from "@/lib/objective-constants";
import { pastedMentionPieces } from "@/lib/mention-paste";
import { allowInputAutoFocus } from "@/lib/mobile-sheet-focus";

import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, ArrowUp01Icon, AttachmentIcon, Layers01Icon, SquareIcon } from "@hugeicons/core-free-icons";
import {
  type ReactNode,
  useRef,
  useCallback,
  useMemo,
  useState,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  forwardRef,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { SendButtonWithCost } from "@/components/ui/send-button-with-cost";
import { cn } from "@/lib/utils";
import { AgentBeam } from "@/components/agent-beam";
import { DictateButton } from "@/components/ai-elements/dictate-button";
import { MentionChip } from "@/components/mention-chip";
import {
  MentionFigure,
  MentionSuggestions,
  filterMentions,
  sectionedMentions,
  type MentionOption,
} from "@/components/mention-suggest";
import {
  SlashMenu,
  filterSlashOptions,
  repositorySkillOptions,
  type SlashCommandOption,
  type SlashMenuOption,
} from "@/components/assistant/slash-menu";
import { SkillChip } from "@/components/assistant/skill-chip";
import { SkillPreviewDialog } from "@/components/assistant/skill-preview-dialog";
import { McpMenuGroup } from "@/components/assistant/mcp-menu-group";
import {
  ResourcePills,
  DropOverlay,
  useFileDrop,
  type ResourceLike,
} from "@/components/resources";
import {
  ScrollableContextRow,
  type AdaptiveContextItem,
} from "@/components/assistant/adaptive-context-row";
import { SearchMenu } from "@/components/search-menu";
import { SendShortcutKeys } from "@/components/send-shortcut";
import { Kbd } from "@/components/ui/kbd";
import { matchesModShiftCombo } from "@/lib/keyboard/mod-combo";
import { deleteComposerTokenBeforeCaret } from "@/lib/composer-token-delete";
import { useModKey } from "@/lib/keyboard/use-mod-shortcut";
import { useIsSendShortcut } from "@/lib/keyboard/use-send-mode";
import {
  filterMentionItems,
  findActiveMentionQuery,
} from "@/lib/mention-menu";
import { useSemanticMentions } from "@/lib/use-semantic-mentions";
import { stepSuggestion } from "@/lib/suggestion-menu";
import { SemanticSearchingHint } from "@/components/semantic-searching-hint";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { assistantDraftHtml } from "@/lib/assistant-composer-draft";
import {
  findActiveComposerMenuQuery,
  type ActiveComposerMenuQuery,
} from "@/lib/assistant-slash-options";
import {
  useAttachmentUploads,
  type AttachmentUploads,
  type PendingResource,
} from "@/lib/use-attachment-uploads";
import { useAuth } from "@/lib/auth-context";
import type {
  AssistantCommandId,
  AssistantMention,
  AssistantPinnedContext,
} from "@/lib/assistant-types";
import type { ResourceInput } from "@/lib/types";
import {
  MAX_SELECTED_SKILLS,
  repositorySkillKey,
  type RepositorySkill,
  type RepositorySkillSummary,
} from "@/lib/repository-skills";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** What the "+" offers Numo: files it can actually read (images, PDF, CSV,
    text-ish) — MIN-24 scope. */
const ACCEPT =
  "image/*,application/pdf,text/csv,text/plain,text/markdown,application/json,.csv,.txt,.md,.json,.log";
const ATTACHMENT_SHORTCUT_KEY = "a";

/** The envelope of a mention in the editor: a NON-editable, empty node, in
 which React carries the real pill (MentionChip). Composing it does not redraw
 so it is not a pill “like” the one in the context — it is the same. */
const MENTION_SLOT_CLASS = "inline-block align-baseline";
const SKILL_SLOT_CLASS = MENTION_SLOT_CLASS;

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

type ActiveSlashQuery = ActiveComposerMenuQuery & {
  node: Text;
  commandsAllowed: boolean;
};

/** Reads a composer pill back into its option (exported for tests). */
export function mentionFromNode(node: HTMLElement): MentionOption | null {
  const type = node.dataset.mentionType;
  const id = node.dataset.mentionId;
  const label = node.dataset.mentionLabel;
  if (!id || !label || !type || !MENTION_TYPES.has(type)) return null;
  return {
    type: type as MentionOption["type"],
    id,
    label,
    ...(node.dataset.mentionProjectId ? { projectId: node.dataset.mentionProjectId } : {}),
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
    ...(node.dataset.mentionStatus
      ? { status: node.dataset.mentionStatus as MentionOption["status"] }
      : {}),
    // An objective's own status, so its pill shows it instead of the target
    // once inserted, as the suggestion did (MIN-785).
    ...(node.dataset.mentionObjectiveStatus
      ? { objectiveStatus: node.dataset.mentionObjectiveStatus as MentionOption["objectiveStatus"] }
      : {}),
  };
}

/** The composer pill an option becomes (exported for tests). */
export function createMentionNode(option: MentionOption): HTMLSpanElement {
  const pill = document.createElement("span");
  pill.contentEditable = "false";
  pill.dataset.mentionType = option.type;
  pill.dataset.mentionId = option.id;
  if (option.projectId) pill.dataset.mentionProjectId = option.projectId;
  pill.dataset.mentionLabel = option.label;
  if (option.avatarSeed) pill.dataset.mentionSeed = option.avatarSeed;
  const iconAttr = option.iconUrl ?? option.icon;
  if (iconAttr) pill.dataset.mentionIcon = iconAttr;
  if (option.color) pill.dataset.mentionColor = option.color;
  if (option.status) pill.dataset.mentionStatus = option.status;
  if (option.objectiveStatus) pill.dataset.mentionObjectiveStatus = option.objectiveStatus;
  pill.className = MENTION_SLOT_CLASS;
  return pill;
}

function skillFromNode(node: HTMLElement): RepositorySkillSummary | null {
  const path = node.dataset.skillPath;
  const name = node.dataset.skillName;
  const description = node.dataset.skillDescription;
  const source = node.dataset.skillSource as RepositorySkillSummary["source"] | undefined;
  if (!path || !name || description === undefined || !source) return null;
  return { path, name, description, source, ...(node.dataset.skillProjectId ? { projectId: node.dataset.skillProjectId } : {}) };
}

function createSkillNode(skill: RepositorySkillSummary): HTMLSpanElement {
  const pill = document.createElement("span");
  pill.contentEditable = "false";
  pill.dataset.skillPath = skill.path;
  if (skill.projectId) pill.dataset.skillProjectId = skill.projectId;
  pill.dataset.skillName = skill.name;
  pill.dataset.skillDescription = skill.description;
  pill.dataset.skillSource = skill.source;
  pill.className = SKILL_SLOT_CLASS;
  return pill;
}

let placeholderCanvas: CanvasRenderingContext2D | null | undefined;
/** The width of the placeholder on one line, in the editor's font. Infinite
 when it cannot be measured, so the composer stays expanded rather than
 flipping back to a compact row its placeholder overflows. */
function placeholderWidth(text: string, style: CSSStyleDeclaration): number {
  if (!text) return 0;
  if (placeholderCanvas === undefined) {
    try {
      placeholderCanvas = document.createElement("canvas").getContext("2d");
    } catch {
      placeholderCanvas = null;
    }
  }
  if (!placeholderCanvas || !style.font) return Infinity;
  placeholderCanvas.font = style.font;
  return placeholderCanvas.measureText(text).width;
}

function focusContentEditableAtEnd(element: HTMLElement) {
  element.focus();
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

export interface ChatInputContextAttachments {
  resources: ResourceLike[];
  pending: PendingResource[];
  onRemove: (resource: ResourceLike) => void;
  onRemovePending: (localId: string) => void;
}

export interface ChatInputProps {
  /** Close an enclosing panel when the composer opens account settings. */
  onNavigate?: () => void;
  onSend: (
    message: string,
    attachments: ResourceInput[],
    mentions: AssistantMention[],
    /** The “/” command placed at the top of the message, when there is one. */
    command?: AssistantCommandId,
    /** Repository skills explicitly attached to this message. */
    skills?: RepositorySkillSummary[],
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
   * Context row placed at the top of the composer, above the text. A render
   * function receives the current uploads so the host can merge every context
   * item into one adaptive row.
   */
  contextSlot?:
    | ReactNode
    | ((attachments: ChatInputContextAttachments) => ReactNode);
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
  /** Adds a mentionable entity to Numo's pinned context. When provided, the
   * left-side add button combines this flat picker with file upload. */
  onAddContext?: (item: AssistantPinnedContext) => void;
  /**
   * The “/” commands offered when the message STARTS with a slash.
   * Empty/absent = no slash menu at all (composers outside the Numo shell).
   * Choose a command and place it as a non-editable pill at the top of the message;
   * its canonical id leaves with the sending (4th argument of `onSend`).
   */
  commands?: SlashCommandOption[];
  /** Agent Skills discovered in the active project's linked repository. */
  skills?: RepositorySkillSummary[];
  /** Loads the selected skill instructions only when its badge is opened. */
  loadSkill?: (
    skill: RepositorySkillSummary,
  ) => Promise<RepositorySkill | null>;
  /**
   * Text to seed the editor with on mount (caret placed at the end, ready to
   * edit). Used by the agent launch composer to pre-write "Work on MIN-42".
   * One-shot: only read once when the composer mounts.
   */
  initialValue?: string;
  /** In-memory HTML snapshot used to move one draft between Numo surfaces. */
  draftHtml?: string;
  onDraftHtmlChange?: (html: string) => void;
  /** Reports whether the composer holds no text, e.g. to hide suggestions. */
  onEmptyChange?: (empty: boolean) => void;
  /** Focus a restored draft at its end, ready to continue writing. */
  restoreCaretAtEnd?: boolean;
  /** Shared upload queue paired with the retained Numo draft. */
  attachmentUploads?: AttachmentUploads;
  /**
   * Extra controls placed just before the dictation and send buttons, on the
   * right (MIN-827): Numo's model picker.
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
  /** Append text after the content, pills kept, caret at the end (type-ahead). */
  append: (text: string) => void;
  /** Put the caret at the end of the composer, leaving its text as it is. */
  focus: () => void;
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput(
    {
      onSend,
      onNavigate,
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
      onAddContext,
      commands,
      skills,
      loadSkill,
      initialValue,
      draftHtml,
      onDraftHtmlChange,
      onEmptyChange,
      restoreCaretAtEnd = false,
      attachmentUploads,
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
    const modKey = useModKey();
    const tAttach = useTranslations("Resources");
    const tPicker = useTranslations("Picker");
    const effectivePlaceholder = placeholder ?? t("inputPlaceholder");
    const editorRef = useRef<HTMLDivElement>(null);
    // A long message scrolls inside the field: its hidden lines fade at the
    // edge they are behind, like every other scroller of the app.
    const { ref: textScrollRef, scrollProps: textScrollProps } = useScrollFade<HTMLDivElement>("y", "1.25rem");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [addMenuOpen, setAddMenuOpen] = useState(false);
    const [addMenuQuery, setAddMenuQuery] = useState("");
    const [addMenuContainer, setAddMenuContainer] = useState<HTMLElement | null>(
      null,
    );
    const [isEmpty, setIsEmpty] = useState(true);
    useEffect(() => {
      onEmptyChange?.(isEmpty);
    }, [isEmpty, onEmptyChange]);
    const { user } = useAuth();
    const userId = user?.id;
    const localUploads = useAttachmentUploads(() => `chat/${userId}`, { max: 5 });
    const uploads = attachmentUploads ?? localUploads;
    const publishedDraftRef = useRef<string | undefined>(undefined);
    const publishDraft = useCallback(() => {
      const html = editorRef.current ? assistantDraftHtml(editorRef.current) : "";
      publishedDraftRef.current = html;
      onDraftHtmlChange?.(html);
    }, [onDraftHtmlChange]);
    const uploadedResources = uploads.pending.filter(
      (entry) => entry.status === "done",
    );
    const removeUploadedResource = useCallback(
      (resource: ResourceLike) => {
        const match = uploads.pending.find(
          (entry) => entry.storage_path === resource.storage_path,
        );
        if (match) uploads.remove(match.localId);
      },
      [uploads],
    );
    const contextAttachments: ChatInputContextAttachments = {
      resources: uploadedResources,
      pending: uploads.pending,
      onRemove: removeUploadedResource,
      onRemovePending: uploads.remove,
    };
    const mergedContext =
      typeof contextSlot === "function"
        ? contextSlot(contextAttachments)
        : contextSlot;
    const contextIncludesAttachments = typeof contextSlot === "function";
    const standaloneAttachmentItems: AdaptiveContextItem[] = [
      ...uploadedResources.map((resource) => ({
        key: `resource:${resource.localId}`,
        render: () => (
          <ResourcePills
            radius="md"
            // One line shared with the context chips: the compact form.
            variant="pill"
            className="flex-nowrap"
            pillClassName="shadow-none"
            resources={[resource]}
            draft
            onRemove={removeUploadedResource}
          />
        ),
      })),
      ...uploads.pending
        .filter((resource) => resource.status === "uploading")
        .map((resource) => ({
          key: `pending:${resource.localId}`,
          render: () => (
            <ResourcePills
              radius="md"
              // One line shared with the context chips: the compact form.
              variant="pill"
              className="flex-nowrap"
              pillClassName="shadow-none"
              pending={[resource]}
              onRemovePending={uploads.remove}
            />
          ),
        })),
    ];
    // The agent accepts a message that steers it while it works
    // (`sendWhileStreaming`): its files must remain reachable in this
    // same case. The Numo cat keeps its button hidden as long as it generates.
    const canAttach = !hideAttach && (!isStreaming || !!sendWhileStreaming);
    const hasMentionMenu = mentionables !== undefined || !!onAddContext;
    const hasSkillMenu = skills !== undefined;
    const hasMcpMenu = !!userId;
    const canAdd = canAttach || !!onAddContext || hasSkillMenu || hasMcpMenu;
    const drop = useFileDrop((files) => {
      if (userId) uploads.addFiles(files);
    });

    const addMenuAnchorRef = useCallback((node: HTMLDivElement | null) => {
      setAddMenuContainer(
        node
          ? (node.closest('[data-slot="sheet-content"]') as HTMLElement | null)
          : null,
      );
    }, []);

    const handleAddMenuOpenChange = useCallback(
      (open: boolean) => {
        setAddMenuOpen(open);
        if (open) onMentionQuery?.(true);
        else setAddMenuQuery("");
      },
      [onMentionQuery],
    );

    const addContextTextOptions = useMemo(
      () => filterMentionItems(mentionables ?? [], addMenuQuery),
      [addMenuQuery, mentionables],
    );
    // Issues found by meaning (MIN-718), after the text matches.
    const { options: addContextOptions, status: addContextSemanticStatus } = useSemanticMentions(
      addContextTextOptions,
      mentionables ?? [],
      addMenuQuery,
      addMenuOpen,
    );

    const handleAttachShortcut = useCallback(
      (e: React.KeyboardEvent) => {
        if (
          !canAttach ||
          disabled ||
          !userId ||
          !matchesModShiftCombo(e, ATTACHMENT_SHORTCUT_KEY)
        ) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        setAddMenuOpen(false);
        setAddMenuQuery("");
        fileInputRef.current?.click();
      },
      [canAttach, disabled, userId],
    );

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

          if (element.dataset.skillName) {
            parts.push(`/${element.dataset.skillName}`);
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
        setSkillSlots([]);
        setSlashQuery(null);
        publishedDraftRef.current = "";
        onDraftHtmlChange?.("");
      }
    }, [onDraftHtmlChange]);

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
    const [skillSlots, setSkillSlots] = useState<
      Array<{ el: HTMLElement; skill: RepositorySkillSummary }>
    >([]);
    const [previewSkill, setPreviewSkill] =
      useState<RepositorySkillSummary | null>(null);

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

    const syncSkillSlots = useCallback(() => {
      const el = editorRef.current;
      const found = el
        ? [...el.querySelectorAll<HTMLElement>("[data-skill-path]")]
        : [];
      setSkillSlots((prev) => {
        const unchanged =
          prev.length === found.length &&
          prev.every((slot, index) => slot.el === found[index]);
        if (unchanged) return prev;
        return found
          .map((node) => ({ el: node, skill: skillFromNode(node) }))
          .filter(
            (slot): slot is { el: HTMLElement; skill: RepositorySkillSummary } =>
              slot.skill !== null,
          );
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
      const match = findActiveMentionQuery(before);
      if (!match) return null;
      return {
        node: node as Text,
        start: match.start,
        end,
        query: match.query,
      };
    }, []);

    const mentionTextOptions = useMemo(
      () =>
        mentionQuery === null || !mentionables?.length
          ? []
          : filterMentions(mentionables, mentionQuery),
      [mentionQuery, mentionables],
    );
    // Issues found by meaning (MIN-718): appended last, and the highlight
    // resets on the query only, so a late answer never moves it.
    const { options: foundMentionOptions, status: mentionSemanticStatus } = useSemanticMentions(
      mentionTextOptions,
      mentionables ?? [],
      mentionQuery ?? "",
      mentionQuery !== null,
    );
    // In the order the list shows them, section by section: the keyboard
    // walks this order, and the index after the last one is “Close menu”.
    const mentionOptions = useMemo(
      () => sectionedMentions(foundMentionOptions).ordered,
      [foundMentionOptions],
    );
    // The list also stays open while a search by meaning runs, so a
    // description with no text match does not leave the caret silent; once
    // it answers with nothing, the list closes like any query with no match.
    const mentionOpen = mentionOptions.length > 0 || mentionSemanticStatus === "searching";
    // -1 until the arrows move: the first option then, or nothing at all when
    // only the status row shows, so Enter keeps its own meaning there.
    const activeMention =
      mentionIndex < 0
        ? mentionOptions.length > 0 ? 0 : -1
        : Math.min(mentionIndex, mentionOptions.length);

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
    useEffect(() => setMentionIndex(-1), [mentionQuery]);

    // Escape and “Close menu”: the list closes, the typed “@…” stays text,
    // and the next character typed reads it again.
    const closeMentionMenu = useCallback(() => {
      setMentionQuery(null);
      mentionActiveRef.current = false;
      onMentionQuery?.(false);
    }, [onMentionQuery]);

    const insertMention = useCallback(
      (option: MentionOption) => {
        const found = readMention();
        const el = editorRef.current;
        if (!found || !el) return;
        const range = document.createRange();
        range.setStart(found.node, found.start);
        range.setEnd(found.node, found.end);
        range.deleteContents();

        const pill = createMentionNode(option);
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
        publishDraft();
      },
      [readMention, onMentionQuery, publishDraft, syncMentionSlots],
    );

    const addContextOption = useCallback(
      (option: MentionOption) => {
        // A forge account or Numo quotes a WRITER, not an entity to
        // attach: they never land in the context of a conversation.
        if (
          option.type !== "member" &&
          option.type !== "project" &&
          option.type !== "issue" &&
          option.type !== "objective" &&
          option.type !== "page"
        ) {
          return;
        }
        if (onAddContext) {
          onAddContext({
            kind: option.type,
            id: option.id,
            label: option.label,
            ...(option.projectId ? { projectId: option.projectId } : {}),
            ...(option.detail ? { detail: option.detail } : {}),
            ...(option.avatarSeed ? { avatarSeed: option.avatarSeed } : {}),
            ...(option.color !== undefined ? { color: option.color } : {}),
            ...(option.icon !== undefined ? { icon: option.icon } : {}),
          });
        } else {
          const el = editorRef.current;
          if (!el) return;
          const current = el.textContent ?? "";
          if (current && !/[\s ]$/.test(current)) {
            el.appendChild(document.createTextNode(" "));
          }
          const pill = createMentionNode(option);
          const space = document.createTextNode(" ");
          el.append(pill, space);

          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.setStart(space, 1);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
          }
          el.focus();
          setIsEmpty(false);
          syncMentionSlots();
        }
        setAddMenuOpen(false);
        setAddMenuQuery("");
        publishDraft();
      },
      [onAddContext, publishDraft, syncMentionSlots],
    );

    const availableSkills = useMemo(() => {
      if (skillSlots.length >= MAX_SELECTED_SKILLS) return [];
      const selected = new Set(skillSlots.map((slot) => repositorySkillKey(slot.skill)));
      return (skills ?? []).filter((skill) => !selected.has(repositorySkillKey(skill)));
    }, [skillSlots, skills]);

    const addMenuSkillOptions = useMemo(
      () =>
        filterSlashOptions(
          repositorySkillOptions(availableSkills),
          addMenuQuery,
        ).filter((option) => option.kind === "skill"),
      [addMenuQuery, availableSkills],
    );

    const placeSkill = useCallback(
      (
        skill: RepositorySkillSummary,
        activeQuery?: Pick<ActiveSlashQuery, "node" | "start" | "end">,
      ) => {
        const el = editorRef.current;
        if (!el) return;
        const alreadySelected = [
          ...el.querySelectorAll<HTMLElement>("[data-skill-path]"),
        ].some((node) => node.dataset.skillPath === skill.path && node.dataset.skillProjectId === skill.projectId);
        if (alreadySelected) {
          setAddMenuOpen(false);
          setAddMenuQuery("");
          return;
        }
        if (
          el.querySelectorAll("[data-skill-path]").length >= MAX_SELECTED_SKILLS
        ) {
          return;
        }
        const pill = createSkillNode(skill);
        const space = document.createTextNode(" ");
        if (activeQuery) {
          const range = document.createRange();
          range.setStart(activeQuery.node, activeQuery.start);
          range.setEnd(activeQuery.node, activeQuery.end);
          range.deleteContents();
          range.insertNode(pill);
          pill.after(space);
        } else {
          const current = el.textContent ?? "";
          if (current && !/[\s ]$/.test(current)) {
            el.appendChild(document.createTextNode(" "));
          }
          el.append(pill, space);
        }
        const selection = window.getSelection();
        if (selection) {
          const range = document.createRange();
          range.setStart(space, 1);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        el.focus();
        setIsEmpty(false);
        setSlashQuery(null);
        setAddMenuOpen(false);
        setAddMenuQuery("");
        syncSkillSlots();
        publishDraft();
      },
      [publishDraft, syncSkillSlots],
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
        // A forge account or Numo quotes a WRITER, not an entity the
        // conversation carries: they never serialize as context.
        // An attachment mention belongs to the surface that holds it
        // (MIN-742); the Numo composer offers none.
        if (option.type === "forge" || option.type === "numo" || option.type === "resource") continue;
        const key = `${option.type}:${option.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          type: option.type,
          id: option.id,
          label: option.label,
          ...(option.projectId ? { projectId: option.projectId } : {}),
          ...(option.avatarSeed ? { avatarSeed: option.avatarSeed } : {}),
          ...(option.color ? { color: option.color } : {}),
          ...(option.icon ? { icon: option.icon } : {}),
          ...(option.status ? { status: option.status } : {}),
          // An objective keeps the issue state its status borrows (MIN-785).
          ...(option.objectiveStatus
            ? { status: OBJECTIVE_STATUS_MAP[option.objectiveStatus].issueStatus }
            : {}),
        });
      }
      return out;
    }, []);

    const collectSkills = useCallback((): RepositorySkillSummary[] => {
      const el = editorRef.current;
      if (!el) return [];
      const seen = new Set<string>();
      const selected: RepositorySkillSummary[] = [];
      for (const node of el.querySelectorAll<HTMLElement>("[data-skill-path]")) {
        const skill = skillFromNode(node);
        if (!skill || seen.has(repositorySkillKey(skill))) continue;
        seen.add(repositorySkillKey(skill));
        selected.push(skill);
      }
      return selected;
    }, []);

    // ── Commands “/” and inline skills “/” or “$” ───────────────────
    // Skills follow the mention contract: read the query in the text node under
    // the caret and replace only that fragment. Commands remain start-only.
    const [slashQuery, setSlashQuery] = useState<ActiveSlashQuery | null>(null);
    const [slashIndex, setSlashIndex] = useState(0);

    const readSlash = useCallback((): ActiveSlashQuery | null => {
      if (!commands?.length && skills === undefined) return null;
      const el = editorRef.current;
      const selection = window.getSelection();
      if (!el || !selection || !selection.isCollapsed) return null;
      const node = selection.anchorNode;
      if (!node || node.nodeType !== Node.TEXT_NODE || !el.contains(node)) return null;
      const end = selection.anchorOffset;
      const before = (node.textContent ?? "").slice(0, end);
      const trigger = findActiveComposerMenuQuery(before);
      if (!trigger) return null;
      const editorNodes = [...el.childNodes];
      const last = editorNodes[editorNodes.length - 1];
      if (last instanceof HTMLElement && last.tagName === "BR") editorNodes.pop();
      const commandsAllowed =
        trigger.prefix === "/" &&
        trigger.start === 0 &&
        editorNodes.length === 1 &&
        node === editorNodes[0] &&
        end === (node.textContent ?? "").length;
      if (!commandsAllowed && skills === undefined) return null;
      return { ...trigger, node: node as Text, commandsAllowed };
    }, [commands, skills]);

    // Reread on typing only: Escape closes the menu, and it does not reopen
    // only at the next character typed — not at the slightest movement of the caret.
    const refreshSlash = useCallback(() => {
      const next = readSlash();
      setSlashQuery((prev) =>
        prev?.node === next?.node &&
        prev?.prefix === next?.prefix &&
        prev?.query === next?.query &&
        prev?.start === next?.start &&
        prev?.end === next?.end &&
        prev?.commandsAllowed === next?.commandsAllowed
          ? prev
          : next,
      );
    }, [readSlash]);

    const slashOptions = useMemo(
      () =>
        slashQuery === null
          ? []
          : filterSlashOptions(
              !slashQuery.commandsAllowed
                ? repositorySkillOptions(availableSkills)
                : [
                    ...(commands ?? []),
                    ...repositorySkillOptions(availableSkills),
                  ],
              slashQuery.query,
            ),
      [slashQuery, commands, availableSkills],
    );
    const slashOpen = slashOptions.length > 0;
    // Escape in an open menu closes that menu, never the panel around the
    // composer (lib/escape-layers.ts).
    useEscapeLayer(slashOpen, () => setSlashQuery(null));
    useEscapeLayer(mentionOpen, closeMentionMenu);

    // The mention and "/" / "$" menus open where the text is typed, as in the
    // shared editor: just above the caret's line, starting at the caret,
    // kept inside the composer. Measured whenever the query changes, since
    // the caret moves with it. No caret box (a fresh empty line): the menus
    // keep their place at the composer's left edge.
    const rootRef = useRef<HTMLDivElement>(null);
    const [caretAnchor, setCaretAnchor] = useState<{ left: number; bottom: number } | null>(null);
    const menusOpenRef = useRef(false);
    menusOpenRef.current = mentionOpen || slashOpen;
    const measureCaretAnchor = useCallback(() => {
      if (!menusOpenRef.current) return;
      const root = rootRef.current;
      const selection = window.getSelection();
      const rect = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
      if (!root || !rect || rect.height === 0) {
        setCaretAnchor(null);
        return;
      }
      const box = root.getBoundingClientRect();
      const next = { left: rect.left - box.left, bottom: box.bottom - rect.top };
      setCaretAnchor((previous) =>
        previous && previous.left === next.left && previous.bottom === next.bottom ? previous : next,
      );
    }, []);
    useLayoutEffect(() => {
      measureCaretAnchor();
    }, [mentionOpen, slashOpen, mentionQuery, slashQuery, measureCaretAnchor]);
    const menuPlacement = (width: string): CSSProperties | undefined =>
      caretAnchor
        ? {
            left: `clamp(0.75rem, ${caretAnchor.left}px, calc(100% - ${width} - 0.75rem))`,
            bottom: caretAnchor.bottom,
          }
        : undefined;

    // Compact by default, one row: "+", the text, then the model, the mic and
    // send (MIN-827). Context pills and attachments sit in their own row above
    // it without changing it. The text takes its own row above the controls as
    // soon as it wraps or holds a line break, and folds back only once its
    // single line fits the compact row again, so it never flips at the
    // boundary. The surface's height follows its content
    // through a transition, which CSS alone cannot do from `auto` to `auto`.
    const composerGridRef = useRef<HTMLDivElement>(null);
    /** The text area's cap (`max-h-[180px]`): beyond it, the text scrolls. */
    const COMPOSER_TEXT_MAX_HEIGHT = 180;
    const leadControlsRef = useRef<HTMLDivElement>(null);
    const trailControlsRef = useRef<HTMLDivElement>(null);
    const surfaceTopRef = useRef<HTMLDivElement>(null);
    const [textWraps, setTextWraps] = useState(false);
    const [surfaceHeight, setSurfaceHeight] = useState<number | null>(null);
    const expandedLayout = textWraps;
    const expandedLayoutRef = useRef(expandedLayout);
    expandedLayoutRef.current = expandedLayout;
    // What the compact row takes from the grid's width besides the text and
    // the controls (gaps and paddings), measured while compact. Folding back
    // compares the text with exactly the room it wrapped in, minus the
    // controls as they are NOW: an estimate wider than that room let the two
    // layouts disagree, and room recorded with other controls (Stop while
    // Numo replies) kept the composer expanded once they shrank.
    const compactGapsRef = useRef<number | null>(null);
    const controlsWidth = () =>
      (leadControlsRef.current?.offsetWidth ?? 0) + (trailControlsRef.current?.offsetWidth ?? 0);
    const measureComposerLayout = useCallback(() => {
      const editor = editorRef.current;
      const grid = composerGridRef.current;
      // A hidden composer (a closed panel) has nothing to measure.
      if (!editor || !grid || grid.clientWidth === 0) return;
      const style = getComputedStyle(editor);
      const lineHeight = parseFloat(style.lineHeight) || 22;
      const multiLine = editor.scrollHeight > lineHeight * 1.5;
      if (!expandedLayoutRef.current) {
        const textRoom =
          editor.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
        compactGapsRef.current = grid.clientWidth - textRoom - controlsWidth();
        setTextWraps(multiLine);
        return;
      }
      // An empty composer shows its placeholder, which expands it like text
      // when it does not fit the compact row; a range over the empty editor
      // would measure nothing and fold it back.
      const empty = editor.childNodes.length === 0;
      const range = document.createRange();
      range.selectNodeContents(editor);
      const textWidth = empty
        ? placeholderWidth(editor.getAttribute("aria-placeholder") ?? "", style)
        : range.getBoundingClientRect().width;
      const compactRoom = grid.clientWidth - controlsWidth() - (compactGapsRef.current ?? 24);
      setTextWraps(multiLine || textWidth > compactRoom - 1);
    }, []);
    useEffect(() => {
      const editor = editorRef.current;
      const top = surfaceTopRef.current;
      const grid = composerGridRef.current;
      if (!editor || !top || !grid) return;
      // Text filled or cleared from outside (dictation, a draft, a send)
      // changes the editor's size without an input event.
      const editorObserver = new ResizeObserver(() => measureComposerLayout());
      editorObserver.observe(editor);
      // The controls change width on their own (Stop gives way to Send when
      // a reply ends): the room they leave the text is weighed again.
      for (const controls of [leadControlsRef.current, trailControlsRef.current]) {
        if (controls) editorObserver.observe(controls);
      }
      // The natural height, from what keeps its own size whatever height the
      // surface is animating through: the context row, the text (capped like
      // its scroll area) and the controls. The grid itself stretches.
      const contentObserver = new ResizeObserver(() => measureSurfaceRef.current());
      contentObserver.observe(top);
      contentObserver.observe(editor);
      for (const controls of [leadControlsRef.current, trailControlsRef.current]) {
        if (controls) contentObserver.observe(controls);
      }
      return () => {
        editorObserver.disconnect();
        contentObserver.disconnect();
      };
    }, [measureComposerLayout]);
    useLayoutEffect(() => {
      measureComposerLayout();
    }, [expandedLayout, isEmpty, measureComposerLayout]);
    const measureSurfaceRef = useRef(() => {});
    measureSurfaceRef.current = () => {
      const top = surfaceTopRef.current;
      const editor = editorRef.current;
      // The text's scroll area, whose paddings frame it.
      const text = editor?.parentElement;
      if (!top || !editor || !text) return;
      const style = getComputedStyle(text);
      const textHeight = Math.min(
        COMPOSER_TEXT_MAX_HEIGHT,
        editor.offsetHeight + (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0),
      );
      const controls = Math.max(
        leadControlsRef.current?.offsetHeight ?? 0,
        trailControlsRef.current?.offsetHeight ?? 0,
      );
      const grid = expandedLayoutRef.current ? textHeight + controls : Math.max(textHeight, controls);
      setSurfaceHeight(top.offsetHeight + grid);
    };
    // The paddings change with the layout: weigh the height again.
    useLayoutEffect(() => {
      measureSurfaceRef.current();
    }, [expandedLayout]);
    // The caret moves when the layout switches and while the height animates:
    // an open menu follows it, then settles once the transition ends.
    useLayoutEffect(() => {
      measureCaretAnchor();
    }, [expandedLayout, surfaceHeight, measureCaretAnchor]);
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
      publishDraft();
    }, [publishDraft]);

    const insertSlashOption = useCallback(
      (option: SlashMenuOption) => {
        if (option.kind === "skill") {
          const activeQuery = readSlash();
          if (activeQuery) placeSkill(option.skill, activeQuery);
        } else {
          insertCommand(option);
        }
      },
      [insertCommand, placeSkill, readSlash],
    );

    /** The command actually placed at the top of the message, if there is one. */
    const collectCommand = useCallback((): AssistantCommandId | undefined => {
      const node =
        editorRef.current?.querySelector<HTMLElement>("[data-command-id]");
      return (node?.dataset.commandId as AssistantCommandId | undefined) ?? undefined;
    }, []);

    const handleSubmit = useCallback(() => {
      const value = serializeContent();
      if (!value || disabled || sendDisabled || uploads.uploading) return;
      const accepted = onSend(
        value,
        uploads.inputs,
        collectMentions(),
        collectCommand(),
        collectSkills(),
      );
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
      collectSkills,
    ]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (
          e.key === "Backspace" &&
          editorRef.current &&
          deleteComposerTokenBeforeCaret(
            editorRef.current,
            window.getSelection(),
            "[data-skill-path]",
          )
        ) {
          e.preventDefault();
          setSlashQuery(null);
          setIsEmpty(!editorRef.current.textContent?.trim());
          syncSkillSlots();
          publishDraft();
          return;
        }
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
            insertSlashOption(slashOptions[activeSlash]);
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
          // The arrows walk the options and the “Close menu” row under
          // them, in one cycle (lib/suggestion-menu.ts).
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setMentionIndex(
              stepSuggestion(activeMention, mentionOptions.length, e.key === "ArrowUp" ? "up" : "down"),
            );
            return;
          }
          // Nothing highlighted (only the status row is showing): Enter
          // keeps its own meaning.
          if (activeMention >= 0 && (e.key === "Enter" || e.key === "Tab")) {
            e.preventDefault();
            if (activeMention === mentionOptions.length) closeMentionMenu();
            else insertMention(mentionOptions[activeMention]);
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            closeMentionMenu();
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
        closeMentionMenu,
        slashOpen,
        slashOptions,
        activeSlash,
        insertSlashOption,
        publishDraft,
        syncSkillSlots,
      ]
    );

    const handleInput = useCallback(() => {
      const el = editorRef.current;
      if (!el) return;
      const empty = !el.textContent?.trim();
      setIsEmpty(empty);
      measureComposerLayout();

      if (empty && el.innerHTML !== "") {
        el.innerHTML = "";
      }
      refreshMention();
      refreshSlash();
      syncMentionSlots();
      syncSkillSlots();
      publishDraft();
    }, [measureComposerLayout, publishDraft, refreshMention, refreshSlash, syncMentionSlots, syncSkillSlots]);

    /**
     * Pastes only the text provided by the clipboard. The editors of
     * code (including VS Code) often also provide a `text/html` version
     * enriched with spans and styles; let the browser insert it into the
     * contentEditable would bring this DOM into the composer. A text node
     * unique preserves markdown characters and newlines, without
     * import this foreign formatting.
     */
    /** A pill at the caret, followed by a space (a pasted typed mention). */
    const insertPill = useCallback(
      (option: MentionOption) => {
        const el = editorRef.current;
        if (!el) return;
        const selection = window.getSelection();
        const range = document.createRange();
        if (selection && selection.rangeCount > 0 &&
            el.contains(selection.getRangeAt(0).commonAncestorContainer)) {
          range.setStart(selection.getRangeAt(0).startContainer, selection.getRangeAt(0).startOffset);
          range.setEnd(selection.getRangeAt(0).endContainer, selection.getRangeAt(0).endOffset);
        } else {
          range.selectNodeContents(el);
          range.collapse(false);
        }
        range.deleteContents();
        const pill = createMentionNode(option);
        const space = document.createTextNode(" ");
        range.insertNode(space);
        range.insertNode(pill);
        range.setStartAfter(space);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
        setIsEmpty(false);
        syncMentionSlots();
        publishDraft();
        el.focus();
      },
      [publishDraft, syncMentionSlots],
    );

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
        syncSkillSlots();
        publishDraft();
        el.focus();
      },
      [publishDraft, refreshMention, refreshSlash, syncMentionSlots, syncSkillSlots],
    );

    const handlePaste = useCallback(
      (e: React.ClipboardEvent<HTMLDivElement>) => {
        if (canAttach && userId && e.clipboardData.files.length > 0) {
          e.preventDefault();
          uploads.addFiles(e.clipboardData.files);
          return;
        }

        // Never let the browser choose `text/html` for a text paste. The plain
        // representation is the source of truth for markdown messages — except
        // for typed mentions (MIN-734), which a copied description, comment or
        // page carries as `mention:` links: they come back as pills with their
        // ids, as if picked from the menu.
        const html = e.clipboardData.getData("text/html");
        const text = e.clipboardData.getData("text/plain") || e.clipboardData.getData("text");
        e.preventDefault();
        const pieces = pastedMentionPieces(html, text);
        if (!pieces.some((piece) => typeof piece !== "string")) {
          if (text) insertPlainText(text);
          return;
        }
        const known = new Map((mentionables ?? []).map((option) => [`${option.type}:${option.id}`, option]));
        for (const piece of pieces) {
          if (typeof piece === "string") {
            if (piece) insertPlainText(piece);
            continue;
          }
          const option = known.get(`${piece.type}:${piece.id}`);
          if (option) insertPill(option);
          else insertPlainText(`@${piece.label}`);
        }
      },
      [canAttach, insertPill, insertPlainText, mentionables, uploads, userId],
    );

    // Dictated text is additive: appended after the existing content, caret at
    // the end (same behavior as AutoKap's composer). It joins as a text node:
    // rewriting `textContent` would flatten the mention pills into their text.
    const appendDictated = useCallback((text: string) => {
      const el = editorRef.current;
      if (!el) return;
      // The line break a contenteditable keeps at its end would push the
      // dictation onto a new line.
      if (el.lastChild instanceof HTMLBRElement) el.lastChild.remove();
      const current = el.textContent ?? "";
      const separator = current.trim() && !/\s$/.test(current) ? " " : "";
      el.appendChild(document.createTextNode(`${separator}${text}`));
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
      publishDraft();
    }, [publishDraft]);

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
          publishDraft();
        },
        focus() {
          const el = editorRef.current;
          if (el) focusContentEditableAtEnd(el);
        },
        append: appendDictated,
      }),
      [publishDraft, appendDictated]
    );

    useEffect(() => {
      if (noBorder && allowInputAutoFocus() && editorRef.current) {
        editorRef.current.focus();
      }
    }, [noBorder]);

    // A surface remount restores the same DOM tokens and upload queue. Avoid
    // writing when this editor produced the snapshot so the caret stays put.
    useEffect(() => {
      const el = editorRef.current;
      if (draftHtml === undefined || !el || el.innerHTML === draftHtml) return;
      if (publishedDraftRef.current === draftHtml) return;
      el.innerHTML = draftHtml;
      publishedDraftRef.current = draftHtml;
      setIsEmpty(!el.textContent?.trim());
      syncMentionSlots();
      syncSkillSlots();
      if (restoreCaretAtEnd) {
        requestAnimationFrame(() => {
          if (editorRef.current === el && el.isConnected) {
            focusContentEditableAtEnd(el);
          }
        });
      }
    }, [draftHtml, restoreCaretAtEnd, syncMentionSlots, syncSkillSlots]);

    // One-shot pre-filling (editing): we write the initial text, caret in
    // fine, ready for editing — the Agent Launch Composer uses this to
    // pre-write “Works on MIN-42”.
    useEffect(() => {
      const el = editorRef.current;
      if (!initialValue || !el) return;
      el.textContent = initialValue;
      setIsEmpty(false);
      publishDraft();
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
      focusContentEditableAtEnd(el);
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
        if (
          target.closest('[data-slot="popover-content"], [role="dialog"]') &&
          !e.currentTarget.contains(target)
        ) {
          return;
        }
        e.preventDefault();
        focusEditorAtEnd();
      },
      [focusEditorAtEnd]
    );

    return (
      <div
        ref={rootRef}
        className={cn(
          "relative",
          noBorder ? "px-3 pb-3" : "px-3 py-3",
          className,
        )}
        onMouseDown={handleContainerMouseDown}
        onKeyDownCapture={handleAttachShortcut}
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
              status={
                option.status ??
                (option.objectiveStatus
                  ? OBJECTIVE_STATUS_MAP[option.objectiveStatus].issueStatus
                  : undefined)
              }
            />,
            el,
            // Two mentions of the SAME person in a message: the key takes
            // the rank, otherwise React would see the same thing twice.
            `${option.type}:${option.id}:${index}`,
          ),
        )}
        {skillSlots.map(({ el, skill }) =>
          createPortal(
            <SkillChip
              name={skill.name}
              onClick={loadSkill ? () => setPreviewSkill(skill) : undefined}
            />,
            el,
            repositorySkillKey(skill),
          ),
        )}
        {loadSkill ? (
          <SkillPreviewDialog
            skill={previewSkill}
            open={previewSkill !== null}
            onOpenChange={(open) => {
              if (!open) setPreviewSkill(null);
            }}
            loadSkill={loadSkill}
          />
        ) : null}
        {/* The list of mentions lives OUTSIDE the surface of the composer: this one
 is `overflow-hidden` (the border, the drop zone), it would cut it. */}
        {mentionOpen && (
          <MentionSuggestions
            options={mentionOptions}
            semanticStatus={mentionSemanticStatus}
            activeIndex={activeMention}
            onPick={insertMention}
            onHover={setMentionIndex}
            onClose={() => {
              closeMentionMenu();
              editorRef.current?.focus();
            }}
            className="left-3"
            style={menuPlacement("16rem")}
          />
        )}
        {/* The command/skill menu shares the mention list's floating position.
        Skills open for “/” or “$” at the caret; commands require “/” at the start. */}
        {slashOpen && (
          <SlashMenu
            options={slashOptions}
            prefix={slashQuery?.prefix ?? "/"}
            activeIndex={activeSlash}
            onPick={insertSlashOption}
            onHover={setSlashIndex}
            className="left-3"
            style={menuPlacement("18rem")}
          />
        )}
        {/* `keepMounted`: the dial must NEVER be reassembled when the border
 turns on or off — otherwise the editor loses focus (the FocusScope of the
 Sheet then rests it on the shell) and the text typed during the
 response disappears. */}
        {mergedContext && contextPlacement === "above" ? (
          <div className="relative z-0 mx-3 -mb-7 flex min-h-[70px] items-start rounded-t-[1.5rem] bg-muted/60 px-2 pt-2 dark:bg-muted/35">
            {mergedContext}
          </div>
        ) : null}
        <AgentBeam active={!!beam} keepMounted className="relative z-10 rounded-[1.625rem]">
        <div
          data-composer-layout={expandedLayout ? "expanded" : "compact"}
          className={cn(
            // No focus ring, no border: the Numo composer
            // is a borderless `bg-control` surface (the editor caret is the
            // signal), brand colors are kept for drag feedback only.
            "chat-input-surface relative overflow-hidden rounded-[1.625rem] bg-control",
            // The context row is pinned to the top and the controls row to
            // the bottom: while the height animates, both keep their gutter
            // to their edge, and only the text between them moves.
            "flex flex-col",
            "transition-[height,box-shadow] duration-200 ease-out motion-reduce:transition-none",
            drop.dragging && "ring-2 ring-brand/20"
          )}
          style={surfaceHeight === null ? undefined : { height: surfaceHeight }}
          onTransitionEnd={(event) => {
            if (event.target === event.currentTarget && event.propertyName === "height") measureCaretAnchor();
          }}
          {...(canAttach ? drop.handlers : {})}
        >
          <DropOverlay show={canAttach && drop.dragging} />
          <div ref={surfaceTopRef} className="shrink-0">
          {/* The host can merge semantic context and attachments into this
          single adaptive row. Concentric nesting: its rounded-md pills sit
          behind a 10px gutter. */}
          {contextPlacement === "inside" ? mergedContext : null}
          {!contextIncludesAttachments && standaloneAttachmentItems.length > 0 && (
            <div className="px-2.5 pt-2.5">
              <ScrollableContextRow items={standaloneAttachmentItems} />
            </div>
          )}
          </div>
          {/* The grid fills what the context row leaves: the text row takes
              the height the surface is animating through (its content
              scrolls), so the text keeps its gutter to the top edge as the
              controls keep theirs to the bottom one. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            ref={composerGridRef}
            className={cn(
              "grid min-h-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-end",
              expandedLayout
                ? "grid-rows-[minmax(0,1fr)_auto] [grid-template-areas:'text_text_text'_'lead_._trail']"
                : "grid-rows-[minmax(0,1fr)] [grid-template-areas:'lead_text_trail'] items-center",
            )}
          >
          <div
            ref={textScrollRef}
            {...textScrollProps}
            className={cn(
              "relative max-h-[180px] min-h-0 self-stretch overflow-y-auto [grid-area:text]",
              // Compact: one pixel lower than the box's centre, since the font's
              // ascent is taller than its descent and the text otherwise rides
              // above the "+" beside it.
              expandedLayout ? "px-4 pb-1 pt-3" : "px-1 pt-[15px] pb-[13px]",
            )}
          >
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
              onBlur={() => {
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

            <div
              ref={leadControlsRef}
              className={cn(
                "flex min-w-0 items-center gap-1.5 [grid-area:lead]",
                expandedLayout ? "pb-2.5 pl-2.5 pt-1" : "py-2.5 pl-2.5",
              )}
            >
              {canAdd && (
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
                  {hasMentionMenu || hasSkillMenu || hasMcpMenu ? (
                    <div ref={addMenuAnchorRef} className="shrink-0">
                      <SearchMenu
                        open={addMenuOpen}
                        onOpenChange={handleAddMenuOpenChange}
                        align="start"
                        container={addMenuContainer}
                        tooltip={
                          hasSkillMenu
                            ? t("addFilesContextOrSkills")
                            : t("addFilesOrContext")
                        }
                        searchPlaceholder={
                          hasSkillMenu ? t("addContextOrSkills") : t("addContext")
                        }
                        searchValue={addMenuQuery}
                        onSearchValueChange={setAddMenuQuery}
                        shouldFilter={false}
                        hideEmpty={hasMcpMenu}
                        contentClassName="w-80"
                        trigger={
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            disabled={disabled}
                            className="h-8 w-8 shrink-0 rounded-full text-muted-foreground"
                            aria-label={
                              hasSkillMenu
                                ? t("addFilesContextOrSkills")
                                : t("addFilesOrContext")
                            }
                          >
                            <HugeiconsIcon icon={Add01Icon} className="size-4" />
                          </Button>
                        }
                      >
                        {canAttach && (
                          <CommandGroup>
                            <CommandItem
                              forceMount
                              value={tAttach("addFiles")}
                              disabled={!userId}
                              aria-keyshortcuts="Meta+Shift+A Control+Shift+A"
                              onSelect={() => {
                                fileInputRef.current?.click();
                                setAddMenuOpen(false);
                                setAddMenuQuery("");
                              }}
                              className="gap-2"
                            >
                              <HugeiconsIcon icon={AttachmentIcon} className="size-4 text-muted-foreground" />
                              {tAttach("addFiles")}
                              <CommandShortcut className="inline-flex items-center gap-0.5 tracking-normal">
                                <Kbd size="sm">{modKey}</Kbd>
                                <Kbd size="sm">
                                  {modKey === "⌘" ? "⇧" : "Shift"}
                                </Kbd>
                                <Kbd size="sm">
                                  {ATTACHMENT_SHORTCUT_KEY.toUpperCase()}
                                </Kbd>
                              </CommandShortcut>
                            </CommandItem>
                          </CommandGroup>
                        )}
                        {canAttach &&
                          (addContextOptions.length > 0 ||
                            addMenuSkillOptions.length > 0 ||
                            hasMcpMenu) && <CommandSeparator />}
                        {addMenuSkillOptions.length > 0 && (
                          <CommandGroup heading={t("skills")}>
                            {addMenuSkillOptions.map((option) => (
                              <CommandItem
                                key={option.id}
                                value={`${option.label} ${option.description}`}
                                onSelect={() => placeSkill(option.skill)}
                                className="gap-2"
                              >
                                <HugeiconsIcon icon={Layers01Icon} className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                <span className="min-w-0">
                                  <span className="block truncate">{option.label}</span>
                                  <span className="block truncate text-xs text-muted-foreground">
                                    {option.description}
                                  </span>
                                </span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                        {hasMcpMenu && addMenuSkillOptions.length > 0 && (
                          <CommandSeparator />
                        )}
                        {userId && (
                          <McpMenuGroup
                            userId={userId}
                            query={addMenuQuery}
                            onNavigate={() => {
                              setAddMenuOpen(false);
                              setAddMenuQuery("");
                              onNavigate?.();
                            }}
                          />
                        )}
                        {addContextOptions.length > 0 &&
                          (addMenuSkillOptions.length > 0 || hasMcpMenu) && <CommandSeparator />}
                        {addContextOptions.length > 0 && (
                          <CommandGroup>
                            {addContextOptions.filter((option) => !option.semantic).map((option) => (
                              <CommandItem
                                key={`${option.type}:${option.id}`}
                                value={`${option.label} ${option.detail ?? ""} ${(option.keywords ?? []).join(" ")}`}
                                onSelect={() => addContextOption(option)}
                                className="gap-2"
                              >
                                <MentionFigure option={option} />
                                <span className="min-w-0 truncate">
                                  {option.label}
                                  {option.detail && (
                                    <span className="ml-1.5 text-muted-foreground">
                                      {option.detail}
                                    </span>
                                  )}
                                </span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                        {addContextOptions.some((option) => option.semantic) && (
                          <CommandGroup heading={tPicker("relatedByMeaning")}>
                            {addContextOptions.filter((option) => option.semantic).map((option) => (
                              <CommandItem
                                key={`semantic:${option.type}:${option.id}`}
                                value={`semantic:${option.id}`}
                                onSelect={() => addContextOption(option)}
                                className="gap-2"
                              >
                                <MentionFigure option={option} />
                                <span className="min-w-0 truncate">
                                  {option.label}
                                  {option.detail && (
                                    <span className="ml-1.5 text-muted-foreground">
                                      {option.detail}
                                    </span>
                                  )}
                                </span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                        {addContextSemanticStatus && (
                          <SemanticSearchingHint status={addContextSemanticStatus} data-semantic-group="" />
                        )}
                      </SearchMenu>
                    </div>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            disabled={disabled || !userId}
                            onClick={() => fileInputRef.current?.click()}
                            className="h-8 w-8 shrink-0 rounded-full text-muted-foreground"
                            aria-label={tAttach("addFiles")}
                            aria-keyshortcuts="Meta+Shift+A Control+Shift+A"
                          >
                            <HugeiconsIcon icon={Add01Icon} className="size-4" />
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top">{tAttach("addFiles")}</TooltipContent>
                    </Tooltip>
                  )}
                </>
              )}
            </div>
            <div
              ref={trailControlsRef}
              className={cn(
                "flex shrink-0 items-center gap-1.5 [grid-area:trail]",
                expandedLayout ? "pb-2.5 pr-2.5 pt-1" : "py-2.5 pr-2.5",
              )}
            >
              {leadingControls}
              {/* Dictation stays during a response: the next message can be
                  spoken while Numo is still writing this one. */}
              <DictateButton
                context="assistant_message"
                onTranscription={appendDictated}
                disabled={disabled}
                className={canAttach ? "-ml-0.5" : undefined}
              />
              {isStreaming && (isEmpty || !sendWhileStreaming) ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="default"
                      onClick={onAbort}
                      aria-label={t("stop")}
                      // The accent, like the send button it replaces.
                      className="h-8 w-8 shrink-0 rounded-full"
                    >
                      <HugeiconsIcon icon={SquareIcon} className="h-3 w-3 fill-current" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{t("stop")}</TooltipContent>
                </Tooltip>
              ) : (
                <>
                  {!isEmpty &&
                    (sendDisabled && sendDisabledTooltip ? (
                      // Sending blocked with explanation: a native <button disabled>
                      // no longer emits pointer events (the Radix tooltip no longer emits
                      // would never open) → same assembly as the locked chip
                      // of a compact picker, the outer <span> carries the hover.
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex cursor-not-allowed">
                            <span
                              aria-label={t("send")}
                              aria-disabled="true"
                              className="pointer-events-none inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground"
                            >
                              <HugeiconsIcon icon={ArrowUp01Icon} className="h-3.5 w-3.5" />
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
        </div>
        </AgentBeam>
      </div>
    );
  }
);
