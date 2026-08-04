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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
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
import { AttachmentPills, DropOverlay, useFileDrop } from "@/components/attachments";
import { useAttachmentUploads } from "@/lib/use-attachment-uploads";
import { useAuth } from "@/lib/auth-context";
import type { AssistantCommandId, AssistantMention } from "@/lib/assistant-types";
import type { AttachmentInput } from "@/lib/types";

/** What the "+" offers Numo: files it can actually read (images, PDF, CSV,
    text-ish) — MIN-24 scope. */
const ACCEPT =
  "image/*,application/pdf,text/csv,text/plain,text/markdown,application/json,.csv,.txt,.md,.json,.log";

/** L'enveloppe d'une mention dans l'éditeur : un nœud NON éditable, vide, dans
    lequel React porte la vraie pilule (MentionChip). Le composer ne redessine
    donc pas une pilule « comme » celle du contexte — c'est la même. */
const MENTION_SLOT_CLASS = "inline-flex align-middle";

/** La pilule d'une commande « / » posée en tête du message : même géométrie que
    la pilule de mention, sans figure — le « / » suffit à dire ce qu'elle est.
    Elle porte son texte directement (pas de portail : rien à re-rendre). */
const COMMAND_PILL_CLASS =
  "mx-0.5 inline-flex items-center rounded-full bg-(--mention-chip) px-2 py-[3px] align-middle text-[0.95em] font-medium leading-4 text-primary";

/** Ce qu'une enveloppe sait dire d'elle-même : de quoi la re-rendre sans rien
    d'autre que le DOM (une annulation ⌘Z peut la restituer bien après coup). */
const MENTION_TYPES: ReadonlySet<string> = new Set([
  "member",
  "project",
  "issue",
  "objective",
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
    ...(node.dataset.mentionIcon ? { iconUrl: node.dataset.mentionIcon } : {}),
    ...(node.dataset.mentionColor ? { color: node.dataset.mentionColor } : {}),
  };
}

interface ChatInputProps {
  onSend: (
    message: string,
    attachments: AttachmentInput[],
    mentions: AssistantMention[],
    /** La commande « / » posée en tête du message, quand il y en a une. */
    command?: AssistantCommandId,
  ) => void;
  onAbort?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  noBorder?: boolean;
  placeholder?: string;
  /**
   * Posé sur la boîte extérieure du composer. Elle porte une gouttière de 12 px
   * (`px-3`) qui lui sert de marge de clic dans le panneau de Numo, où rien
   * d'autre n'en donne. Dans une colonne qui a déjà la sienne — les réglages —
   * cette gouttière rétrécit le composer par rapport aux cartes d'à côté : on
   * l'annule avec `px-0` plutôt que de la compenser d'un `-mx-3`, qui le ferait
   * déborder de la colonne (MIN-167).
   */
  className?: string;
  /**
   * Hide the attach affordances (file button + drop overlay + paste-to-attach).
   * The home composer sets this: it hands the prompt off to the global panel via
   * `open({ prompt })`, which carries no files, so an attach button there would
   * silently drop the upload. Attachments still belong in the panel itself.
   */
  hideAttach?: boolean;
  /**
   * Rangée de contexte posée en haut du composer, au-dessus du texte (les
   * pilules de contexte de Numo et le bouton @). Elle vit chez l'appelant : le
   * composer ne sait rien de ce qu'elle porte, il lui prête juste sa place —
   * dont le rayon est calculé pour un emboîtement concentrique.
   */
  contextSlot?: ReactNode;
  /**
   * Les entités citables par « @ » dans le texte. Vide/absent = pas de
   * mentions du tout (les composers hors Numo). La liste peut arriver après
   * coup : `onMentionQuery` prévient l'hôte dès qu'une mention se tape, ce qui
   * lui laisse la charger à ce moment-là et pas avant.
   */
  mentionables?: MentionOption[];
  onMentionQuery?: (active: boolean) => void;
  /**
   * Les commandes « / » proposées quand le message COMMENCE par un slash.
   * Vide/absent = pas de menu slash du tout (les composers hors du shell Numo).
   * Choisir une commande la pose en pilule non éditable en tête du message ;
   * son id canonique part avec l'envoi (4e argument d'`onSend`).
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
   * Liseré animé « réponse en cours » autour de la surface (même effet que les
   * cartes d'issue). Le chat Numo et la conversation de l'agent l'activent tant
   * qu'une réponse se génère.
   */
  beam?: boolean;
  /**
   * Pendant une réponse en cours (`isStreaming`), autorise l'ENVOI : le bouton Stop
   * n'apparaît que si l'input est vide ; dès qu'on tape, il devient un bouton
   * d'envoi. L'agent conversationnel l'active (envoyer = interrompre + steerer en
   * priorité). Défaut : off (le chat Numo garde Stop tant qu'il génère).
   */
  sendWhileStreaming?: boolean;
  /**
   * Bloque UNIQUEMENT l'envoi (saisie libre, Entrée inerte) : le bouton devient
   * un chip inactif porteur de `sendDisabledTooltip`, qui explique quoi faire
   * d'abord. Le composer carnet s'en sert tant qu'aucun projet n'est choisi.
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
    const tAttach = useTranslations("Attachments");
    const effectivePlaceholder = placeholder ?? t("inputPlaceholder");
    const editorRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isEmpty, setIsEmpty] = useState(true);
    const [isFocused, setIsFocused] = useState(false);
    const { user } = useAuth();
    const userId = user?.id;
    const uploads = useAttachmentUploads(() => `chat/${userId}`, { max: 5 });
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

          // Une mention s'écrit « @Nom » dans le message même si la pilule ne
          // montre que le nom : côté modèle, c'est l'arobase qui la signale (et
          // c'est sur elle que la bulle re-place la pilule à la relecture).
          if (element.dataset.mentionLabel) {
            parts.push(`@${element.dataset.mentionLabel}`);
            return;
          }

          // Une commande s'écrit « /libellé » — le texte que la pilule montre
          // déjà, mais lu depuis sa donnée : le rendu peut évoluer sans changer
          // ce qui part dans le message.
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
    // La requête se lit dans le NŒUD TEXTE sous le caret : c'est le seul
    // endroit où « @quelque chose » est encore en train de s'écrire. Les
    // mentions déjà posées sont des <span contenteditable=false> — le caret ne
    // rentre pas dedans, elles s'effacent d'un bloc, et elles ne peuvent donc
    // pas être relues comme une requête en cours.
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionIndex, setMentionIndex] = useState(0);
    // Les enveloppes présentes dans l'éditeur, relues DEPUIS LE DOM : c'est lui
    // qui fait foi (une annulation ⌘Z rend un nœud que React ne suivait plus).
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
      // Un « @ » en début de mot uniquement — pas celui d'une adresse e-mail.
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

    // Le passage « on tape une mention » ↔ « on n'en tape plus » se signale une
    // seule fois à l'hôte (il s'en sert pour charger la liste au bon moment) :
    // d'où le miroir, plutôt qu'un effet caché dans un updater de state.
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

    // La requête change → on repart de la première suggestion.
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
        if (option.iconUrl) pill.dataset.mentionIcon = option.iconUrl;
        if (option.color) pill.dataset.mentionColor = option.color;
        pill.className = MENTION_SLOT_CLASS;
        range.insertNode(pill);

        // Espace insécable après la pilule : sans lui, le caret se retrouve
        // collé à un nœud non éditable et la frappe suivante repart de travers.
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

    /** Les mentions réellement posées dans le texte, dédoublonnées. */
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
        });
      }
      return out;
    }, []);

    // ── Commandes « / » ─────────────────────────────────────────────
    // Le menu ne vit que tant que le message ENTIER est « /requête » : une
    // seule ligne de texte nu, pas de pilule déjà posée. La détection se relit
    // donc depuis l'éditeur complet — pas depuis le caret comme les mentions :
    // une commande n'existe qu'en tête de message.
    const [slashQuery, setSlashQuery] = useState<string | null>(null);
    const [slashIndex, setSlashIndex] = useState(0);

    const readSlash = useCallback((): string | null => {
      if (!commands?.length) return null;
      const el = editorRef.current;
      if (!el) return null;
      // Que des nœuds texte — pas de pilule déjà posée, pas de retour à la
      // ligne. Le <br> que le navigateur laisse parfois traîner en fin
      // d'éditeur ne compte pas ; ailleurs, c'est un vrai saut de ligne.
      const nodes = [...el.childNodes];
      const last = nodes[nodes.length - 1];
      if (last instanceof HTMLElement && last.tagName === "BR") nodes.pop();
      if (nodes.some((n) => n.nodeType !== Node.TEXT_NODE)) return null;
      const text = nodes.map((n) => n.textContent ?? "").join("");
      return text.startsWith("/") ? text.slice(1) : null;
    }, [commands]);

    // Relue sur la frappe uniquement : Échap ferme le menu, et il ne se rouvre
    // qu'au prochain caractère tapé — pas au moindre déplacement du caret.
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

    // La requête change → on repart de la première commande.
    useEffect(() => setSlashIndex(0), [slashQuery]);

    const insertCommand = useCallback((option: SlashCommandOption) => {
      const el = editorRef.current;
      if (!el) return;
      // Le composer ne contient que « /requête » (condition d'ouverture du
      // menu) : tout est remplacé par la pilule, suivie de l'espace insécable
      // qui rend un nœud éditable au caret — même geste que les mentions.
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

    /** La commande réellement posée en tête du message, s'il y en a une. */
    const collectCommand = useCallback((): AssistantCommandId | undefined => {
      const node =
        editorRef.current?.querySelector<HTMLElement>("[data-command-id]");
      return (node?.dataset.commandId as AssistantCommandId | undefined) ?? undefined;
    }, []);

    const handleSubmit = useCallback(() => {
      const value = serializeContent();
      if (!value || disabled || sendDisabled || uploads.uploading) return;
      onSend(value, uploads.inputs, collectMentions(), collectCommand());
      clearEditor();
      uploads.clear();
      // Le caret reste dans le composer après l'envoi. Sans ça le focus s'échappe
      // (vider un contentEditable le perd ; cliquer Envoyer focus un bouton qui
      // disparaît juste après), et dans le panneau Numo le FocusScope du Sheet le
      // rapatriait sur la coquille — d'où un halo de focus autour du panneau.
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
        // Menu slash ouvert : même contrat clavier que la liste de mentions.
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
        // Liste de mentions ouverte : les flèches et Entrée lui appartiennent —
        // sinon le caret sortirait de la requête (ou le message partirait).
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
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSubmit();
        }
      },
      [
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

    // Pré-remplissage one-shot (montage) : on écrit le texte initial, caret en
    // fin, prêt à être édité — le composer de lancement d'agent s'en sert pour
    // pré-écrire « Travaille sur MIN-42 ».
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
      // Volontairement au montage uniquement (pas de resync sur changement).
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
        // Un menu porté hors du composer (le popover d'ajout de contexte) reste
        // son ENFANT React : ses événements remontent jusqu'ici. Sans ce
        // garde-fou, cliquer une entrée du menu rendait le focus à l'éditeur —
        // et Radix, voyant le focus partir, refermait le menu aussitôt.
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
        {/* Chaque mention posée dans le texte reçoit SA pilule, portée dans son
            enveloppe : même composant que dans la bulle envoyée, donc jamais
            deux dessins à faire vivre en parallèle. */}
        {mentionSlots.map(({ el, option }, index) =>
          createPortal(
            <MentionChip
              type={option.type}
              id={option.id}
              label={option.label}
              avatarSeed={option.avatarSeed}
              iconUrl={option.iconUrl}
              color={option.color}
            />,
            el,
            // Deux mentions de la MÊME personne dans un message : la clé prend
            // le rang, sinon React en verrait deux fois la même.
            `${option.type}:${option.id}:${index}`,
          ),
        )}
        {/* La liste de mentions vit HORS de la surface du composer : celle-ci
            est `overflow-hidden` (le liseré, la zone de dépôt), elle la
            couperait. */}
        {mentionOpen && (
          <MentionSuggestions
            options={mentionOptions}
            activeIndex={activeMention}
            onPick={insertMention}
            onHover={setMentionIndex}
            className="left-3"
          />
        )}
        {/* Le menu slash partage la place (et les raisons d'être hors de la
            surface) de la liste de mentions ; les deux ne peuvent pas être
            ouverts en même temps — l'un exige un « / » en tête de message nu,
            l'autre un « @ » en cours de frappe. */}
        {slashOpen && (
          <SlashMenu
            options={slashOptions}
            activeIndex={activeSlash}
            onPick={insertCommand}
            onHover={setSlashIndex}
            className="left-3"
          />
        )}
        {/* `keepMounted` : le composer ne doit JAMAIS être remonté quand le liseré
            s'allume ou s'éteint — sinon l'éditeur perd le focus (le FocusScope du
            Sheet le repose alors sur la coquille) et le texte tapé pendant la
            réponse disparaît. */}
        <AgentBeam active={!!beam} keepMounted className="rounded-2xl">
        <div
          className={cn(
            "chat-input-surface relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all",
            drop.dragging
              ? "border-brand ring-2 ring-brand/20"
              : isFocused
                ? "border-brand/40 ring-2 ring-brand/10"
                : "border-border"
          )}
          {...(hideAttach ? {} : drop.handlers)}
        >
          <DropOverlay show={drop.dragging} />
          {/* Rangée de contexte (pilules + bouton @), fournie par l'hôte. Elle
              défile à l'horizontale et garde donc sa propre rangée : les
              pièces jointes, elles, s'empilent en dessous. Emboîtement
              concentrique : la surface est en rounded-2xl (--radius-2xl =
              --radius + 8px = 24px), donc une pilule en rounded-md
              (--radius - 2px = 14px) + les 10px (p-2.5) qui la séparent du
              bord === 24px. */}
          {contextSlot}
          {uploads.pending.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-2.5 pt-2.5">
              <AttachmentPills
                pillClassName="rounded-md shadow-none"
                attachments={uploads.pending.filter((p) => p.status === "done")}
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
              // Le caret peut sortir d'une requête « @ » sans que le texte
              // change (flèches, clic) : on relit après coup.
              onKeyUp={(e) => {
                if (
                  ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(
                    e.key
                  )
                )
                  refreshMention();
              }}
              onClick={refreshMention}
              onPaste={(e) => {
                if (!hideAttach && userId && e.clipboardData.files.length > 0) {
                  e.preventDefault();
                  uploads.addFiles(e.clipboardData.files);
                }
              }}
              onFocus={() => setIsFocused(true)}
              onBlur={() => {
                setIsFocused(false);
                // Léger différé : le clic sur une suggestion se joue avant.
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
            {/* Contrôles de gauche (ex. picker de modèle). Vide → la barre reste
                visuellement identique (le cluster d'envoi collé à droite). */}
            <div className="flex min-w-0 items-center gap-1.5">{leadingControls}</div>
            <div className="flex shrink-0 items-center gap-1.5">
              {isStreaming && (isEmpty || !sendWhileStreaming) ? (
                <Button
                  size="icon-sm"
                  variant="outline"
                  onClick={onAbort}
                  className="h-8 w-8 shrink-0 rounded-full"
                  title={t("stop")}
                >
                  <Square className="h-3 w-3" />
                </Button>
              ) : (
                <>
                  {!isStreaming && !hideAttach && (
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
                  {!isStreaming && (
                    <DictateButton
                      onTranscription={appendDictated}
                      disabled={disabled}
                    />
                  )}
                  {!isEmpty &&
                    (sendDisabled && sendDisabledTooltip ? (
                      // Envoi bloqué avec explication : un <button disabled> natif
                      // n'émet plus d'événements pointeur (le tooltip Radix ne
                      // s'ouvrirait jamais) → même montage que le chip verrouillé
                      // du BranchCombobox, le <span> extérieur porte le hover.
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
                        tooltipLabel={t("send")}
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
